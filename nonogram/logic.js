// Nonogramm – Logik ohne DOM-Zugriff: Rätsel erzeugen, Hinweiszahlen berechnen, mit Logik lösen.
//
// Die Lösung ist ein Text aus w*h Zeichen ('1' = gefüllt, '0' = leer), Index = Zeile * w + Spalte.
// Die Zahlen am Rand nennen die Längen der Blöcke gefüllter Felder in jeder Zeile und Spalte.
//
// Jedes erzeugte Rätsel hat genau eine Lösung und lässt sich allein mit Zeilen- und Spaltenlogik lösen (ohne Raten).
//
// ACHTUNG: Das Tagesrätsel wird aus dem Datum berechnet und muss für alle gleich sein. Wer die Erzeugung ändert,
// ändert damit alle künftigen Tagesrätsel. Der Test "Tagesrätsel bleibt stabil" fängt das ab.

import { weekday, dayNumber } from '../shared/day.js';
import { makeRandom, hashString } from '../shared/random.js';

export { makeRandom, hashString };

// density: Anteil gefüllter Felder (von, bis).
export const DIFFICULTIES = {
  easy: { label: 'Leicht', w: 5, h: 5, density: [0.55, 0.7] },
  medium: { label: 'Mittel', w: 10, h: 10, density: [0.45, 0.6] },
  hard: { label: 'Schwer', w: 14, h: 14, density: [0.4, 0.52] },
};
export const DIFFICULTY_KEYS = Object.keys(DIFFICULTIES);

const MAX_ATTEMPTS = 5000;

// ---------- Hinweise ----------

// Längen der Blöcke gefüllter Felder in einer Reihe (Liste aus 0 und 1). Eine leere Reihe hat den Hinweis [0].
export function cluesOfLine(line) {
  const clues = [];
  let run = 0;
  for (const v of line) {
    if (v) run += 1;
    else if (run) {
      clues.push(run);
      run = 0;
    }
  }
  if (run) clues.push(run);
  return clues.length ? clues : [0];
}

export function rowOf(solution, w, r) {
  return Array.from({ length: w }, (_, c) => (solution[r * w + c] === '1' ? 1 : 0));
}

export function colOf(solution, w, h, c) {
  return Array.from({ length: h }, (_, r) => (solution[r * w + c] === '1' ? 1 : 0));
}

// Alle Hinweise eines Rätsels: { rows: [[…]], cols: [[…]] }.
export function cluesOf(solution, w, h) {
  return {
    rows: Array.from({ length: h }, (_, r) => cluesOfLine(rowOf(solution, w, r))),
    cols: Array.from({ length: w }, (_, c) => cluesOfLine(colOf(solution, w, h, c))),
  };
}

// ---------- Eine Reihe lösen ----------

// Welche Felder einer Reihe sind sicher gefüllt (1) oder sicher leer (0), gegeben die Hinweise und das, was man
// schon weiß (-1 = unbekannt)? Ergebnis: neue Liste, oder null, wenn die Reihe nicht aufgehen kann.
export function solveLine(clues, known) {
  const n = known.length;
  const blocks = clues[0] === 0 ? [] : clues;
  const canFill = new Array(n).fill(false);
  const canEmpty = new Array(n).fill(false);
  let any = false;
  const current = new Array(n).fill(0);

  // Setzt Block b ab Feld pos und probiert alle Möglichkeiten für die restlichen Blöcke.
  function place(b, pos) {
    if (b === blocks.length) {
      // Der Rest bleibt leer.
      for (let i = pos; i < n; i++) if (known[i] === 1) return;
      for (let i = pos; i < n; i++) current[i] = 0;
      any = true;
      for (let i = 0; i < n; i++) (current[i] ? canFill : canEmpty)[i] = true;
      return;
    }
    const length = blocks[b];
    let rest = 0;
    for (let k = b + 1; k < blocks.length; k++) rest += blocks[k] + 1;
    for (let start = pos; start + length + rest <= n; start++) {
      // Felder vor dem Block sind leer.
      let ok = true;
      for (let i = pos; i < start; i++) {
        if (known[i] === 1) {
          ok = false;
          break;
        }
        current[i] = 0;
      }
      if (!ok) break; // ein weiter rechts liegender Start würde dieses gefüllte Feld erst recht auslassen
      for (let i = start; i < start + length; i++) {
        if (known[i] === 0) {
          ok = false;
          break;
        }
        current[i] = 1;
      }
      if (!ok) continue;
      const after = start + length;
      if (b < blocks.length - 1) {
        if (known[after] === 1) continue;
        current[after] = 0;
        place(b + 1, after + 1);
      } else {
        place(b + 1, after);
      }
    }
  }

  place(0, 0);
  if (!any) return null;
  return known.map((v, i) => {
    if (v !== -1) return v;
    if (canFill[i] && !canEmpty[i]) return 1;
    if (canEmpty[i] && !canFill[i]) return 0;
    return -1;
  });
}

// ---------- Ein Rätsel lösen ----------

// Löst nur mit Zeilen- und Spaltenlogik. Ergebnis: { solved, grid } (grid: 1, 0 oder -1 je Feld).
export function logicSolve(clues, w, h) {
  const grid = new Array(w * h).fill(-1);
  let progress = true;
  while (progress) {
    progress = false;
    for (let r = 0; r < h; r++) {
      const known = Array.from({ length: w }, (_, c) => grid[r * w + c]);
      const next = solveLine(clues.rows[r], known);
      if (!next) return { solved: false, grid };
      next.forEach((v, c) => {
        if (v !== grid[r * w + c]) {
          grid[r * w + c] = v;
          progress = true;
        }
      });
    }
    for (let c = 0; c < w; c++) {
      const known = Array.from({ length: h }, (_, r) => grid[r * w + c]);
      const next = solveLine(clues.cols[c], known);
      if (!next) return { solved: false, grid };
      next.forEach((v, r) => {
        if (v !== grid[r * w + c]) {
          grid[r * w + c] = v;
          progress = true;
        }
      });
    }
  }
  return { solved: grid.every((v) => v !== -1), grid };
}

// ---------- Erzeugen ----------

// Zufälliges, links-rechts-gespiegeltes Muster: wirkt wie ein Ornament und nicht wie Rauschen.
function randomPattern(spec, random) {
  const { w, h } = spec;
  const density = spec.density[0] + random() * (spec.density[1] - spec.density[0]);
  const cells = new Array(w * h).fill('0');
  const half = Math.ceil(w / 2);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < half; c++) {
      const filled = random() < density ? '1' : '0';
      cells[r * w + c] = filled;
      cells[r * w + (w - 1 - c)] = filled;
    }
  }
  return cells.join('');
}

// Erzeugt ein Rätsel mit genau einer, durch Logik findbaren Lösung. Gibt immer dasselbe zurück,
// wenn random dieselbe Folge liefert. Ergebnis: { w, h, solution, difficulty }
export function generatePuzzle(difficulty, random = Math.random) {
  const spec = DIFFICULTIES[difficulty];
  const { w, h } = spec;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const solution = randomPattern(spec, random);
    const clues = cluesOf(solution, w, h);
    // Keine leeren Reihen oder Spalten, das Bild soll überall etwas zeigen.
    if (clues.rows.some((c) => c[0] === 0) || clues.cols.some((c) => c[0] === 0)) continue;
    if (logicSolve(clues, w, h).solved) return { w, h, solution, difficulty };
  }
  throw new Error('Kein lösbares Nonogramm gefunden');
}

// ---------- Tagesrätsel ----------

// Mo–Di leicht, Mi–Fr mittel, Sa–So schwer.
const WEEK_PLAN = ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard'];

export function dailyDifficulty(dayKey) {
  return WEEK_PLAN[weekday(dayKey)];
}

export function dailyPuzzle(dayKey) {
  const difficulty = dailyDifficulty(dayKey);
  const random = makeRandom((hashString(`nonogramm-tag-${dayKey}`) ^ dayNumber(dayKey)) >>> 0);
  return { ...generatePuzzle(difficulty, random), day: dayKey };
}
