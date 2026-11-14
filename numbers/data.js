// Zahlenjagd-Daten im Profil (Abschnitt "numbers"): laufende Aufgaben, Statistik, Abzeichen.
//
// Ein Spiel speichert die Zahlen, die Zielzahl und die bisherigen Rechenschritte. Ein Schritt ist
// [Nummer der ersten Zahl, Nummer der zweiten Zahl, Rechenart]. Die Zahlen sind von 0 an durchnummeriert,
// jedes Ergebnis bekommt die nächste Nummer. So bleibt eindeutig, welche Zahl gemeint ist, auch bei gleichen Werten.

import { createSection, achievementStatus, unlockFrom, totalSolved } from '../shared/puzzle-stats.js';
import { DIFFICULTIES, DIFFICULTY_KEYS, applyOp, solveTask } from './logic.js';

// ---------- Spiel ----------

export function newGame({ numbers, target, difficulty }, id) {
  return { id, difficulty, numbers, target, steps: [], time: 0, mistakes: 0, status: 'playing' };
}

export function randomGameId() {
  return Math.floor(Math.random() * 2 ** 40).toString(36);
}

// Spielt die Schritte durch: [{ v: Wert, used: schon verrechnet }]. null, wenn ein Schritt nicht möglich ist.
export function replay(game) {
  const items = game.numbers.map((v) => ({ v, used: false }));
  for (const step of game.steps) {
    if (!Array.isArray(step) || step.length !== 3) return null;
    const [i, j, op] = step;
    if (!Number.isInteger(i) || !Number.isInteger(j) || i === j || !items[i] || !items[j] || items[i].used || items[j].used) return null;
    const v = applyOp(items[i].v, items[j].v, op);
    if (v == null) return null;
    items[i].used = true;
    items[j].used = true;
    items.push({ v, used: false });
  }
  return items;
}

// Die Zahlen, die noch zur Verfügung stehen (mit ihrer Nummer).
export function available(game) {
  const items = replay(game) || [];
  return items.map((item, index) => ({ ...item, index })).filter((item) => !item.used);
}

// Rechnet zwei Zahlen. Ergebnis: { ok: true, value } oder { ok: false, reason }.
// Das Spiel ist gewonnen, sobald die Zielzahl dasteht.
export function applyStep(game, i, j, op) {
  if (game.status !== 'playing') return { ok: false, reason: 'Das Spiel ist schon vorbei.' };
  const items = replay(game);
  if (!items || i === j || !items[i] || !items[j] || items[i].used || items[j].used) return { ok: false, reason: 'Diese Zahlen sind nicht verfügbar.' };
  const value = applyOp(items[i].v, items[j].v, op);
  if (value == null) return { ok: false, reason: op === 3 ? 'Das geht nicht ohne Rest.' : 'Das Ergebnis muss größer als 0 sein.' };
  game.steps.push([i, j, op]);
  if (value === game.target) game.status = 'won';
  return { ok: true, value };
}

export function undoStep(game) {
  if (game.status !== 'playing' || game.steps.length === 0) return false;
  game.steps.pop();
  return true;
}

export function resetSteps(game) {
  if (game.status !== 'playing' || game.steps.length === 0) return false;
  game.steps = [];
  return true;
}

// Aufgeben: das Spiel zählt als nicht gelöst.
export function giveUp(game) {
  if (game.status !== 'playing') return false;
  game.status = 'lost';
  return true;
}

// Die Zielzahl ist zwar schon erreicht, wenn eine verfügbare Zahl sie zeigt; das Spiel steht dann auf 'won'.
export function solutionOf(game) {
  return solveTask(game.numbers, game.target);
}

// Wie weit ein Spiel ist: gelöst vor allem, sonst die Zahl der Schritte (und die Zeit).
export function gameProgress(game) {
  if (!game) return -1;
  if (game.status === 'won') return 1_000_000;
  if (game.status === 'lost') return 500_000;
  return game.steps.length * 1000 + Math.min(999, Math.floor(game.time / 1000));
}

function normalizeGame(game, daily) {
  if (!game || typeof game !== 'object') return null;
  const spec = DIFFICULTIES[game.difficulty];
  if (!spec) return null;
  if (daily && typeof game.day !== 'string') return null;
  const { numbers, target } = game;
  if (!Array.isArray(numbers) || numbers.length !== spec.count || !numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 100)) return null;
  if (!Number.isInteger(target) || target < 1 || target > 999) return null;
  const steps = Array.isArray(game.steps) ? game.steps.map((step) => (Array.isArray(step) ? [...step] : step)) : [];
  const checked = { ...game, numbers: [...numbers], steps };
  const items = replay(checked);
  if (!items) return null;
  const status = ['won', 'lost'].includes(game.status) ? game.status : 'playing';
  return {
    ...checked,
    id: String(game.id ?? ''),
    time: Number(game.time) > 0 ? Math.round(Number(game.time)) : 0,
    mistakes: 0,
    status,
  };
}

export const section = createSection({ normalizeGame, progress: gameProgress });
export const emptyNumbersData = section.empty;
export const normalizeNumbersData = section.normalize;
export const mergeNumbersData = section.merge;
export const reuseUnchangedNumbers = section.reuse;

// ---------- Abzeichen ----------

const solved = (d) => totalSolved(d.numbers.stats);

export const NUMBERS_ACHIEVEMENTS = [
  { id: 'zahl-first', tier: 'bronze', icon: '🎯', title: 'Erste Zielzahl', text: 'Eine Zahlenjagd gelöst.', target: 1, value: solved },
  { id: 'zahl-10', tier: 'bronze', icon: '➕', title: 'Kopfrechner', text: '10 Zahlenjagden gelöst.', target: 10, value: solved },
  { id: 'zahl-50', tier: 'silver', icon: '🧮', title: 'Rechenkünstler', text: '50 Zahlenjagden gelöst.', target: 50, value: solved },
  { id: 'zahl-200', tier: 'gold', icon: '🏆', title: 'Zahlenzauberer', text: '200 Zahlenjagden gelöst.', target: 200, value: solved },
  { id: 'zahl-medium', tier: 'bronze', icon: '🔢', title: 'Mit Köpfchen', text: 'Eine mittlere Zahlenjagd gelöst.', target: 1, value: (d) => d.numbers.stats.medium.won },
  { id: 'zahl-hard', tier: 'silver', icon: '🧠', title: 'Zahlenjäger', text: 'Eine schwere Zahlenjagd gelöst.', target: 1, value: (d) => d.numbers.stats.hard.won },
  { id: 'zahl-hard-10', tier: 'gold', icon: '🔥', title: 'Rechengenie', text: '10 schwere Zahlenjagden gelöst.', target: 10, value: (d) => d.numbers.stats.hard.won },
  { id: 'zahl-daily-10', tier: 'silver', icon: '📅', title: 'Täglich dabei', text: '10 Tagesrätsel der Zahlenjagd gelöst.', target: 10, value: (d) => d.numbers.stats.daily.won },
  { id: 'zahl-fast', tier: 'silver', icon: '⚡', title: 'Blitzrechner', text: 'Eine leichte Zahlenjagd in unter 30 Sekunden gelöst.', target: 1, value: (d) => (d.numbers.stats.easy.bestMs != null && d.numbers.stats.easy.bestMs <= 30_000 ? 1 : 0) },
];

export const BADGE_GROUPS = [
  { title: 'Gelöste Aufgaben', ids: ['zahl-first', 'zahl-10', 'zahl-50', 'zahl-200'] },
  { title: 'Stufen', ids: ['zahl-medium', 'zahl-hard', 'zahl-hard-10'] },
  { title: 'Tempo und Treue', ids: ['zahl-daily-10', 'zahl-fast'] },
];

export const numbersAchievements = (data) => achievementStatus(NUMBERS_ACHIEVEMENTS, data, 'numbers');
export const unlockNumbersAchievements = (data, now) => unlockFrom(NUMBERS_ACHIEVEMENTS, data, 'numbers', now);

export { DIFFICULTY_KEYS };
