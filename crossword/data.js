// Kreuzworträtsel-Daten im Profil: laufende Rätsel, Statistik und Abzeichen, dazu das Zusammenführen zweier Stände.
// Alles liegt im Profil unter dem Schlüssel "crossword" (Abzeichen im gemeinsamen Feld "achievements").
//
// Ein Spiel speichert nur das Gitter (Wörter als Nummern aus words.js) und die eingetragenen Buchstaben.
// Dadurch bleibt ein Spielstand klein (rund 0,5 KB), und ein später verbesserter Hinweistext erscheint von selbst.

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
  pickGame,
  pickDaily,
  reuseUnchanged,
} from '../shared/puzzle-stats.js';
import { DIFFICULTY_KEYS, buildPuzzle } from './logic.js';

const ENTRIES = /^[A-ZÄÖÜ.]+$/;

// ---------- Leere und geprüfte Daten ----------

export function emptyCrosswordData() {
  return {
    daily: null, // das Tagesrätsel von heute
    games: {}, // pro Stufe das angefangene Rätsel
    stats: emptyStatsSet(),
    flawless: 0, // mittlere oder schwere Rätsel ohne einen falschen Buchstaben
    settings: { showErrors: true },
  };
}

// Ein neues Spiel aus einem erzeugten Rätsel. id: beim Tagesrätsel der Tag, sonst eine Zufallskennung.
export function newGame({ w, h, words, difficulty }, id) {
  return { id, difficulty, w, h, words, entries: '.'.repeat(w * h), time: 0, mistakes: 0, status: 'playing' };
}

export function randomGameId() {
  return Math.floor(Math.random() * 2 ** 40).toString(36);
}

// Das aufgebaute Rätsel zu einem Spiel (Hinweise, Nummern, Lösung). Wird je Spielobjekt zwischengemerkt.
const built = new WeakMap();
export function puzzleOf(game) {
  if (!built.has(game)) built.set(game, buildPuzzle(game));
  return built.get(game);
}

function normalizeGame(game, daily) {
  if (!game || typeof game !== 'object') return null;
  if (!DIFFICULTY_KEYS.includes(game.difficulty)) return null;
  if (daily && typeof game.day !== 'string') return null;
  const puzzle = buildPuzzle(game);
  if (!puzzle) return null;
  if (typeof game.entries !== 'string' || game.entries.length !== puzzle.w * puzzle.h || !ENTRIES.test(game.entries)) return null;
  // Buchstaben nur auf freien Feldern.
  for (let i = 0; i < puzzle.solution.length; i++) {
    if (puzzle.solution[i] === '.' && game.entries[i] !== '.') return null;
  }
  return {
    ...game,
    id: String(game.id ?? ''),
    words: game.words.map((word) => [...word]),
    time: Number(game.time) > 0 ? Math.round(Number(game.time)) : 0,
    mistakes: Number(game.mistakes) > 0 ? Math.round(Number(game.mistakes)) : 0,
    status: game.status === 'won' ? 'won' : 'playing',
  };
}

export function normalizeCrosswordData(data) {
  const base = emptyCrosswordData();
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

export function filledCount(game) {
  let n = 0;
  for (const ch of game.entries) if (ch !== '.') n += 1;
  return n;
}

// Wie weit ein Spiel ist: gelöst vor allem anderen, sonst die Zahl der eingetragenen Buchstaben.
export function gameProgress(game) {
  if (!game) return -1;
  if (game.status === 'won') return 1_000_000;
  return filledCount(game) * 1000 + Math.min(999, Math.floor(game.time / 1000));
}

export function mergeCrosswordData(remoteData, localData) {
  const remote = normalizeCrosswordData(remoteData);
  const local = normalizeCrosswordData(localData);
  const games = {};
  for (const key of DIFFICULTY_KEYS) {
    const game = pickGame(remote.games[key], local.games[key], gameProgress);
    if (game) games[key] = game;
  }
  return {
    ...remote,
    ...local,
    daily: pickDaily(remote.daily, local.daily, gameProgress),
    games,
    stats: mergeStatsSet(remote.stats, local.stats),
    flawless: Math.max(remote.flawless, local.flawless),
    settings: local.settings,
  };
}

export const reuseUnchangedCrossword = reuseUnchanged;

// ---------- Spielzüge ----------

function withEntry(text, i, value) {
  return text.slice(0, i) + value + text.slice(i + 1);
}

// Trägt einen Buchstaben ein. Ergebnis: false, wenn nichts passiert ist (schwarzes Feld, gleicher Buchstabe,
// Spiel vorbei). Ein falscher Buchstabe zählt als Fehler; stimmt am Ende alles, ist das Rätsel gelöst.
export function setLetter(game, i, letter) {
  const puzzle = puzzleOf(game);
  if (game.status !== 'playing' || puzzle.solution[i] === '.' || game.entries[i] === letter) return false;
  game.entries = withEntry(game.entries, i, letter);
  if (letter !== puzzle.solution[i]) game.mistakes += 1;
  if (game.entries === puzzle.solution) game.status = 'won';
  return true;
}

export function clearCell(game, i) {
  const puzzle = puzzleOf(game);
  if (game.status !== 'playing' || puzzle.solution[i] === '.' || game.entries[i] === '.') return false;
  game.entries = withEntry(game.entries, i, '.');
  return true;
}

// Ein Feld ist falsch, wenn dort ein anderer Buchstabe als in der Lösung steht.
export function isWrong(game, i) {
  return game.entries[i] !== '.' && game.entries[i] !== puzzleOf(game).solution[i];
}

// Ein Wort ist fertig, wenn alle seine Felder richtig gefüllt sind.
export function wordDone(game, word) {
  return word.cells.every((i) => game.entries[i] === puzzleOf(game).solution[i]);
}

// ---------- Ergebnis und Statistik ----------

// Trägt einen gelösten Durchgang in die Statistik ein. Ergebnis: { isBest } (neue Bestzeit der Stufe).
export function recordCrosswordWin(crossword, game) {
  const result = recordWin(crossword.stats, game);
  if (game.mistakes === 0 && game.difficulty !== 'easy') crossword.flawless += 1;
  return result;
}

export const totalSolved = (crossword) => totalSolvedStats(crossword.stats);

export { emptyStats, emptyDailyStats, currentDailyStreak, averageMs, formatTime, rankOf };

// ---------- Rangliste ----------

export const dailyRanking = (profiles, day) => dailyRankingFor(profiles, day, 'crossword', gameProgress);
export const bestTimeRanking = (profiles, difficulty) => bestTimeRankingFor(profiles, 'crossword', difficulty);
export const streakRanking = (profiles, today) => streakRankingFor(profiles, 'crossword', today);
export const solvedRanking = (profiles) => solvedRankingFor(profiles, 'crossword');

// ---------- Abzeichen ----------

const solvedCount = (d) => totalSolved(d.crossword);
const dailyBest = (d) => d.crossword.stats.daily.maxStreak;

export const CROSSWORD_ACHIEVEMENTS = [
  { id: 'kreuz-first', tier: 'bronze', icon: '✏️', title: 'Erstes Kreuzworträtsel', text: 'Ein Kreuzworträtsel gelöst.', target: 1, value: solvedCount },
  { id: 'kreuz-10', tier: 'bronze', icon: '📖', title: 'Rätselheft', text: '10 Kreuzworträtsel gelöst.', target: 10, value: solvedCount },
  { id: 'kreuz-50', tier: 'silver', icon: '🎓', title: 'Wortakrobat', text: '50 Kreuzworträtsel gelöst.', target: 50, value: solvedCount },
  { id: 'kreuz-200', tier: 'gold', icon: '👑', title: 'Kreuzwort-Meister', text: '200 Kreuzworträtsel gelöst.', target: 200, value: solvedCount },
  { id: 'kreuz-medium', tier: 'bronze', icon: '🔍', title: 'Gut kombiniert', text: 'Ein mittleres Kreuzworträtsel gelöst.', target: 1, value: (d) => d.crossword.stats.medium.won },
  { id: 'kreuz-hard', tier: 'silver', icon: '💎', title: 'Wissensschatz', text: 'Ein schweres Kreuzworträtsel gelöst.', target: 1, value: (d) => d.crossword.stats.hard.won },
  { id: 'kreuz-hard-10', tier: 'gold', icon: '🏅', title: 'Lexikon auf Beinen', text: '10 schwere Kreuzworträtsel gelöst.', target: 10, value: (d) => d.crossword.stats.hard.won },
  { id: 'kreuz-daily-3', tier: 'bronze', icon: '🗞️', title: 'Drei Tage dabei', text: '3 Tageskreuzworträtsel hintereinander gelöst.', target: 3, value: dailyBest },
  { id: 'kreuz-daily-7', tier: 'silver', icon: '📰', title: 'Eine Woche Rätselspaß', text: '7 Tageskreuzworträtsel hintereinander gelöst.', target: 7, value: dailyBest },
  { id: 'kreuz-daily-30', tier: 'gold', icon: '🎖️', title: 'Ein Monat Rätselspaß', text: '30 Tageskreuzworträtsel hintereinander gelöst.', target: 30, value: dailyBest },
  { id: 'kreuz-flawless', tier: 'silver', icon: '💯', title: 'Kein Fehltritt', text: 'Ein mittleres oder schweres Kreuzworträtsel ohne einen falschen Buchstaben gelöst.', target: 1, value: (d) => d.crossword.flawless },
  { id: 'kreuz-fast', tier: 'silver', icon: '✍️', title: 'Flinke Feder', text: 'Ein leichtes Kreuzworträtsel in unter 4 Minuten gelöst.', target: 1, value: (d) => (d.crossword.stats.easy.bestMs != null && d.crossword.stats.easy.bestMs <= 240_000 ? 1 : 0) },
];

export const crosswordAchievements = (data) => achievementStatus(CROSSWORD_ACHIEVEMENTS, data, 'crossword');
export const unlockCrosswordAchievements = (data, now) => unlockFrom(CROSSWORD_ACHIEVEMENTS, data, 'crossword', now);
