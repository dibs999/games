// Zahlenjagd – Logik ohne DOM-Zugriff: Aufgaben erzeugen, Rechenschritte prüfen, Lösungen suchen.
//
// Eine Aufgabe besteht aus 4 bis 6 Zahlen und einer Zielzahl. Man verknüpft zwei Zahlen mit + − × ÷, das Ergebnis
// ersetzt die beiden, bis die Zielzahl entsteht. Ergebnisse müssen ganze Zahlen über null sein.
//
// ACHTUNG: Das Tagesrätsel wird aus dem Datum berechnet und muss für alle gleich sein. Wer die Erzeugung ändert,
// ändert damit alle künftigen Tagesrätsel. Der Test "Tagesrätsel bleibt stabil" fängt das ab.

import { weekday, dayNumber } from '../shared/day.js';
import { makeRandom, hashString, shuffle } from '../shared/random.js';

export { makeRandom, hashString };

export const OPS = ['+', '−', '×', '÷'];
const PLUS = 0;
const MINUS = 1;
const TIMES = 2;
const DIVIDE = 3;

const SMALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const BIG = [25, 50, 75, 100];

// count: Zahl der Zahlen; big: so viele große (25, 50, 75, 100); range: Bereich der Zielzahl;
// steps: so viele Rechenschritte braucht die Aufgabe mindestens (von, bis).
export const DIFFICULTIES = {
  easy: { label: 'Leicht', count: 4, big: [0, 1], range: [20, 120], steps: [2, 3] },
  medium: { label: 'Mittel', count: 5, big: [1, 2], range: [100, 500], steps: [3, 4] },
  hard: { label: 'Schwer', count: 6, big: [2, 3], range: [200, 999], steps: [4, 5] },
};
export const DIFFICULTY_KEYS = Object.keys(DIFFICULTIES);

// Ergebnis einer Rechnung oder null, wenn sie nicht erlaubt ist (kein ganzes Ergebnis über null).
export function applyOp(a, b, op) {
  if (op === PLUS) return a + b;
  if (op === TIMES) return a * b;
  if (op === MINUS) return a > b ? a - b : null;
  if (op === DIVIDE) return b > 0 && a % b === 0 ? a / b : null;
  return null;
}

// ---------- Erzeugen ----------

function pickNumbers(spec, random) {
  const bigCount = spec.big[0] + Math.floor(random() * (spec.big[1] - spec.big[0] + 1));
  const bigs = shuffle(BIG, random).slice(0, bigCount);
  const smalls = [];
  const pool = shuffle([...SMALL, ...SMALL], random);
  while (bigs.length + smalls.length < spec.count) smalls.push(pool.pop());
  return [...bigs, ...smalls].sort((a, b) => b - a);
}

// Baut eine lösbare Aufgabe rückwärts: Zufällige Rechenschritte mit den Zahlen ergeben die Zielzahl.
function buildTarget(numbers, spec, random) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const steps = spec.steps[0] + Math.floor(random() * (spec.steps[1] - spec.steps[0] + 1));
    const items = [...numbers];
    let value = null;
    for (let s = 0; s < steps && items.length > 1; s++) {
      let done = false;
      for (let tries = 0; tries < 30 && !done; tries++) {
        const i = Math.floor(random() * items.length);
        let j = Math.floor(random() * (items.length - 1));
        if (j >= i) j += 1;
        const op = Math.floor(random() * 4);
        const result = applyOp(items[i], items[j], op);
        if (result == null || result < 1 || result > 100000) continue;
        for (const k of [i, j].sort((x, y) => y - x)) items.splice(k, 1);
        items.push(result);
        value = result;
        done = true;
      }
      if (!done) break;
    }
    if (value != null && value >= spec.range[0] && value <= spec.range[1] && !numbers.includes(value)) return value;
  }
  return null;
}

// Erzeugt eine Aufgabe der gewünschten Stufe. Gibt immer dasselbe zurück, wenn random dieselbe Folge liefert.
export function generateTask(difficulty, random = Math.random) {
  const spec = DIFFICULTIES[difficulty];
  for (;;) {
    const numbers = pickNumbers(spec, random);
    const target = buildTarget(numbers, spec, random);
    if (target != null) return { numbers, target, difficulty };
  }
}

// ---------- Lösen ----------

// Sucht eine Lösung. Ergebnis: Liste von Schritten { a, op, b, result } oder null.
// Probiert zuerst große Rechnungen, merkt sich schon gesehene Zahlenmengen und gibt nach vielen Versuchen auf.
export function solveTask(numbers, target, limit = 400_000) {
  const seen = new Set();
  let nodes = 0;

  function search(items, steps) {
    if (items.includes(target)) return steps;
    if (items.length < 2 || nodes++ > limit) return null;
    const key = [...items].sort((x, y) => x - y).join(',');
    if (seen.has(key)) return null;
    seen.add(key);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const rest = items.filter((_, k) => k !== i && k !== j);
        const options = [
          [a, PLUS, b],
          [a, TIMES, b],
          [Math.max(a, b), MINUS, Math.min(a, b)],
          [Math.max(a, b), DIVIDE, Math.min(a, b)],
        ];
        for (const [x, op, y] of options) {
          const result = applyOp(x, y, op);
          if (result == null) continue;
          const found = search([...rest, result], [...steps, { a: x, op, b: y, result }]);
          if (found) return found;
        }
      }
    }
    return null;
  }

  return search([...numbers], []);
}

// Eine Lösung als Zeilen, z. B. "6 × 7 = 42".
export function describeStep({ a, op, b, result }) {
  return `${a} ${OPS[op]} ${b} = ${result}`;
}

// ---------- Tagesrätsel ----------

// Mo–Di leicht, Mi–Fr mittel, Sa–So schwer.
const WEEK_PLAN = ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard'];

export function dailyDifficulty(dayKey) {
  return WEEK_PLAN[weekday(dayKey)];
}

export function dailyTask(dayKey) {
  const difficulty = dailyDifficulty(dayKey);
  const random = makeRandom((hashString(`zahlenjagd-tag-${dayKey}`) ^ dayNumber(dayKey)) >>> 0);
  return { ...generateTask(difficulty, random), day: dayKey };
}
