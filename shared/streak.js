// Tages-Serie über alle Spiele: Sie wächst, wenn an einem Tag irgendein Tagesrätsel gelöst wurde.
// So muss man nicht in jedem Spiel jeden Tag spielen, um die Serie zu halten.
//
// Gespeichert im Profil unter "dayStreak": { current, max, lastDay }.

import { shiftDayKey } from './day.js';

export function emptyDayStreak() {
  return { current: 0, max: 0, lastDay: null };
}

export function normalizeDayStreak(streak) {
  const base = emptyDayStreak();
  if (!streak || typeof streak !== 'object') return base;
  const positive = (value) => (Number(value) > 0 ? Math.round(Number(value)) : 0);
  const current = positive(streak.current);
  const lastDay = typeof streak.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(streak.lastDay) ? streak.lastDay : null;
  return { current: lastDay ? current : 0, max: Math.max(positive(streak.max), lastDay ? current : 0), lastDay };
}

// Zwei Stände (z. B. von zwei Geräten): der mit dem späteren letzten Tag gilt, bei gleichem Tag die längere Serie.
export function mergeDayStreak(a, b) {
  const x = normalizeDayStreak(a);
  const y = normalizeDayStreak(b);
  let latest = x;
  if ((y.lastDay || '') > (x.lastDay || '')) latest = y;
  else if (y.lastDay === x.lastDay && y.current > x.current) latest = y;
  return { current: latest.current, lastDay: latest.lastDay, max: Math.max(x.max, y.max) };
}

// Ein Tagesrätsel wurde an diesem Tag gelöst. Gibt den neuen Stand zurück (mehrere am selben Tag zählen einmal).
export function recordDailyWin(streak, day) {
  const state = normalizeDayStreak(streak);
  if (state.lastDay === day) return state;
  const current = state.lastDay === shiftDayKey(day, -1) ? state.current + 1 : 1;
  return { current, max: Math.max(state.max, current), lastDay: day };
}

// Aktuelle Serie: sie gilt weiter, wenn gestern gelöst wurde und heute noch offen ist.
export function currentDayStreak(streak, today) {
  const state = normalizeDayStreak(streak);
  if (!state.lastDay) return 0;
  return state.lastDay === today || state.lastDay === shiftDayKey(today, -1) ? state.current : 0;
}

export function solvedToday(streak, today) {
  return normalizeDayStreak(streak).lastDay === today;
}

// Startwert für Profile aus der Zeit vor der gemeinsamen Serie: aus den Serien der einzelnen Spiele.
// dailyStats: Liste von { streak, maxStreak, lastWonDay }.
export function deriveDayStreak(dailyStats) {
  let derived = emptyDayStreak();
  for (const stats of dailyStats) {
    if (!stats) continue;
    const one = normalizeDayStreak({ current: stats.streak, max: stats.maxStreak, lastDay: stats.lastWonDay });
    const max = Math.max(derived.max, Number(stats.maxStreak) > 0 ? Math.round(Number(stats.maxStreak)) : 0);
    derived = { ...mergeDayStreak(derived, one), max };
  }
  return derived;
}
