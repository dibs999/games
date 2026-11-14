// Sudoku-Logik ohne DOM-Zugriff: Rätsel erzeugen, lösen, bewerten.
//
// Ein Feld ist ein Array mit 81 Zahlen (0 = leer), Index = Zeile * 9 + Spalte.
// Beim Speichern wird es als Text aus 81 Ziffern abgelegt (siehe toText / fromText).
//
// ACHTUNG: Das Tagesrätsel wird aus dem Datum berechnet und muss für alle gleich sein.
// Wer die Erzeugung (Zufallsfolge, Reihenfolge, Grenzen) ändert, ändert damit alle künftigen
// Tagesrätsel. Der Test "Tagesrätsel bleibt stabil" fängt das ab.

import { dayNumber, weekday } from '../shared/day.js';
import { makeRandom, hashString, shuffle } from '../shared/random.js';

export { makeRandom, hashString };

export const SIZE = 9;
export const CELLS = 81;
const ALL = 0x1ff;

// grade: Schwierigkeit der Verfahren, die man zum Lösen braucht (1 = nur Einzelkandidaten,
// 2 = dazu blockierte Kandidaten und Paare, 3 = dazu Drillinge, X-Wing und Annahme-Probe).
// clues: so viele Vorgaben bleiben mindestens stehen (beim Streichen wird früher aufgehört).
// Ob ein Rätsel wirklich zur Stufe passt, entscheidet erst die Bewertung (gradePuzzle).
export const DIFFICULTIES = {
  easy: { label: 'Leicht', grade: 1, clues: 36 },
  medium: { label: 'Mittel', grade: 2, clues: 29 },
  hard: { label: 'Schwer', grade: 3, clues: 24 },
};
export const DIFFICULTY_KEYS = Object.keys(DIFFICULTIES);

const MAX_ATTEMPTS = 80;

// ---------- Aufbau des Feldes ----------

const row = (i) => Math.floor(i / 9);
const col = (i) => i % 9;
const box = (i) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);

// Die 27 Einheiten: Zeilen 0–8, Spalten 9–17, Blöcke 18–26.
const UNITS = [];
for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
for (let b = 0; b < 9; b++) {
  const r0 = Math.floor(b / 3) * 3;
  const c0 = (b % 3) * 3;
  UNITS.push(Array.from({ length: 9 }, (_, k) => (r0 + Math.floor(k / 3)) * 9 + c0 + (k % 3)));
}

// Alle Felder, die mit einem Feld in einer Zeile, Spalte oder einem Block liegen.
export const PEERS = Array.from({ length: CELLS }, (_, i) => {
  const set = new Set([...UNITS[row(i)], ...UNITS[9 + col(i)], ...UNITS[18 + box(i)]]);
  set.delete(i);
  return [...set];
});

const POP = Array.from({ length: 512 }, (_, n) => {
  let count = 0;
  for (let m = n; m; m >>= 1) count += m & 1;
  return count;
});
const BIT = (d) => 1 << (d - 1);

export function popcount(mask) {
  return POP[mask];
}

export function digitsOf(mask) {
  const digits = [];
  for (let d = 1; d <= 9; d++) if (mask & BIT(d)) digits.push(d);
  return digits;
}

export function toText(grid) {
  return grid.join('');
}

export function fromText(text) {
  return Array.from(text, Number);
}

// ---------- Rückverfolgendes Lösen (Anzahl der Lösungen) ----------

// Sucht Lösungen mit Rückverfolgung. limit: nach so vielen Lösungen aufhören.
// random: mischt die Reihenfolge der Ziffern (zum Erzeugen eines zufälligen vollen Feldes).
export function solve(grid, { limit = 2, random = null } = {}) {
  const cells = [...grid];
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  for (let i = 0; i < CELLS; i++) {
    const d = cells[i];
    if (!d) continue;
    const bit = BIT(d);
    if (rows[row(i)] & bit || cols[col(i)] & bit || boxes[box(i)] & bit) return { count: 0, solution: null };
    rows[row(i)] |= bit;
    cols[col(i)] |= bit;
    boxes[box(i)] |= bit;
  }
  let count = 0;
  let solution = null;

  function search() {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < CELLS; i++) {
      if (cells[i]) continue;
      const mask = ALL & ~(rows[row(i)] | cols[col(i)] | boxes[box(i)]);
      const n = POP[mask];
      if (n === 0) return;
      if (n < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = n;
        if (n === 1) break;
      }
    }
    if (best < 0) {
      count += 1;
      if (!solution) solution = [...cells];
      return;
    }
    const order = random ? shuffle(digitsOf(bestMask), random) : digitsOf(bestMask);
    const r = row(best);
    const c = col(best);
    const b = box(best);
    for (const d of order) {
      const bit = BIT(d);
      cells[best] = d;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      search();
      cells[best] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
      if (count >= limit) return;
    }
  }

  search();
  return { count, solution };
}

export function hasUniqueSolution(grid) {
  return solve(grid, { limit: 2 }).count === 1;
}

// ---------- Lösen wie ein Mensch (zum Bewerten der Schwierigkeit) ----------

function combinations(list, n) {
  const result = [];
  const pick = (start, chosen) => {
    if (chosen.length === n) {
      result.push(chosen);
      return;
    }
    for (let i = start; i < list.length; i++) pick(i + 1, [...chosen, list[i]]);
  };
  pick(0, []);
  return result;
}

// Löst ein Feld nur mit Verfahren bis zur Stufe maxGrade. Ergebnis: ob es vollständig gelöst wurde und
// wie viel Denkarbeit es kostete (work: jeder Schritt über Einzelkandidaten hinaus zählt 1, Stufe 3 zählt 3).
// Weil jedes Verfahren nur sichere Schlüsse zieht, ist ein so gelöstes Rätsel auch eindeutig.
//
// Stufe 1: Einzelkandidat im Feld und Einzelplatz in einer Einheit.
// Stufe 2: blockierte Kandidaten, nackte und versteckte Paare.
// Stufe 3: nackte und versteckte Drillinge, X-Wing und die Annahme-Probe.
export function logicSolve(grid, maxGrade) {
  const state = { cells: [...grid], cand: new Array(CELLS).fill(0) };
  for (let i = 0; i < CELLS; i++) {
    if (state.cells[i]) continue;
    let mask = ALL;
    for (const p of PEERS[i]) if (state.cells[p]) mask &= ~BIT(state.cells[p]);
    state.cand[i] = mask;
  }
  return runTechniques(state, maxGrade, true);
}

const placeDigit = ({ cells, cand }, i, d) => {
  cells[i] = d;
  cand[i] = 0;
  for (const p of PEERS[i]) cand[p] &= ~BIT(d);
};

const removeCandidates = ({ cand }, i, mask) => {
  if (!(cand[i] & mask)) return false;
  cand[i] &= ~mask;
  return true;
};

const emptyIn = ({ cells }, unit) => unit.filter((i) => !cells[i]);

// Stufe 1
function singles(state) {
  const { cells, cand } = state;
  let progress = false;
  for (let i = 0; i < CELLS; i++) {
    if (!cells[i] && POP[cand[i]] === 1) {
      placeDigit(state, i, digitsOf(cand[i])[0]);
      progress = true;
    }
  }
  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const bit = BIT(d);
      let spot = -1;
      let n = 0;
      for (const i of unit) {
        if (cells[i] === d) {
          n = -1;
          break;
        }
        if (!cells[i] && cand[i] & bit) {
          spot = i;
          n += 1;
        }
      }
      if (n === 1) {
        placeDigit(state, spot, d);
        progress = true;
      }
    }
  }
  return progress;
}

// Eine Ziffer liegt in einem Block nur in einer Zeile/Spalte (oder umgekehrt):
// dann fällt sie im Rest dieser Zeile/Spalte (bzw. des Blocks) weg.
function lockedCandidates(state) {
  const { cells, cand } = state;
  let progress = false;
  for (let d = 1; d <= 9; d++) {
    const bit = BIT(d);
    for (let b = 0; b < 9; b++) {
      const spots = UNITS[18 + b].filter((i) => !cells[i] && cand[i] & bit);
      if (spots.length < 2) continue;
      if (spots.every((i) => row(i) === row(spots[0]))) {
        for (const i of UNITS[row(spots[0])]) if (box(i) !== b && removeCandidates(state, i, bit)) progress = true;
      }
      if (spots.every((i) => col(i) === col(spots[0]))) {
        for (const i of UNITS[9 + col(spots[0])]) if (box(i) !== b && removeCandidates(state, i, bit)) progress = true;
      }
    }
    for (let u = 0; u < 18; u++) {
      const spots = UNITS[u].filter((i) => !cells[i] && cand[i] & bit);
      if (spots.length < 2 || !spots.every((i) => box(i) === box(spots[0]))) continue;
      for (const i of UNITS[18 + box(spots[0])]) {
        if (!UNITS[u].includes(i) && removeCandidates(state, i, bit)) progress = true;
      }
    }
  }
  return progress;
}

// Nackte Gruppen: n Felder einer Einheit haben zusammen nur n Ziffern → die gehören diesen Feldern.
function nakedSubsets(state, n) {
  const { cand } = state;
  let progress = false;
  for (const unit of UNITS) {
    const free = emptyIn(state, unit).filter((i) => POP[cand[i]] <= n);
    for (const group of combinations(free, n)) {
      const union = group.reduce((m, i) => m | cand[i], 0);
      if (POP[union] !== n) continue;
      for (const i of emptyIn(state, unit)) {
        if (!group.includes(i) && removeCandidates(state, i, union)) progress = true;
      }
    }
  }
  return progress;
}

// Versteckte Gruppen: n Ziffern kommen in einer Einheit nur in n Feldern vor → dort gibt es nichts anderes.
function hiddenSubsets(state, n) {
  const { cand } = state;
  let progress = false;
  for (const unit of UNITS) {
    const free = emptyIn(state, unit);
    const open = [];
    for (let d = 1; d <= 9; d++) if (free.some((i) => cand[i] & BIT(d))) open.push(d);
    for (const digits of combinations(open, n)) {
      const mask = digits.reduce((m, d) => m | BIT(d), 0);
      const spots = free.filter((i) => cand[i] & mask);
      if (spots.length !== n) continue;
      for (const i of spots) {
        if (cand[i] & ~mask) {
          cand[i] &= mask;
          progress = true;
        }
      }
    }
  }
  return progress;
}

// X-Wing: Eine Ziffer liegt in zwei Zeilen genau in denselben zwei Spalten → in diesen Spalten
// fällt sie in allen anderen Zeilen weg (und umgekehrt für Spalten).
function xWing(state) {
  const { cells, cand } = state;
  let progress = false;
  for (let d = 1; d <= 9; d++) {
    const bit = BIT(d);
    for (const [base, cross] of [[0, 9], [9, 0]]) {
      const lines = [];
      for (let k = 0; k < 9; k++) {
        const spots = UNITS[base + k].filter((i) => !cells[i] && cand[i] & bit);
        if (spots.length === 2) lines.push({ k, spots });
      }
      for (const [a, b] of combinations(lines, 2)) {
        const posA = a.spots.map((i) => (base === 0 ? col(i) : row(i)));
        const posB = b.spots.map((i) => (base === 0 ? col(i) : row(i)));
        if (posA[0] !== posB[0] || posA[1] !== posB[1]) continue;
        for (const p of posA) {
          for (const i of UNITS[cross + p]) {
            const line = base === 0 ? row(i) : col(i);
            if (line !== a.k && line !== b.k && !cells[i] && removeCandidates(state, i, bit)) progress = true;
          }
        }
      }
    }
  }
  return progress;
}

// Annahme-Probe: Man nimmt für ein Feld mit zwei Kandidaten an, es sei der eine, und löst mit den
// Verfahren bis Stufe 2 weiter. Führt das zum Widerspruch, ist der andere Kandidat der richtige.
function trial(state) {
  const { cells, cand } = state;
  let progress = false;
  for (let i = 0; i < CELLS; i++) {
    if (cells[i] || POP[cand[i]] !== 2) continue;
    for (const d of digitsOf(cand[i])) {
      const copy = { cells: [...cells], cand: [...cand] };
      placeDigit(copy, i, d);
      if (runTechniques(copy, 2, false).contradiction) {
        cand[i] &= ~BIT(d);
        progress = true;
        break;
      }
    }
    if (progress) return true;
  }
  return progress;
}

const STAGES = [
  [1, singles],
  [2, lockedCandidates],
  [2, (state) => nakedSubsets(state, 2)],
  [2, (state) => hiddenSubsets(state, 2)],
  [3, (state) => nakedSubsets(state, 3)],
  [3, (state) => hiddenSubsets(state, 3)],
  [3, xWing],
  [3, trial],
];

function runTechniques(state, maxGrade) {
  const { cells, cand } = state;
  let work = 0;
  for (;;) {
    if (cells.every(Boolean)) return { solved: true, contradiction: false, work };
    if (cells.some((d, i) => !d && cand[i] === 0)) return { solved: false, contradiction: true, work };
    let progress = false;
    for (const [grade, technique] of STAGES) {
      if (grade > maxGrade) break;
      if (technique(state)) {
        if (grade === 2) work += 1;
        if (grade === 3) work += 3;
        progress = true;
        break;
      }
    }
    if (!progress) return { solved: false, contradiction: false, work };
  }
}

export function solvesLogically(grid, maxGrade) {
  return logicSolve(grid, maxGrade).solved;
}

// Kleinste Stufe 1–3, mit der sich das Rätsel lösen lässt; 4, wenn mehr nötig ist.
export function gradePuzzle(grid) {
  for (let grade = 1; grade <= 3; grade++) if (solvesLogically(grid, grade)) return grade;
  return 4;
}

// ---------- Erzeugen ----------

export function randomSolution(random) {
  return solve(new Array(CELLS).fill(0), { limit: 1, random }).solution;
}

// Streicht Vorgaben in zufälliger Reihenfolge, solange die Lösung eindeutig bleibt.
function dig(solution, spec, random) {
  const puzzle = [...solution];
  let clues = CELLS;
  for (const i of shuffle(Array.from({ length: CELLS }, (_, k) => k), random)) {
    if (clues <= spec.clues) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (hasUniqueSolution(puzzle)) clues -= 1;
    else puzzle[i] = keep;
  }
  return puzzle;
}

// Erzeugt ein Rätsel der gewünschten Stufe. Gibt immer dasselbe zurück, wenn random dieselbe Folge liefert.
export function generatePuzzle(difficulty, random = Math.random) {
  const spec = DIFFICULTIES[difficulty];
  let fallback = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const solution = randomSolution(random);
    const puzzle = dig(solution, spec, random);
    const grade = gradePuzzle(puzzle);
    if (grade === spec.grade) return { puzzle: toText(puzzle), solution: toText(solution), difficulty };
    if (!fallback && grade <= 3) fallback = { puzzle: toText(puzzle), solution: toText(solution), difficulty };
  }
  // Selten: nach vielen Versuchen das erste lösbare Rätsel nehmen.
  return fallback || generatePuzzle(difficulty, random);
}

// ---------- Tagesrätsel ----------

// Mo–Di leicht, Mi–Fr mittel, Sa–So schwer.
const WEEK_PLAN = ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard'];

export function dailyDifficulty(dayKey) {
  return WEEK_PLAN[weekday(dayKey)];
}

export function dailyPuzzle(dayKey) {
  const difficulty = dailyDifficulty(dayKey);
  const random = makeRandom(hashString(`sudoku-tag-${dayKey}`) ^ dayNumber(dayKey));
  return { ...generatePuzzle(difficulty, random), day: dayKey };
}

// ---------- Hilfen für die Oberfläche ----------

// Felder, deren Ziffer in Zeile, Spalte oder Block doppelt vorkommt.
export function conflicts(grid) {
  const bad = new Set();
  for (const unit of UNITS) {
    const seen = new Map();
    for (const i of unit) {
      const d = grid[i];
      if (!d) continue;
      if (seen.has(d)) {
        bad.add(i);
        bad.add(seen.get(d));
      } else seen.set(d, i);
    }
  }
  return bad;
}

// Wie oft jede Ziffer 1–9 schon eingetragen ist (für die Zahlentasten).
export function digitCounts(grid) {
  const counts = new Array(10).fill(0);
  for (const d of grid) if (d) counts[d] += 1;
  return counts;
}
