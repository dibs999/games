// Tests für die gemeinsame Tages-Serie: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyDayStreak,
  normalizeDayStreak,
  mergeDayStreak,
  recordDailyWin,
  currentDayStreak,
  solvedToday,
  deriveDayStreak,
} from '../shared/streak.js';
import { emptyProfileData, normalizeProfileData, mergeProfileData } from '../shared/profile.js';

test('Eine Serie wächst, wenn an aufeinanderfolgenden Tagen irgendein Tagesrätsel gelöst wird', () => {
  let streak = emptyDayStreak();
  streak = recordDailyWin(streak, '2026-11-10');
  streak = recordDailyWin(streak, '2026-11-11');
  streak = recordDailyWin(streak, '2026-11-12');
  assert.deepEqual(streak, { current: 3, max: 3, lastDay: '2026-11-12' });
});

test('Mehrere Tagesrätsel am selben Tag zählen nur einmal', () => {
  let streak = recordDailyWin(emptyDayStreak(), '2026-11-10');
  streak = recordDailyWin(streak, '2026-11-10');
  streak = recordDailyWin(streak, '2026-11-10');
  assert.equal(streak.current, 1);
});

test('Ein ausgelassener Tag beendet die Serie, der Rekord bleibt', () => {
  let streak = emptyDayStreak();
  for (const day of ['2026-11-01', '2026-11-02', '2026-11-03']) streak = recordDailyWin(streak, day);
  streak = recordDailyWin(streak, '2026-11-05');
  assert.deepEqual(streak, { current: 1, max: 3, lastDay: '2026-11-05' });
});

test('Serie über Monatsgrenze und Schaltjahr hinweg', () => {
  let streak = recordDailyWin(emptyDayStreak(), '2028-02-28');
  streak = recordDailyWin(streak, '2028-02-29');
  streak = recordDailyWin(streak, '2028-03-01');
  assert.equal(streak.current, 3);
});

test('Aktuelle Serie: lebt, wenn gestern gelöst wurde, auch wenn heute noch offen ist', () => {
  const streak = { current: 4, max: 6, lastDay: '2026-11-14' };
  assert.equal(currentDayStreak(streak, '2026-11-14'), 4);
  assert.equal(currentDayStreak(streak, '2026-11-15'), 4);
  assert.equal(currentDayStreak(streak, '2026-11-16'), 0);
  assert.equal(solvedToday(streak, '2026-11-14'), true);
  assert.equal(solvedToday(streak, '2026-11-15'), false);
});

test('Ungültige gespeicherte Werte werden bereinigt', () => {
  assert.deepEqual(normalizeDayStreak(null), emptyDayStreak());
  assert.deepEqual(normalizeDayStreak({ current: 'viele', max: -2, lastDay: 'gestern' }), emptyDayStreak());
  assert.deepEqual(normalizeDayStreak({ current: 3, lastDay: '2026-11-01' }), { current: 3, max: 3, lastDay: '2026-11-01' });
});

test('Zusammenführen: der spätere Tag gilt, der Rekord ist das Maximum', () => {
  const a = { current: 5, max: 9, lastDay: '2026-11-10' };
  const b = { current: 2, max: 4, lastDay: '2026-11-12' };
  assert.deepEqual(mergeDayStreak(a, b), { current: 2, max: 9, lastDay: '2026-11-12' });
  assert.deepEqual(mergeDayStreak(b, a), { current: 2, max: 9, lastDay: '2026-11-12' });
  const same = { current: 7, max: 7, lastDay: '2026-11-12' };
  assert.equal(mergeDayStreak(b, same).current, 7, 'am selben Tag zählt die längere Serie');
});

test('Startwert aus den Serien der einzelnen Spiele', () => {
  const derived = deriveDayStreak([
    { streak: 3, maxStreak: 8, lastWonDay: '2026-11-13' },
    { streak: 5, maxStreak: 5, lastWonDay: '2026-11-14' },
    { streak: 0, maxStreak: 0, lastWonDay: null },
    undefined,
  ]);
  assert.deepEqual(derived, { current: 5, max: 8, lastDay: '2026-11-14' });
  assert.deepEqual(deriveDayStreak([]), emptyDayStreak());
});

test('Profildaten: alte Profile bekommen die Serie aus ihren Spielen, nichts geht verloren', () => {
  const old = normalizeProfileData({
    stats: { daily: { played: 6, won: 6, streak: 4, maxStreak: 6, lastWonDay: '2026-11-14', dist: [0, 0, 1, 3, 2, 0] } },
    sudoku: { stats: { daily: { won: 2, streak: 2, maxStreak: 2, lastWonDay: '2026-11-14' } } },
  });
  assert.deepEqual(old.dayStreak, { current: 4, max: 6, lastDay: '2026-11-14' });
  assert.equal(old.stats.daily.streak, 4, 'Wordle-Serie bleibt unverändert');
  assert.deepEqual(emptyProfileData().dayStreak, emptyDayStreak());
});

test('Profildaten: gespeicherte Serie bleibt, auch wenn ein älteres Gerät sie nicht kennt', () => {
  const local = normalizeProfileData({ dayStreak: { current: 9, max: 9, lastDay: '2026-11-14' } });
  const remote = normalizeProfileData({});
  assert.equal(mergeProfileData(remote, local).dayStreak.current, 9);
  assert.equal(mergeProfileData(local, remote).dayStreak.current, 9);
  assert.equal(normalizeProfileData(local).dayStreak.current, 9);
});
