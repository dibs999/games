// Statistik, Zusammenführen, Ranglisten und Abzeichen für Rätsel mit Stufen (Sudoku, Kreuzworträtsel, …).
//
// Ein Rätselspiel legt im Profil einen Abschnitt ab (z. B. data.sudoku) mit:
//   stats: { daily, easy, medium, hard }   Tagesrätsel-Serie und Ergebnisse je Stufe
//   daily: das Tagesrätsel von heute (mit Feldern day, status, time, mistakes)
// Die Funktionen hier arbeiten auf diesem Abschnitt.

import { shiftDayKey } from './day.js';

export const LEVELS = ['easy', 'medium', 'hard'];
export const LEVEL_NAME = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };

// ---------- Statistik ----------

export function emptyStats() {
  return { won: 0, bestMs: null, totalMs: 0 };
}

export function emptyDailyStats() {
  return { ...emptyStats(), streak: 0, maxStreak: 0, lastWonDay: null };
}

// easy/medium/hard zählen alle gelösten Rätsel der Stufe (auch Tagesrätsel); daily nur die Tage.
export function emptyStatsSet() {
  return { daily: emptyDailyStats(), easy: emptyStats(), medium: emptyStats(), hard: emptyStats() };
}

export function normalizeStats(stats, daily = false) {
  const base = daily ? emptyDailyStats() : emptyStats();
  const next = { ...base, ...(stats && typeof stats === 'object' ? stats : {}) };
  for (const key of ['won', 'totalMs', ...(daily ? ['streak', 'maxStreak'] : [])]) {
    next[key] = Number(next[key]) > 0 ? Math.round(Number(next[key])) : 0;
  }
  next.bestMs = Number(next.bestMs) > 0 ? Math.round(Number(next.bestMs)) : null;
  if (daily && typeof next.lastWonDay !== 'string') next.lastWonDay = null;
  return next;
}

export function normalizeStatsSet(stats) {
  return {
    daily: normalizeStats(stats?.daily, true),
    easy: normalizeStats(stats?.easy),
    medium: normalizeStats(stats?.medium),
    hard: normalizeStats(stats?.hard),
  };
}

export function minOrNull(a, b) {
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

export function mergeStatsSet(remote, local) {
  const merged = { daily: pickStats(remote.daily, local.daily) };
  for (const key of LEVELS) merged[key] = pickStats(remote[key], local[key]);
  return merged;
}

// Trägt einen gelösten Durchgang in die Statistik ein (Stufe, Zeit, beim Tagesrätsel auch die Serie).
// game: { difficulty, time, day? }. Ergebnis: { isBest } (neue Bestzeit der Stufe).
export function recordWin(stats, game) {
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
  return { isBest };
}

// Aktuelle Serie im Tagesrätsel (gilt weiter, wenn gestern gelöst wurde und heute noch offen ist).
export function currentDailyStreak(stats, today) {
  if (!stats.lastWonDay) return 0;
  return stats.lastWonDay === today || stats.lastWonDay === shiftDayKey(today, -1) ? stats.streak : 0;
}

export function totalSolved(stats) {
  return LEVELS.reduce((sum, key) => sum + stats[key].won, 0);
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

// ---------- Ranglisten ----------

// Platz in einer sortierten Rangliste (1-basiert); Gleichstand teilt sich den Platz.
export function rankOf(rows, id, value) {
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return null;
  const mine = value(rows[index]);
  return rows.findIndex((row) => value(row) === mine) + 1;
}

// Tagesrätsel von heute: gelöst nach Zeit, danach angefangen (die meisten Felder zuerst), danach offen.
// progressOf(game) liefert eine Zahl, die mit dem Fortschritt wächst, ab 1000 gilt das Rätsel als angefangen
// (wie bei gameProgress der Spiele: 1000 je selbst belegtes Feld).
export function dailyRanking(profiles, day, section, progressOf) {
  const rows = profiles.map(({ id, name, data }) => {
    const game = data[section]?.daily;
    if (!game || game.day !== day) return { id, name, tier: 2, ms: null, mistakes: 0, filled: 0 };
    if (game.status === 'won') return { id, name, tier: 0, ms: game.time, mistakes: game.mistakes, filled: 1e9 };
    const progress = progressOf(game);
    const filled = progress >= 1000 ? Math.floor(progress / 1000) : 0;
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
export function bestTimeRanking(profiles, section, difficulty) {
  return profiles
    .map(({ id, name, data }) => {
      const stats = data[section]?.stats?.[difficulty] ?? emptyStats();
      return { id, name, bestMs: stats.bestMs, won: stats.won };
    })
    .sort((a, b) => (a.bestMs ?? Infinity) - (b.bestMs ?? Infinity) || b.won - a.won || a.name.localeCompare(b.name, 'de'));
}

export function streakRanking(profiles, section, today) {
  return profiles
    .map(({ id, name, data }) => {
      const daily = data[section]?.stats?.daily ?? emptyDailyStats();
      return { id, name, streak: currentDailyStreak(daily, today), best: daily.maxStreak };
    })
    .sort((a, b) => b.streak - a.streak || b.best - a.best || a.name.localeCompare(b.name, 'de'));
}

export function solvedRanking(profiles, section) {
  return profiles
    .map(({ id, name, data }) => ({ id, name, solved: data[section]?.stats ? totalSolved(data[section].stats) : 0 }))
    .sort((a, b) => b.solved - a.solved || a.name.localeCompare(b.name, 'de'));
}

// ---------- Abzeichen ----------

// Stand einer Abzeichen-Liste: Fortschritt, ob erreicht und seit wann (ein gespeichertes Abzeichen bleibt erreicht).
export function achievementStatus(list, data, group) {
  return list.map(({ value, ...a }) => {
    const progress = Math.min(value(data), a.target);
    const earnedAt = data.achievements?.[a.id] || null;
    return { ...a, group, progress, earned: Boolean(earnedAt) || progress >= a.target, earnedAt };
  });
}

// Trägt neu erreichte Abzeichen mit Datum ein und gibt sie zurück.
export function unlockFrom(list, data, group, now = new Date().toISOString()) {
  const unlocked = [];
  for (const { value, ...a } of list) {
    if (data.achievements[a.id] || value(data) < a.target) continue;
    data.achievements[a.id] = now;
    unlocked.push({ ...a, group });
  }
  return unlocked;
}

// ---------- Spielstände zusammenführen ----------

// Zwei Stände desselben Rätsels (progress: Fortschritt eines Spiels, größer = weiter, -1 für kein Spiel).
// Verschiedene Rätsel: das, an dem schon gespielt wurde (Fortschritt ab 1000), geht vor.
export function pickGame(remote, local, progress) {
  if (!remote || !local) return local || remote;
  if (remote.id === local.id) return progress(local) >= progress(remote) ? local : remote;
  const active = (game) => game.status === 'playing' && progress(game) >= 1000;
  return active(remote) && !active(local) ? remote : local;
}

// Tagesrätsel: ein neuerer Tag geht vor, am selben Tag der weiter fortgeschrittene Stand.
export function pickDaily(remote, local, progress) {
  if (!remote || !local) return local || remote;
  if (remote.day !== local.day) return remote.day > local.day ? remote : local;
  return progress(local) >= progress(remote) ? local : remote;
}

// Übernimmt neue Daten, behält aber unveränderte Spiele als dieselben Objekte (laufendes Spiel nicht stören).
export function reuseUnchanged(live, next) {
  if (!live || !next) return next;
  const same = (a, b) => a && b && JSON.stringify(a) === JSON.stringify(b);
  const result = { ...next, games: { ...next.games } };
  if (same(live.daily, next.daily)) result.daily = live.daily;
  for (const key of Object.keys(result.games)) {
    if (same(live.games?.[key], result.games[key])) result.games[key] = live.games[key];
  }
  return result;
}
