// Tests für die Zahlenjagd (Rechnen, Aufgaben, Spielzüge, Zusammenführen, Abzeichen): npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFFICULTIES,
  DIFFICULTY_KEYS,
  applyOp,
  generateTask,
  solveTask,
  describeStep,
  dailyTask,
  dailyDifficulty,
  makeRandom,
} from '../numbers/logic.js';
import {
  newGame,
  replay,
  available,
  applyStep,
  undoStep,
  resetSteps,
  giveUp,
  solutionOf,
  gameProgress,
  emptyNumbersData,
  normalizeNumbersData,
  mergeNumbersData,
  numbersAchievements,
  unlockNumbersAchievements,
} from '../numbers/data.js';
import { recordSectionWin, bestTimeRanking, dailyRanking } from '../shared/puzzle-stats.js';
import { emptyProfileData, normalizeProfileData, mergeProfileData } from '../shared/profile.js';

const PLUS = 0;
const MINUS = 1;
const TIMES = 2;
const DIVIDE = 3;

// Aufgabe von Hand: 100, 75, 9, 7 → 700 = (100 + 75) × (9 − 7) × 2 geht nicht mit vier Zahlen,
// aber 75 × 9 = 675 und 675 + 25 … wir nehmen eine einfache: 7 × 9 = 63, 63 + 75 = 138, 138 − 100 = 38.
function game(overrides = {}) {
  return { ...newGame({ numbers: [100, 75, 9, 7], target: 38, difficulty: 'easy' }, 'test'), ...overrides };
}

test('Rechnen: nur ganze Ergebnisse über null sind erlaubt', () => {
  assert.equal(applyOp(6, 7, PLUS), 13);
  assert.equal(applyOp(6, 7, TIMES), 42);
  assert.equal(applyOp(7, 6, MINUS), 1);
  assert.equal(applyOp(6, 7, MINUS), null, 'negativ');
  assert.equal(applyOp(7, 7, MINUS), null, 'null');
  assert.equal(applyOp(12, 4, DIVIDE), 3);
  assert.equal(applyOp(10, 4, DIVIDE), null, 'mit Rest');
  assert.equal(applyOp(4, 12, DIVIDE), null, 'Bruch');
  assert.equal(applyOp(4, 0, DIVIDE), null, 'durch null');
});

for (const difficulty of DIFFICULTY_KEYS) {
  test(`Erzeugen (${difficulty}): richtige Zahlen, Zielzahl im Bereich, immer lösbar`, () => {
    const spec = DIFFICULTIES[difficulty];
    for (let seed = 1; seed <= 25; seed++) {
      const task = generateTask(difficulty, makeRandom(seed));
      assert.equal(task.numbers.length, spec.count);
      const bigs = task.numbers.filter((n) => [25, 50, 75, 100].includes(n)).length;
      assert.ok(bigs >= spec.big[0] && bigs <= spec.big[1], `große Zahlen ${bigs}`);
      assert.ok(task.numbers.every((n) => n >= 1 && n <= 100));
      assert.ok(task.target >= spec.range[0] && task.target <= spec.range[1], `Ziel ${task.target}`);
      assert.ok(!task.numbers.includes(task.target), 'Ziel steht nicht schon da');
      const solution = solveTask(task.numbers, task.target);
      assert.ok(solution, `${difficulty} seed ${seed}: keine Lösung`);
      assert.ok(solution.length >= 1);
      // Die gefundene Lösung rechnet wirklich bis zur Zielzahl.
      assert.equal(solution[solution.length - 1].result, task.target);
    }
  });
}

test('Die Lösungssuche findet keine Lösung, wo es keine gibt', () => {
  assert.equal(solveTask([1, 1], 7), null);
  assert.deepEqual(solveTask([3, 4], 7).map(describeStep), ['3 + 4 = 7']);
  assert.deepEqual(solveTask([5, 2], 5), [], 'die Zahl steht schon da');
});

test('Gleiche Zufallsfolge ergibt dieselbe Aufgabe', () => {
  assert.deepEqual(generateTask('hard', makeRandom(5)), generateTask('hard', makeRandom(5)));
  assert.notDeepEqual(generateTask('hard', makeRandom(5)), generateTask('hard', makeRandom(6)));
});

test('Tagesrätsel bleibt stabil (es muss für alle Geräte und alle Versionen gleich sein)', () => {
  const day = dailyTask('2026-11-14');
  assert.deepEqual(day, { numbers: [100, 75, 9, 7, 3, 2], target: 700, difficulty: 'hard', day: '2026-11-14' });
  assert.deepEqual(dailyTask('2026-11-14'), day);
});

test('Tagesrätsel: Stufe nach Wochentag, jeder Tag eine andere Aufgabe', () => {
  // 2026-11-09 ist ein Montag.
  const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
  assert.deepEqual(week.map(dailyDifficulty), ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard']);
  assert.equal(new Set(week.map((d) => JSON.stringify(dailyTask(d)))).size, 7);
});

test('Rechenschritte: verfügbare Zahlen, Ergebnis ersetzt die beiden, Sieg bei der Zielzahl', () => {
  const g = game();
  assert.deepEqual(available(g).map((item) => item.v), [100, 75, 9, 7]);
  assert.deepEqual(applyStep(g, 2, 3, TIMES), { ok: true, value: 63 });
  assert.deepEqual(available(g).map((item) => [item.index, item.v]), [[0, 100], [1, 75], [4, 63]]);
  assert.equal(g.status, 'playing');
  assert.deepEqual(applyStep(g, 4, 1, PLUS), { ok: true, value: 138 });
  assert.deepEqual(applyStep(g, 5, 0, MINUS), { ok: true, value: 38 });
  assert.equal(g.status, 'won');
  assert.equal(applyStep(g, 0, 1, PLUS).ok, false, 'nach dem Sieg nichts mehr');
});

test('Ungültige Schritte werden abgelehnt und ändern nichts', () => {
  const g = game();
  assert.equal(applyStep(g, 0, 0, PLUS).ok, false, 'dieselbe Zahl zweimal');
  assert.equal(applyStep(g, 0, 9, PLUS).ok, false, 'unbekannte Zahl');
  assert.match(applyStep(g, 3, 2, MINUS).reason, /größer als 0/);
  assert.match(applyStep(g, 1, 3, DIVIDE).reason, /Rest/);
  assert.equal(g.steps.length, 0);
  applyStep(g, 2, 3, PLUS);
  assert.equal(applyStep(g, 2, 0, PLUS).ok, false, 'schon verrechnete Zahl');
});

test('Zurück, Neustart und Aufgeben', () => {
  const g = game();
  applyStep(g, 2, 3, TIMES);
  applyStep(g, 4, 1, PLUS);
  assert.equal(undoStep(g), true);
  assert.equal(g.steps.length, 1);
  assert.equal(resetSteps(g), true);
  assert.equal(g.steps.length, 0);
  assert.equal(undoStep(g), false);
  assert.equal(giveUp(g), true);
  assert.equal(g.status, 'lost');
  assert.equal(giveUp(g), false);
  assert.equal(applyStep(g, 2, 3, PLUS).ok, false);
  assert.ok(solutionOf(g), 'die Lösung lässt sich zeigen');
});

test('Fortschritt: gelöst vor aufgegeben vor angefangen', () => {
  const playing = game();
  applyStep(playing, 2, 3, PLUS);
  assert.ok(gameProgress(playing) >= 1000);
  assert.ok(gameProgress({ ...playing, status: 'lost' }) > gameProgress(playing));
  assert.ok(gameProgress({ ...playing, status: 'won' }) > gameProgress({ ...playing, status: 'lost' }));
});

test('Ungültige gespeicherte Spiele werden verworfen', () => {
  const g = game();
  applyStep(g, 2, 3, TIMES);
  assert.ok(normalizeNumbersData({ games: { easy: g } }).games.easy);
  assert.equal(normalizeNumbersData({ games: { hard: g } }).games.hard, undefined, 'falsche Stufe');
  assert.equal(normalizeNumbersData({ games: { easy: { ...g, steps: [[0, 0, 0]] } } }).games.easy, undefined, 'unmöglicher Schritt');
  assert.equal(normalizeNumbersData({ games: { easy: { ...g, steps: [[3, 2, 1]] } } }).games.easy, undefined, '7 − 9 ist negativ');
  assert.equal(normalizeNumbersData({ games: { easy: { ...g, numbers: [1, 2, 3] } } }).games.easy, undefined, 'falsche Anzahl');
  assert.equal(normalizeNumbersData({ games: { easy: { ...g, target: 5000 } } }).games.easy, undefined, 'Ziel zu groß');
  assert.equal(normalizeNumbersData({ daily: g }).daily, null, 'Tagesrätsel braucht einen Tag');
  assert.deepEqual(normalizeNumbersData(null), emptyNumbersData());
});

test('Zusammenführen: weiter fortgeschrittenes Spiel, mehr Siege', () => {
  const a = emptyNumbersData();
  const b = emptyNumbersData();
  const gameB = game();
  applyStep(gameB, 2, 3, TIMES);
  a.games.easy = game();
  b.games.easy = gameB;
  a.stats.easy = { won: 2, bestMs: 20_000, totalMs: 50_000 };
  b.stats.easy = { won: 4, bestMs: 30_000, totalMs: 90_000 };
  const merged = mergeNumbersData(a, b);
  assert.equal(merged.games.easy.steps.length, 1);
  assert.equal(merged.stats.easy.won, 4);
  assert.equal(merged.stats.easy.bestMs, 20_000);
  assert.equal(mergeNumbersData(b, a).games.easy.steps.length, 1, 'Seite vertauscht');
});

test('Statistik, Abzeichen und Ranglisten', () => {
  const data = emptyProfileData();
  const won = { ...game(), status: 'won', time: 20_000, day: '2026-11-14' };
  assert.deepEqual(recordSectionWin(data.numbers, won), { isBest: true });
  assert.equal(data.numbers.stats.daily.won, 1);
  const unlocked = unlockNumbersAchievements(data, '2026-11-14T10:00:00.000Z');
  assert.deepEqual(unlocked.map((x) => x.id).sort(), ['zahl-fast', 'zahl-first']);
  assert.deepEqual(unlockNumbersAchievements(data), []);
  assert.equal(numbersAchievements(data).find((x) => x.id === 'zahl-10').progress, 1);

  const profile = (id, mutate) => {
    const d = emptyProfileData();
    mutate(d.numbers);
    return { id, name: id, data: d };
  };
  const profiles = [
    profile('anna', (n) => (n.daily = { ...won, time: 30_000 })),
    profile('ben', (n) => (n.daily = { ...won, time: 20_000 })),
    profile('cleo', () => {}),
  ];
  assert.deepEqual(dailyRanking(profiles, '2026-11-14', 'numbers', gameProgress).map((r) => r.id), ['ben', 'anna', 'cleo']);
  assert.deepEqual(bestTimeRanking([profile('a', (n) => (n.stats.easy = { won: 1, bestMs: 9, totalMs: 9 })), profile('b', () => {})], 'numbers', 'easy').map((r) => r.id), ['a', 'b']);
});

test('Profildaten: Zahlenjagd fehlt in alten Profilen, bleibt beim Abgleich erhalten', () => {
  assert.deepEqual(normalizeProfileData({}).numbers, emptyNumbersData());
  const local = emptyProfileData();
  local.numbers.games.easy = game();
  applyStep(local.numbers.games.easy, 2, 3, TIMES);
  const remote = emptyProfileData();
  remote.stats.daily.played = 9;
  const merged = mergeProfileData(remote, local);
  assert.equal(merged.stats.daily.played, 9);
  assert.equal(merged.numbers.games.easy.steps.length, 1);
  assert.deepEqual(replay(merged.numbers.games.easy).map((i) => i.v), [100, 75, 9, 7, 63]);
});
