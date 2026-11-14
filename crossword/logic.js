// Kreuzworträtsel-Logik ohne DOM-Zugriff: Rätsel aus der Wortliste bauen, nummerieren, prüfen.
//
// Ein Rätsel besteht aus Breite, Höhe und einer Liste von Wörtern [Nummer in WORDS, Zeile, Spalte, Richtung]
// (Richtung 0 = waagerecht, 1 = senkrecht). Die Buchstaben und Hinweise holt buildPuzzle aus WORDS.
//
// ACHTUNG: Das Tagesrätsel wird aus dem Datum berechnet und muss für alle gleich sein. Wer die Erzeugung
// (Zufallsfolge, Gewichte, Bewertung) oder die Reihenfolge in words.js ändert, ändert damit alle künftigen
// Tagesrätsel. Der Test "Tagesrätsel bleibt stabil" fängt das ab.

import { dayNumber, weekday } from '../shared/day.js';
import { makeRandom, hashString, shuffle } from '../shared/random.js';
import { WORDS } from './words.js';

export { makeRandom, hashString };

// size: Kantenlänge des Spielfelds, in dem gebaut wird (am Ende wird auf den belegten Bereich beschnitten).
// words: so viele Wörter soll das Rätsel haben (von, bis). weights: Gewicht der Wortstufen bei der Auswahl.
export const DIFFICULTIES = {
  easy: { label: 'Leicht', size: 9, words: [8, 10], weights: { 1: 1 } },
  medium: { label: 'Mittel', size: 11, words: [12, 15], weights: { 1: 1, 2: 1.6 } },
  hard: { label: 'Schwer', size: 13, words: [16, 20], weights: { 1: 0.5, 2: 1, 3: 2.2 } },
};
export const DIFFICULTY_KEYS = Object.keys(DIFFICULTIES);

const ACROSS = 0;
const DOWN = 1;
const ATTEMPTS = 6;
const POOL_SIZE = 140; // so viele Wörter werden pro Rätsel in Betracht gezogen

export const answerOf = (index) => WORDS[index][0];
export const clueOf = (index) => WORDS[index][1];

// ---------- Bauen ----------

function newGrid(size) {
  return {
    size,
    letters: new Array(size * size).fill(''),
    across: new Array(size * size).fill(false),
    down: new Array(size * size).fill(false),
    placed: [], // [Index in WORDS, Zeile, Spalte, Richtung]
    crossings: 0,
  };
}

// Prüft, ob ein Wort an die Stelle passt. Ergebnis: Zahl der Kreuzungen, oder -1.
function crossingsIfPlaced(grid, word, r, c, dir) {
  const { size, letters } = grid;
  const dr = dir === DOWN ? 1 : 0;
  const dc = dir === ACROSS ? 1 : 0;
  const len = word.length;
  const endR = r + dr * (len - 1);
  const endC = c + dc * (len - 1);
  if (r < 0 || c < 0 || endR >= size || endC >= size) return -1;
  // Vor und hinter dem Wort darf kein Buchstabe stehen, sonst würde es verlängert.
  const before = r - dr;
  const beforeC = c - dc;
  if (before >= 0 && beforeC >= 0 && letters[before * size + beforeC]) return -1;
  const after = endR + dr;
  const afterC = endC + dc;
  if (after < size && afterC < size && letters[after * size + afterC]) return -1;

  let crossings = 0;
  for (let k = 0; k < len; k++) {
    const rr = r + dr * k;
    const cc = c + dc * k;
    const i = rr * size + cc;
    if (letters[i]) {
      if (letters[i] !== word[k]) return -1;
      // Ein Buchstabe, der schon in dieser Richtung zu einem Wort gehört, darf nicht nochmal genutzt werden.
      if (dir === ACROSS ? grid.across[i] : grid.down[i]) return -1;
      crossings += 1;
    } else {
      // Daneben darf nichts stehen, sonst entstünden ungewollte Wörter.
      const nr1 = rr + dc;
      const nc1 = cc + dr;
      const nr2 = rr - dc;
      const nc2 = cc - dr;
      if (nr1 < size && nc1 < size && letters[nr1 * size + nc1]) return -1;
      if (nr2 >= 0 && nc2 >= 0 && letters[nr2 * size + nc2]) return -1;
    }
  }
  return crossings;
}

function place(grid, index, r, c, dir, crossings) {
  const word = answerOf(index);
  const dr = dir === DOWN ? 1 : 0;
  const dc = dir === ACROSS ? 1 : 0;
  for (let k = 0; k < word.length; k++) {
    const i = (r + dr * k) * grid.size + (c + dc * k);
    grid.letters[i] = word[k];
    if (dir === ACROSS) grid.across[i] = true;
    else grid.down[i] = true;
  }
  grid.placed.push([index, r, c, dir]);
  grid.crossings += crossings;
}

function boundingBox(grid) {
  let minR = grid.size;
  let maxR = -1;
  let minC = grid.size;
  let maxC = -1;
  grid.letters.forEach((ch, i) => {
    if (!ch) return;
    const r = Math.floor(i / grid.size);
    const c = i % grid.size;
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);
  });
  return { minR, maxR, minC, maxC };
}

// Auswahl der Wörter für ein Rätsel: zufällig, aber die Stufen der Schwierigkeit nach gewichtet.
function weightedPool(spec, random) {
  const keyed = [];
  WORDS.forEach(([answer, , tier], index) => {
    const weight = spec.weights[tier];
    if (!weight || answer.length > spec.size) return;
    // Zufallsschlüssel nach Efraimidis/Spirakis: höheres Gewicht landet eher vorn.
    keyed.push({ index, key: Math.pow(random(), 1 / weight) });
  });
  keyed.sort((a, b) => b.key - a.key || a.index - b.index);
  return keyed.slice(0, POOL_SIZE).map((entry) => entry.index);
}

function buildAttempt(spec, random) {
  const grid = newGrid(spec.size);
  const pool = weightedPool(spec, random);
  const target = spec.words[0] + Math.floor(random() * (spec.words[1] - spec.words[0] + 1));
  const used = new Set();

  // Das erste Wort liegt waagerecht in der Mitte: eines der ersten längeren aus der Auswahl.
  const first = pool.find((index) => answerOf(index).length >= Math.min(7, spec.size - 2)) ?? pool[0];
  const firstWord = answerOf(first);
  place(grid, first, Math.floor(spec.size / 2), Math.floor((spec.size - firstWord.length) / 2), ACROSS, 0);
  used.add(first);

  while (grid.placed.length < target) {
    const box = boundingBox(grid);
    let best = null;
    for (const index of pool) {
      if (used.has(index)) continue;
      const word = answerOf(index);
      for (let i = 0; i < grid.letters.length; i++) {
        const have = grid.letters[i];
        if (!have) continue;
        const r = Math.floor(i / grid.size);
        const c = i % grid.size;
        for (let k = 0; k < word.length; k++) {
          if (word[k] !== have) continue;
          for (const dir of [ACROSS, DOWN]) {
            if (dir === ACROSS ? grid.across[i] : grid.down[i]) continue;
            const r0 = dir === DOWN ? r - k : r;
            const c0 = dir === ACROSS ? c - k : c;
            const crossings = crossingsIfPlaced(grid, word, r0, c0, dir);
            if (crossings < 1) continue;
            const r1 = dir === DOWN ? r0 + word.length - 1 : r0;
            const c1 = dir === ACROSS ? c0 + word.length - 1 : c0;
            const area = (Math.max(box.maxR, r1) - Math.min(box.minR, r0) + 1) * (Math.max(box.maxC, c1) - Math.min(box.minC, c0) + 1);
            // Viele Kreuzungen und ein kompaktes Feld sind gut, ein bisschen Zufall sorgt für Abwechslung.
            const score = crossings * 100 - area + random() * 0.5;
            if (!best || score > best.score) best = { score, index, r: r0, c: c0, dir, crossings };
          }
        }
      }
    }
    if (!best) break;
    place(grid, best.index, best.r, best.c, best.dir, best.crossings);
    used.add(best.index);
  }
  return grid;
}

// Schneidet auf den belegten Bereich zu und liefert { w, h, words }.
function trim(grid) {
  const { minR, maxR, minC, maxC } = boundingBox(grid);
  const words = grid.placed
    .map(([index, r, c, dir]) => [index, r - minR, c - minC, dir])
    .sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  return { w: maxC - minC + 1, h: maxR - minR + 1, words };
}

// Erzeugt ein Rätsel der gewünschten Stufe. Gibt immer dasselbe zurück, wenn random dieselbe Folge liefert.
export function generatePuzzle(difficulty, random = Math.random) {
  const spec = DIFFICULTIES[difficulty];
  let best = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const grid = buildAttempt(spec, random);
    const box = boundingBox(grid);
    const area = (box.maxR - box.minR + 1) * (box.maxC - box.minC + 1);
    // Genug Wörter zählt am meisten, dann viele Kreuzungen auf wenig Platz.
    const score = Math.min(grid.placed.length, spec.words[0]) * 10000 + grid.crossings * 100 - area;
    if (!best || score > best.score) best = { score, grid };
  }
  return { ...trim(best.grid), difficulty };
}

// ---------- Aufbau eines Rätsels für die Anzeige ----------

// Baut aus einem gespeicherten Rätsel alles, was zum Spielen nötig ist. Ergebnis: null, wenn es nicht stimmig ist.
//   solution: Text aus w*h Zeichen (Buchstabe oder '.')
//   numbers: Nummer je Feld (0 = keine)
//   words: [{ n, index, r, c, dir, len, answer, clue, cells }] sortiert nach Nummer, dann waagerecht vor senkrecht
//   across / down: die jeweiligen Wörter
//   cellWords: je Feld [Position in words für waagerecht oder -1, Position für senkrecht oder -1]
export function buildPuzzle({ w, h, words }) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 3 || h < 3 || w > 15 || h > 15) return null;
  if (!Array.isArray(words) || words.length === 0) return null;
  const letters = new Array(w * h).fill('');
  for (const entry of words) {
    if (!Array.isArray(entry) || entry.length !== 4) return null;
    const [index, r, c, dir] = entry;
    if (!Number.isInteger(index) || index < 0 || index >= WORDS.length) return null;
    if (!Number.isInteger(r) || !Number.isInteger(c) || (dir !== ACROSS && dir !== DOWN)) return null;
    const answer = answerOf(index);
    const endR = r + (dir === DOWN ? answer.length - 1 : 0);
    const endC = c + (dir === ACROSS ? answer.length - 1 : 0);
    if (r < 0 || c < 0 || endR >= h || endC >= w) return null;
    for (let k = 0; k < answer.length; k++) {
      const i = (r + (dir === DOWN ? k : 0)) * w + c + (dir === ACROSS ? k : 0);
      if (letters[i] && letters[i] !== answer[k]) return null;
      letters[i] = answer[k];
    }
  }

  // Alle zusammenhängenden Buchstabenreihen ab zwei Feldern müssen genau die gespeicherten Wörter sein.
  const runs = new Set();
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!letters[r * w + c]) continue;
      if (c + 1 < w && letters[r * w + c + 1] && !(c > 0 && letters[r * w + c - 1])) runs.add(`${r},${c},${ACROSS}`);
      if (r + 1 < h && letters[(r + 1) * w + c] && !(r > 0 && letters[(r - 1) * w + c])) runs.add(`${r},${c},${DOWN}`);
    }
  }
  const stored = new Set(words.map(([, r, c, dir]) => `${r},${c},${dir}`));
  if (stored.size !== words.length || runs.size !== stored.size) return null;
  for (const key of stored) if (!runs.has(key)) return null;

  const numbers = new Array(w * h).fill(0);
  let counter = 0;
  for (let i = 0; i < w * h; i++) {
    const r = Math.floor(i / w);
    const c = i % w;
    if (runs.has(`${r},${c},${ACROSS}`) || runs.has(`${r},${c},${DOWN}`)) numbers[i] = ++counter;
  }

  const list = words
    .map(([index, r, c, dir]) => {
      const answer = answerOf(index);
      const cells = Array.from({ length: answer.length }, (_, k) => (r + (dir === DOWN ? k : 0)) * w + c + (dir === ACROSS ? k : 0));
      return { n: numbers[r * w + c], index, r, c, dir, len: answer.length, answer, clue: clueOf(index), cells };
    })
    .sort((a, b) => a.n - b.n || a.dir - b.dir);
  const cellWords = Array.from({ length: w * h }, () => [-1, -1]);
  list.forEach((word, position) => {
    for (const i of word.cells) cellWords[i][word.dir] = position;
  });

  return {
    w,
    h,
    solution: letters.map((ch) => ch || '.').join(''),
    numbers,
    words: list,
    across: list.filter((word) => word.dir === ACROSS),
    down: list.filter((word) => word.dir === DOWN),
    cellWords,
  };
}

// ---------- Tagesrätsel ----------

// Mo–Di leicht, Mi–Fr mittel, Sa–So schwer.
const WEEK_PLAN = ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard'];

export function dailyDifficulty(dayKey) {
  return WEEK_PLAN[weekday(dayKey)];
}

export function dailyPuzzle(dayKey) {
  const difficulty = dailyDifficulty(dayKey);
  const random = makeRandom((hashString(`kreuzwort-tag-${dayKey}`) ^ dayNumber(dayKey)) >>> 0);
  return { ...generatePuzzle(difficulty, random), day: dayKey };
}

// ---------- Hilfen für die Oberfläche ----------

// Die Buchstaben der Wörter aus der Tastatur: ß wird als SS geschrieben.
export const LETTER = /^[A-ZÄÖÜ]$/;

export function normalizeLetter(key) {
  const upper = key.toLocaleUpperCase('de-DE');
  return LETTER.test(upper) ? upper : null;
}

export { shuffle };
