// Sudoku-Daten im Profil: laufende Spiele, Statistik und Abzeichen, dazu das Zusammenführen zweier Stände.
// Alles liegt im Profil unter dem Schlüssel "sudoku" (Abzeichen im gemeinsamen Feld "achievements").

import {
  emptyStats,
  emptyDailyStats,
  emptyStatsSet,
  normalizeStatsSet,
  mergeStatsSet,
  recordWin,
  currentDailyStreak,
  totalSolved as totalSolvedStats,
  averageMs,
  formatTime,
  rankOf,
  dailyRanking as dailyRankingFor,
  bestTimeRanking as bestTimeRankingFor,
  streakRanking as streakRankingFor,
  solvedRanking as solvedRankingFor,
  achievementStatus,
  unlockFrom,
  pickGame as pickGameBy,
  pickDaily as pickDailyBy,
  reuseUnchanged,
} from '../shared/puzzle-stats.js';
import { CELLS, DIFFICULTIES, DIFFICULTY_KEYS, PEERS, fromText, hashString } from './logic.js';

const BIT = (d) => 1 << (d - 1);
const GRID = /^[0-9]{81}$/;
const SOLVED = /^[1-9]{81}$/;

// ---------- Leere und geprüfte Daten ----------

export function emptySudokuData() {
  return {
    daily: null, // das Tagesrätsel von heute
    games: {}, // pro Stufe das angefangene Rätsel
    stats: emptyStatsSet(),
    flawless: 0, // mittlere oder schwere Rätsel ohne einen Fehler
    settings: { showErrors: true },
  };
}

// Ein neues Spiel aus einem erzeugten Rätsel. id: beim Tagesrätsel der Tag, sonst eine Zufallskennung.
export function newGame({ puzzle, solution, difficulty }, id) {
  return { id, difficulty, puzzle, solution, cells: puzzle, notes: {}, time: 0, mistakes: 0, status: 'playing' };
}

export function randomGameId() {
  return Math.floor(Math.random() * 2 ** 40).toString(36);
}

function normalizeGame(game, daily) {
  if (!game || typeof game !== 'object') return null;
  if (!DIFFICULTY_KEYS.includes(game.difficulty)) return null;
  if (!GRID.test(game.puzzle) || !SOLVED.test(game.solution) || !GRID.test(game.cells)) return null;
  if (daily && typeof game.day !== 'string') return null;
  // Die Vorgaben dürfen sich nicht verändert haben.
  for (let i = 0; i < CELLS; i++) {
    if (game.puzzle[i] !== '0' && game.cells[i] !== game.puzzle[i]) return null;
  }
  const notes = {};
  if (game.notes && typeof game.notes === 'object') {
    for (const [key, mask] of Object.entries(game.notes)) {
      const i = Number(key);
      if (Number.isInteger(i) && i >= 0 && i < CELLS && Number.isInteger(mask) && mask > 0 && mask <= 511) notes[i] = mask;
    }
  }
  return {
    ...game,
    id: String(game.id ?? ''),
    notes,
    time: Number(game.time) > 0 ? Math.round(Number(game.time)) : 0,
    mistakes: Number(game.mistakes) > 0 ? Math.round(Number(game.mistakes)) : 0,
    status: game.status === 'won' ? 'won' : 'playing',
  };
}

export function normalizeSudokuData(data) {
  const base = emptySudokuData();
  if (!data || typeof data !== 'object') return base;
  const games = {};
  for (const key of DIFFICULTY_KEYS) {
    const game = normalizeGame(data.games?.[key], false);
    if (game && game.difficulty === key) games[key] = game;
  }
  return {
    ...base,
    ...data,
    daily: normalizeGame(data.daily, true),
    games,
    stats: normalizeStatsSet(data.stats),
    flawless: Number(data.flawless) > 0 ? Math.round(Number(data.flawless)) : 0,
    settings: { ...base.settings, ...(data.settings && typeof data.settings === 'object' ? data.settings : {}) },
  };
}

// ---------- Zusammenführen zweier Stände (zwei Geräte) ----------

// Wie weit ein Spiel ist: gelöst vor allem anderen, sonst die Zahl der selbst eingetragenen Ziffern.
export function gameProgress(game) {
  if (!game) return -1;
  if (game.status === 'won') return 1_000_000;
  let filled = 0;
  for (let i = 0; i < CELLS; i++) if (game.cells[i] !== game.puzzle[i]) filled += 1;
  return filled * 1000 + Math.min(999, Math.floor(game.time / 1000));
}

export function mergeSudokuData(remoteData, localData) {
  const remote = normalizeSudokuData(remoteData);
  const local = normalizeSudokuData(localData);
  const games = {};
  for (const key of DIFFICULTY_KEYS) {
    const game = pickGameBy(remote.games[key], local.games[key], gameProgress);
    if (game) games[key] = game;
  }
  return {
    ...remote,
    ...local,
    daily: pickDailyBy(remote.daily, local.daily, gameProgress),
    games,
    stats: mergeStatsSet(remote.stats, local.stats),
    flawless: Math.max(remote.flawless, local.flawless),
    settings: local.settings,
  };
}

export const reuseUnchangedSudoku = reuseUnchanged;

// ---------- Spielzüge ----------

export const isGiven = (game, i) => game.puzzle[i] !== '0';
export const cellValue = (game, i) => Number(game.cells[i]);
export const isWrong = (game, i) => game.cells[i] !== '0' && game.cells[i] !== game.solution[i];

function withCell(text, i, value) {
  return text.slice(0, i) + value + text.slice(i + 1);
}

// Trägt eine Ziffer ein. Ergebnis: false, wenn nichts passiert ist (Vorgabe, gleiche Ziffer, Spiel vorbei).
// Notizen der Nachbarfelder mit dieser Ziffer werden gestrichen, ein falscher Eintrag zählt als Fehler.
export function placeDigit(game, i, d) {
  if (game.status !== 'playing' || isGiven(game, i) || game.cells[i] === String(d)) return false;
  game.cells = withCell(game.cells, i, d);
  delete game.notes[i];
  for (const p of PEERS[i]) {
    if (game.notes[p] & BIT(d)) {
      game.notes[p] &= ~BIT(d);
      if (!game.notes[p]) delete game.notes[p];
    }
  }
  if (String(d) !== game.solution[i]) game.mistakes += 1;
  if (game.cells === game.solution) game.status = 'won';
  return true;
}

// Schaltet eine Notiz in einem leeren Feld um.
export function toggleNote(game, i, d) {
  if (game.status !== 'playing' || isGiven(game, i) || game.cells[i] !== '0') return false;
  const mask = (game.notes[i] || 0) ^ BIT(d);
  if (mask) game.notes[i] = mask;
  else delete game.notes[i];
  return true;
}

// Löscht Ziffer und Notizen eines selbst belegten Feldes.
export function eraseCell(game, i) {
  if (game.status !== 'playing' || isGiven(game, i)) return false;
  if (game.cells[i] === '0' && !game.notes[i]) return false;
  game.cells = withCell(game.cells, i, 0);
  delete game.notes[i];
  return true;
}

// Alle Notizen für leere Felder aus den möglichen Ziffern füllen (Knopf "Notizen füllen").
export function fillNotes(game) {
  if (game.status !== 'playing') return false;
  const grid = fromText(game.cells);
  for (let i = 0; i < CELLS; i++) {
    if (grid[i]) {
      delete game.notes[i];
      continue;
    }
    let mask = 511;
    for (const p of PEERS[i]) if (grid[p]) mask &= ~BIT(grid[p]);
    game.notes[i] = mask;
  }
  return true;
}

export function filledCount(game) {
  let n = 0;
  for (const c of game.cells) if (c !== '0') n += 1;
  return n;
}

// ---------- Ergebnis und Statistik ----------

// Trägt einen gelösten Durchgang in die Statistik ein. Ergebnis: { isBest } (neue Bestzeit der Stufe).
export function recordSudokuWin(sudoku, game) {
  const result = recordWin(sudoku.stats, game);
  if (game.mistakes === 0 && game.difficulty !== 'easy') sudoku.flawless += 1;
  return result;
}

export const totalSolved = (sudoku) => totalSolvedStats(sudoku.stats);

export { emptyStats, emptyDailyStats, currentDailyStreak, averageMs, formatTime, rankOf };

// ---------- Rangliste ----------

// Tagesrätsel von heute: gelöst nach Zeit, danach angefangen, danach offen.
export const dailyRanking = (profiles, day) => dailyRankingFor(profiles, day, 'sudoku', gameProgress);
export const bestTimeRanking = (profiles, difficulty) => bestTimeRankingFor(profiles, 'sudoku', difficulty);
export const streakRanking = (profiles, today) => streakRankingFor(profiles, 'sudoku', today);
export const solvedRanking = (profiles) => solvedRankingFor(profiles, 'sudoku');

// ---------- Abzeichen ----------

const solvedCount = (d) => totalSolved(d.sudoku);
const dailyBest = (d) => d.sudoku.stats.daily.maxStreak;

export const SUDOKU_ACHIEVEMENTS = [
  { id: 'sudoku-first', tier: 'bronze', icon: '🧩', title: 'Erstes Sudoku', text: 'Ein Sudoku gelöst.', target: 1, value: solvedCount },
  { id: 'sudoku-10', tier: 'bronze', icon: '🔢', title: 'Rätselfreund', text: '10 Sudokus gelöst.', target: 10, value: solvedCount },
  { id: 'sudoku-50', tier: 'silver', icon: '🧠', title: 'Zahlenprofi', text: '50 Sudokus gelöst.', target: 50, value: solvedCount },
  { id: 'sudoku-200', tier: 'gold', icon: '🏆', title: 'Sudoku-Meister', text: '200 Sudokus gelöst.', target: 200, value: solvedCount },
  { id: 'sudoku-medium', tier: 'bronze', icon: '🧗', title: 'Mittelstufe', text: 'Ein mittleres Sudoku gelöst.', target: 1, value: (d) => d.sudoku.stats.medium.won },
  { id: 'sudoku-hard', tier: 'silver', icon: '🥜', title: 'Harte Nuss', text: 'Ein schweres Sudoku gelöst.', target: 1, value: (d) => d.sudoku.stats.hard.won },
  { id: 'sudoku-hard-10', tier: 'gold', icon: '🔥', title: 'Knobelkönig', text: '10 schwere Sudokus gelöst.', target: 10, value: (d) => d.sudoku.stats.hard.won },
  { id: 'sudoku-daily-3', tier: 'bronze', icon: '📅', title: 'Drei Tage dabei', text: '3 Tagesrätsel hintereinander gelöst.', target: 3, value: dailyBest },
  { id: 'sudoku-daily-7', tier: 'silver', icon: '🗓️', title: 'Eine Woche Sudoku', text: '7 Tagesrätsel hintereinander gelöst.', target: 7, value: dailyBest },
  { id: 'sudoku-daily-30', tier: 'gold', icon: '🌟', title: 'Ein Monat Sudoku', text: '30 Tagesrätsel hintereinander gelöst.', target: 30, value: dailyBest },
  { id: 'sudoku-flawless', tier: 'silver', icon: '🎯', title: 'Makellos', text: 'Ein mittleres oder schweres Sudoku ohne einen Fehler gelöst.', target: 1, value: (d) => d.sudoku.flawless },
  { id: 'sudoku-fast', tier: 'silver', icon: '⚡', title: 'Blitzrechner', text: 'Ein leichtes Sudoku in unter 5 Minuten gelöst.', target: 1, value: (d) => (d.sudoku.stats.easy.bestMs != null && d.sudoku.stats.easy.bestMs <= 300_000 ? 1 : 0) },
];

// Stand der Sudoku-Abzeichen: Fortschritt, ob erreicht und seit wann.
export const sudokuAchievements = (data) => achievementStatus(SUDOKU_ACHIEVEMENTS, data, 'sudoku');

// Trägt neu erreichte Abzeichen mit Datum ein und gibt sie zurück.
export const unlockSudokuAchievements = (data, now) => unlockFrom(SUDOKU_ACHIEVEMENTS, data, 'sudoku', now);

export { DIFFICULTIES, DIFFICULTY_KEYS, hashString };
