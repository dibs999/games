// Minensucher – Logik ohne DOM-Zugriff: Bretter erzeugen, aufdecken, markieren, lösen.
//
// Ein Brett ist ein Text aus w*h Zeichen: '1' = Mine, '0' = keine. Der Stand ist ein zweiter Text mit
// 'u' (verdeckt), 'f' (Flagge) und 'o' (aufgedeckt). Index = Zeile * w + Spalte.
//
// Jedes erzeugte Brett lässt sich allein mit Logik lösen (ohne Raten), und ein sicherer Startbereich ist schon
// aufgedeckt, damit man nie gleich zu Beginn auf eine Mine trifft.
//
// ACHTUNG: Das Tagesrätsel wird aus dem Datum berechnet und muss für alle gleich sein. Wer die Erzeugung ändert,
// ändert damit alle künftigen Tagesrätsel. Der Test "Tagesrätsel bleibt stabil" fängt das ab.

import { weekday, dayNumber } from '../shared/day.js';
import { makeRandom, hashString, shuffle } from '../shared/random.js';

export { makeRandom, hashString };

export const DIFFICULTIES = {
  easy: { label: 'Leicht', w: 8, h: 8, mines: 10 },
  medium: { label: 'Mittel', w: 12, h: 12, mines: 28 },
  hard: { label: 'Schwer', w: 16, h: 16, mines: 52 },
};
export const DIFFICULTY_KEYS = Object.keys(DIFFICULTIES);

const MAX_ATTEMPTS = 4000;

// ---------- Nachbarn und Zahlen ----------

const neighborCache = new Map();

export function neighbors(i, w, h) {
  const key = `${w}x${h}:${i}`;
  let list = neighborCache.get(key);
  if (!list) {
    list = [];
    const r = Math.floor(i / w);
    const c = i % w;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < h && cc >= 0 && cc < w) list.push(rr * w + cc);
      }
    }
    neighborCache.set(key, list);
  }
  return list;
}

// Wie viele Minen grenzen an jedes Feld.
export function countsOf(mines, w, h) {
  const counts = new Array(w * h).fill(0);
  for (let i = 0; i < w * h; i++) {
    if (mines[i] === '1') for (const n of neighbors(i, w, h)) counts[n] += 1;
  }
  return counts;
}

export const mineCount = (mines) => [...mines].filter((ch) => ch === '1').length;

// ---------- Aufdecken ----------

// Deckt ein Feld auf; Felder ohne angrenzende Mine decken ihre Nachbarn mit auf.
// view ist ein Array aus 'u', 'f', 'o' und wird verändert. Eine Flagge schützt das Feld.
function floodOpen(view, mines, w, h, start, counts) {
  const stack = [start];
  while (stack.length) {
    const i = stack.pop();
    if (view[i] !== 'u') continue;
    view[i] = 'o';
    if (counts[i] === 0) for (const n of neighbors(i, w, h)) if (view[n] === 'u') stack.push(n);
  }
}

// Der Stand zu Beginn: nur der Startbereich ist aufgedeckt.
export function initialView(mines, w, h, start) {
  const view = new Array(w * h).fill('u');
  floodOpen(view, mines, w, h, start, countsOf(mines, w, h));
  return view.join('');
}

export const openedCount = (view) => [...view].filter((ch) => ch === 'o').length;

// ---------- Lösen mit Logik ----------

// Kann man das Brett vom Startbereich aus ohne Raten lösen? Regeln: Zahl erfüllt → Rest sicher;
// Zahl = verbleibende verdeckte Felder → alles Minen; und der Vergleich zweier Zahlen mit
// enthaltenen verdeckten Nachbarn.
export function solvableFrom(mines, w, h, start) {
  const total = w * h;
  const counts = countsOf(mines, w, h);
  const view = new Array(total).fill('u');
  floodOpen(view, mines, w, h, start, counts);
  const known = new Array(total).fill(false); // als Mine erkannt
  const safeTotal = total - mineCount(mines);
  let opened = openedCount(view.join(''));

  const hiddenAround = (i) => neighbors(i, w, h).filter((n) => view[n] === 'u' && !known[n]);
  const knownAround = (i) => neighbors(i, w, h).filter((n) => known[n]).length;

  while (opened < safeTotal) {
    let progress = false;
    const frontier = [];
    for (let i = 0; i < total; i++) {
      if (view[i] !== 'o' || counts[i] === 0) continue;
      const hidden = hiddenAround(i);
      if (hidden.length === 0) continue;
      const remaining = counts[i] - knownAround(i);
      if (remaining === 0) {
        for (const n of hidden) {
          if (view[n] === 'u') {
            floodOpen(view, mines, w, h, n, counts);
            progress = true;
          }
        }
      } else if (remaining === hidden.length) {
        for (const n of hidden) known[n] = true;
        progress = true;
      } else {
        frontier.push({ hidden, remaining });
      }
    }
    if (!progress) {
      // Zwei Zahlen vergleichen: Sind die verdeckten Nachbarn der einen in denen der anderen enthalten,
      // ist der Unterschied der restlichen Minen auf die übrigen Felder verteilt.
      for (const a of frontier) {
        for (const b of frontier) {
          if (a === b || a.hidden.length >= b.hidden.length) continue;
          if (!a.hidden.every((n) => b.hidden.includes(n))) continue;
          const rest = b.hidden.filter((n) => !a.hidden.includes(n));
          const extra = b.remaining - a.remaining;
          if (extra === 0) {
            for (const n of rest) {
              if (view[n] === 'u') {
                floodOpen(view, mines, w, h, n, counts);
                progress = true;
              }
            }
          } else if (extra === rest.length) {
            for (const n of rest) {
              if (!known[n]) {
                known[n] = true;
                progress = true;
              }
            }
          }
        }
      }
    }
    opened = openedCount(view.join(''));
    if (!progress) return false;
  }
  return true;
}

// ---------- Erzeugen ----------

// Erzeugt ein lösbares Brett. Gibt immer dasselbe zurück, wenn random dieselbe Folge liefert.
// Ergebnis: { w, h, mines, start, difficulty }
export function generateBoard(difficulty, random = Math.random) {
  const { w, h, mines: count } = DIFFICULTIES[difficulty];
  const total = w * h;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Der Start liegt nicht am Rand, damit der aufgedeckte Bereich groß genug wird.
    const r = 1 + Math.floor(random() * (h - 2));
    const c = 1 + Math.floor(random() * (w - 2));
    const start = r * w + c;
    const blocked = new Set([start, ...neighbors(start, w, h)]);
    const candidates = [];
    for (let i = 0; i < total; i++) if (!blocked.has(i)) candidates.push(i);
    const chosen = new Set(shuffle(candidates, random).slice(0, count));
    const mines = Array.from({ length: total }, (_, i) => (chosen.has(i) ? '1' : '0')).join('');
    if (solvableFrom(mines, w, h, start)) return { w, h, mines, start, difficulty };
  }
  throw new Error('Kein lösbares Brett gefunden');
}

// ---------- Tagesrätsel ----------

// Mo–Di leicht, Mi–Fr mittel, Sa–So schwer.
const WEEK_PLAN = ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard'];

export function dailyDifficulty(dayKey) {
  return WEEK_PLAN[weekday(dayKey)];
}

export function dailyBoard(dayKey) {
  const difficulty = dailyDifficulty(dayKey);
  const random = makeRandom((hashString(`minensucher-tag-${dayKey}`) ^ dayNumber(dayKey)) >>> 0);
  return { ...generateBoard(difficulty, random), day: dayKey };
}

// Deckt ein Feld samt Umgebung auf (für die Spielzüge). view: Array aus 'u', 'f', 'o' (wird verändert).
export function openFrom(view, mines, w, h, i) {
  floodOpen(view, mines, w, h, i, countsOf(mines, w, h));
}
