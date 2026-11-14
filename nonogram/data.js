// Nonogramm-Daten im Profil (Abschnitt "nonogram"): laufende Rätsel, Statistik, Abzeichen.
//
// Ein Spiel speichert die Lösung (Text aus '1' und '0') und den Stand: 'u' = noch offen, 'f' = gefüllt,
// 'x' = als leer markiert. Gelöst ist das Rätsel, wenn genau die richtigen Felder gefüllt sind (Markierungen
// zählen dabei nicht). mistakes zählt Felder, die man falsch gefüllt oder falsch als leer markiert hat.

import { createSection, achievementStatus, unlockFrom, totalSolved } from '../shared/puzzle-stats.js';
import { DIFFICULTIES, DIFFICULTY_KEYS, cluesOfLine } from './logic.js';

// ---------- Spiel ----------

export function newGame({ w, h, solution, difficulty }, id) {
  return { id, difficulty, w, h, solution, cells: 'u'.repeat(w * h), time: 0, mistakes: 0, status: 'playing' };
}

export function randomGameId() {
  return Math.floor(Math.random() * 2 ** 40).toString(36);
}

// Ein Feld ist falsch, wenn man es gefüllt hat, obwohl es leer sein muss, oder als leer markiert, obwohl es gefüllt sein muss.
export function isWrong(game, i) {
  const state = game.cells[i];
  return (state === 'f' && game.solution[i] === '0') || (state === 'x' && game.solution[i] === '1');
}

function solved(game) {
  for (let i = 0; i < game.solution.length; i++) {
    if ((game.solution[i] === '1') !== (game.cells[i] === 'f')) return false;
  }
  return true;
}

// Setzt ein Feld auf 'f' (gefüllt), 'x' (leer markiert) oder 'u' (offen). Ergebnis: false, wenn nichts passiert ist.
// Ein Zug gegen die Lösung zählt als Fehler; stimmt am Ende alles, ist das Rätsel gelöst.
export function setCell(game, i, value) {
  if (game.status !== 'playing' || game.cells[i] === value || !['f', 'x', 'u'].includes(value)) return false;
  game.cells = game.cells.slice(0, i) + value + game.cells.slice(i + 1);
  if (value !== 'u' && isWrong(game, i)) game.mistakes += 1;
  if (solved(game)) game.status = 'won';
  return true;
}

// Alle Felder zurücksetzen (Neustart des Rätsels).
export function clearAll(game) {
  if (game.status !== 'playing' || !/[fx]/.test(game.cells)) return false;
  game.cells = 'u'.repeat(game.w * game.h);
  return true;
}

// Stimmen die gefüllten Blöcke einer Reihe mit ihrem Hinweis überein? (Zum Abhaken der Zahlen am Rand.)
export function lineDone(game, kind, index) {
  const line = [];
  const length = kind === 'row' ? game.w : game.h;
  for (let k = 0; k < length; k++) {
    const i = kind === 'row' ? index * game.w + k : k * game.w + index;
    line.push(game.cells[i] === 'f' ? 1 : 0);
  }
  const solution = [];
  for (let k = 0; k < length; k++) {
    const i = kind === 'row' ? index * game.w + k : k * game.w + index;
    solution.push(game.solution[i] === '1' ? 1 : 0);
  }
  return JSON.stringify(cluesOfLine(line)) === JSON.stringify(cluesOfLine(solution));
}

export const markedCount = (game) => [...game.cells].filter((ch) => ch !== 'u').length;

// Wie weit ein Spiel ist: gelöst vor allem, sonst die Zahl der bearbeiteten Felder (und die Zeit).
export function gameProgress(game) {
  if (!game) return -1;
  if (game.status === 'won') return 1_000_000;
  return markedCount(game) * 1000 + Math.min(999, Math.floor(game.time / 1000));
}

function normalizeGame(game, daily) {
  if (!game || typeof game !== 'object') return null;
  const spec = DIFFICULTIES[game.difficulty];
  if (!spec || game.w !== spec.w || game.h !== spec.h) return null;
  if (daily && typeof game.day !== 'string') return null;
  const total = spec.w * spec.h;
  if (typeof game.solution !== 'string' || game.solution.length !== total || !/^[01]+$/.test(game.solution)) return null;
  if (typeof game.cells !== 'string' || game.cells.length !== total || !/^[ufx]+$/.test(game.cells)) return null;
  return {
    ...game,
    id: String(game.id ?? ''),
    time: Number(game.time) > 0 ? Math.round(Number(game.time)) : 0,
    mistakes: Number(game.mistakes) > 0 ? Math.round(Number(game.mistakes)) : 0,
    status: game.status === 'won' ? 'won' : 'playing',
  };
}

export const section = createSection({ normalizeGame, progress: gameProgress });
export const emptyNonogramData = section.empty;
export const normalizeNonogramData = section.normalize;
export const mergeNonogramData = section.merge;
export const reuseUnchangedNonogram = section.reuse;

// ---------- Abzeichen ----------

const total = (d) => totalSolved(d.nonogram.stats);

export const NONOGRAM_ACHIEVEMENTS = [
  { id: 'nono-first', tier: 'bronze', icon: '🖼️', title: 'Erstes Bild', text: 'Ein Nonogramm gelöst.', target: 1, value: total },
  { id: 'nono-10', tier: 'bronze', icon: '🎨', title: 'Pixelkünstler', text: '10 Nonogramme gelöst.', target: 10, value: total },
  { id: 'nono-50', tier: 'silver', icon: '🧩', title: 'Bildermeister', text: '50 Nonogramme gelöst.', target: 50, value: total },
  { id: 'nono-200', tier: 'gold', icon: '🏆', title: 'Nonogramm-Legende', text: '200 Nonogramme gelöst.', target: 200, value: total },
  { id: 'nono-medium', tier: 'bronze', icon: '🔍', title: 'Scharfer Blick', text: 'Ein mittleres Nonogramm gelöst.', target: 1, value: (d) => d.nonogram.stats.medium.won },
  { id: 'nono-hard', tier: 'silver', icon: '🧠', title: 'Knobelprofi', text: 'Ein schweres Nonogramm gelöst.', target: 1, value: (d) => d.nonogram.stats.hard.won },
  { id: 'nono-hard-10', tier: 'gold', icon: '🔥', title: 'Rätselgott', text: '10 schwere Nonogramme gelöst.', target: 10, value: (d) => d.nonogram.stats.hard.won },
  { id: 'nono-flawless', tier: 'silver', icon: '💯', title: 'Kein Fleck', text: 'Ein mittleres oder schweres Nonogramm ohne einen falschen Zug gelöst.', target: 1, value: (d) => d.nonogram.flawless },
  { id: 'nono-daily-10', tier: 'silver', icon: '📅', title: 'Täglich ein Bild', text: '10 Tagesrätsel des Nonogramms gelöst.', target: 10, value: (d) => d.nonogram.stats.daily.won },
  { id: 'nono-fast', tier: 'silver', icon: '⚡', title: 'Schnelle Hand', text: 'Ein leichtes Nonogramm in unter 30 Sekunden gelöst.', target: 1, value: (d) => (d.nonogram.stats.easy.bestMs != null && d.nonogram.stats.easy.bestMs <= 30_000 ? 1 : 0) },
];

export const BADGE_GROUPS = [
  { title: 'Gelöste Bilder', ids: ['nono-first', 'nono-10', 'nono-50', 'nono-200'] },
  { title: 'Stufen', ids: ['nono-medium', 'nono-hard', 'nono-hard-10'] },
  { title: 'Können und Treue', ids: ['nono-flawless', 'nono-fast', 'nono-daily-10'] },
];

export const nonogramAchievements = (data) => achievementStatus(NONOGRAM_ACHIEVEMENTS, data, 'nonogram');
export const unlockNonogramAchievements = (data, now) => unlockFrom(NONOGRAM_ACHIEVEMENTS, data, 'nonogram', now);

export { DIFFICULTY_KEYS };
