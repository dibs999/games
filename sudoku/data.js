// Sudoku-Daten im Profil: laufende Spiele, Statistik und Abzeichen, dazu das Zusammenführen zweier Stände.
// Alles liegt im Profil unter dem Schlüssel "sudoku" (Abzeichen im gemeinsamen Feld "achievements").

import { shiftDayKey } from '../shared/day.js';
import { CELLS, DIFFICULTIES, DIFFICULTY_KEYS, PEERS, fromText, hashString } from './logic.js';

const BIT = (d) => 1 << (d - 1);
const GRID = /^[0-9]{81}$/;
const SOLVED = /^[1-9]{81}$/;

// ---------- Leere und geprüfte Daten ----------

export function emptyStats() {
  return { won: 0, bestMs: null, totalMs: 0 };
}

export function emptyDailyStats() {
  return { ...emptyStats(), streak: 0, maxStreak: 0, lastWonDay: null };
}

export function emptySudokuData() {
  return {
    daily: null, // das Tagesrätsel von heute
    games: {}, // pro Stufe das angefangene Rätsel
    // easy/medium/hard zählen alle gelösten Rätsel der Stufe (auch Tagesrätsel); daily nur die Tage.
    stats: { daily: emptyDailyStats(), easy: emptyStats(), medium: emptyStats(), hard: emptyStats() },
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

function normalizeStats(stats, daily = false) {
  const base = daily ? emptyDailyStats() : emptyStats();
  const next = { ...base, ...(stats && typeof stats === 'object' ? stats : {}) };
  for (const key of ['won', 'totalMs', ...(daily ? ['streak', 'maxStreak'] : [])]) {
    next[key] = Number(next[key]) > 0 ? Math.round(Number(next[key])) : 0;
  }
  next.bestMs = Number(next.bestMs) > 0 ? Math.round(Number(next.bestMs)) : null;
  if (daily && typeof next.lastWonDay !== 'string') next.lastWonDay = null;
  return next;
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
    stats: {
      daily: normalizeStats(data.stats?.daily, true),
      easy: normalizeStats(data.stats?.easy),
      medium: normalizeStats(data.stats?.medium),
      hard: normalizeStats(data.stats?.hard),
    },
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

function pickGame(remote, local) {
  if (!remote || !local) return local || remote;
  if (remote.id === local.id) return gameProgress(local) >= gameProgress(remote) ? local : remote;
  // Verschiedene Rätsel: das, an dem schon gespielt wurde, geht vor.
  const active = (game) => game.status === 'playing' && gameProgress(game) >= 1000;
  return active(remote) && !active(local) ? remote : local;
}

function pickDaily(remote, local) {
  if (!remote || !local) return local || remote;
  if (remote.day !== local.day) return remote.day > local.day ? remote : local;
  return gameProgress(local) >= gameProgress(remote) ? local : remote;
}

function minOrNull(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

// Gelöste Rätsel zählen nur hoch: der Stand mit mehr Siegen enthält die neueren Ergebnisse.
function pickStats(remote, local) {
  const winner = local.won >= remote.won ? local : remote;
  return {
    ...winner,
    bestMs: minOrNull(remote.bestMs, local.bestMs),
    totalMs: Math.max(remote.totalMs, local.totalMs),
  };
}

export function mergeSudokuData(remoteData, localData) {
  const remote = normalizeSudokuData(remoteData);
  const local = normalizeSudokuData(localData);
  const games = {};
  for (const key of DIFFICULTY_KEYS) {
    const game = pickGame(remote.games[key], local.games[key]);
    if (game) games[key] = game;
  }
  const stats = { daily: pickStats(remote.stats.daily, local.stats.daily) };
  for (const key of DIFFICULTY_KEYS) stats[key] = pickStats(remote.stats[key], local.stats[key]);
  return {
    ...remote,
    ...local,
    daily: pickDaily(remote.daily, local.daily),
    games,
    stats,
    flawless: Math.max(remote.flawless, local.flawless),
    settings: local.settings,
  };
}

// Übernimmt neue Daten, behält aber unveränderte Spiele als dieselben Objekte (laufendes Spiel nicht stören).
export function reuseUnchangedSudoku(live, next) {
  if (!live || !next) return next;
  const same = (a, b) => a && b && JSON.stringify(a) === JSON.stringify(b);
  const result = { ...next, games: { ...next.games } };
  if (same(live.daily, next.daily)) result.daily = live.daily;
  for (const key of Object.keys(result.games)) {
    if (same(live.games?.[key], result.games[key])) result.games[key] = live.games[key];
  }
  return result;
}

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
  const { stats } = sudoku;
  const level = stats[game.difficulty];
  const isBest = level.bestMs == null || game.time < level.bestMs;
  stats[game.difficulty] = {
    won: level.won + 1,
    bestMs: isBest ? game.time : level.bestMs,
    totalMs: level.totalMs + game.time,
  };
  if (game.day) {
    const daily = stats.daily;
    const streak = daily.lastWonDay === shiftDayKey(game.day, -1) ? daily.streak + 1 : 1;
    stats.daily = {
      won: daily.won + 1,
      bestMs: minOrNull(daily.bestMs, game.time),
      totalMs: daily.totalMs + game.time,
      streak,
      maxStreak: Math.max(daily.maxStreak, streak),
      lastWonDay: game.day,
    };
  }
  if (game.mistakes === 0 && game.difficulty !== 'easy') sudoku.flawless += 1;
  return { isBest };
}

// Aktuelle Serie im Tagesrätsel (gilt weiter, wenn gestern gelöst wurde und heute noch offen ist).
export function currentDailyStreak(stats, today) {
  if (!stats.lastWonDay) return 0;
  return stats.lastWonDay === today || stats.lastWonDay === shiftDayKey(today, -1) ? stats.streak : 0;
}

export function totalSolved(sudoku) {
  return DIFFICULTY_KEYS.reduce((sum, key) => sum + sudoku.stats[key].won, 0);
}

export function averageMs(stats) {
  return stats.won ? Math.round(stats.totalMs / stats.won) : null;
}

export function formatTime(ms) {
  if (ms == null) return '–';
  const seconds = Math.round(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ---------- Rangliste ----------

// Platz in einer sortierten Rangliste (1-basiert); Gleichstand teilt sich den Platz.
export function rankOf(rows, id, value) {
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return null;
  const mine = value(rows[index]);
  return rows.findIndex((row) => value(row) === mine) + 1;
}

// Tagesrätsel von heute: gelöst nach Zeit (weniger Fehler zuerst), danach angefangen, danach offen.
export function dailyRanking(profiles, day) {
  const rows = profiles.map(({ id, name, data }) => {
    const game = data.sudoku?.daily;
    if (!game || game.day !== day) return { id, name, tier: 2, ms: null, mistakes: 0, filled: 0 };
    if (game.status === 'won') return { id, name, tier: 0, ms: game.time, mistakes: game.mistakes, filled: 81 };
    const filled = gameProgress(game) >= 1000 ? Math.floor(gameProgress(game) / 1000) : 0;
    return { id, name, tier: filled > 0 ? 1 : 2, ms: null, mistakes: game.mistakes, filled };
  });
  return rows.sort(
    (a, b) =>
      a.tier - b.tier ||
      (a.ms ?? Infinity) - (b.ms ?? Infinity) ||
      b.filled - a.filled ||
      a.mistakes - b.mistakes ||
      a.name.localeCompare(b.name, 'de'),
  );
}

// Bestzeit je Stufe (ohne Zeit steht man am Ende).
export function bestTimeRanking(profiles, difficulty) {
  return profiles
    .map(({ id, name, data }) => {
      const stats = data.sudoku?.stats?.[difficulty] ?? emptyStats();
      return { id, name, bestMs: stats.bestMs, won: stats.won };
    })
    .sort((a, b) => (a.bestMs ?? Infinity) - (b.bestMs ?? Infinity) || b.won - a.won || a.name.localeCompare(b.name, 'de'));
}

export function streakRanking(profiles, today) {
  return profiles
    .map(({ id, name, data }) => {
      const daily = data.sudoku?.stats?.daily ?? emptyDailyStats();
      return { id, name, streak: currentDailyStreak(daily, today), best: daily.maxStreak };
    })
    .sort((a, b) => b.streak - a.streak || b.best - a.best || a.name.localeCompare(b.name, 'de'));
}

export function solvedRanking(profiles) {
  return profiles
    .map(({ id, name, data }) => ({ id, name, solved: data.sudoku ? totalSolved(data.sudoku) : 0 }))
    .sort((a, b) => b.solved - a.solved || a.name.localeCompare(b.name, 'de'));
}

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

// Stand der Sudoku-Abzeichen: Fortschritt, ob erreicht und seit wann (ein gespeichertes Abzeichen bleibt erreicht).
export function sudokuAchievements(data) {
  return SUDOKU_ACHIEVEMENTS.map(({ value, ...a }) => {
    const progress = Math.min(value(data), a.target);
    const earnedAt = data.achievements?.[a.id] || null;
    return { ...a, group: 'sudoku', progress, earned: Boolean(earnedAt) || progress >= a.target, earnedAt };
  });
}

// Trägt neu erreichte Abzeichen mit Datum ein und gibt sie zurück.
export function unlockSudokuAchievements(data, now = new Date().toISOString()) {
  const unlocked = [];
  for (const { value, ...a } of SUDOKU_ACHIEVEMENTS) {
    if (data.achievements[a.id] || value(data) < a.target) continue;
    data.achievements[a.id] = now;
    unlocked.push({ ...a, group: 'sudoku' });
  }
  return unlocked;
}

export { DIFFICULTIES, DIFFICULTY_KEYS, hashString };
