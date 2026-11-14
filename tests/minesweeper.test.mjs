// Tests für den Minensucher (Bretter, Aufdecken, Flaggen, Zusammenführen, Abzeichen): npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFFICULTIES,
  DIFFICULTY_KEYS,
  neighbors,
  countsOf,
  mineCount,
  initialView,
  openedCount,
  solvableFrom,
  generateBoard,
  dailyBoard,
  dailyDifficulty,
  makeRandom,
  hashString,
} from '../minesweeper/logic.js';
import {
  newGame,
  openCell,
  toggleFlag,
  retry,
  flagCount,
  minesLeft,
  gameProgress,
  emptyMinesweeperData,
  normalizeMinesweeperData,
  mergeMinesweeperData,
  minesweeperAchievements,
  unlockMinesweeperAchievements,
} from '../minesweeper/data.js';
import { recordSectionWin } from '../shared/puzzle-stats.js';
import { emptyProfileData, normalizeProfileData, mergeProfileData } from '../shared/profile.js';

function easyGame(seed = 1, overrides = {}) {
  return { ...newGame(generateBoard('easy', makeRandom(seed)), 'test'), ...overrides };
}

test('Nachbarn: Ecke, Rand und Mitte', () => {
  assert.equal(neighbors(0, 8, 8).length, 3);
  assert.equal(neighbors(3, 8, 8).length, 5);
  assert.equal(neighbors(27, 8, 8).length, 8);
  assert.equal(neighbors(63, 8, 8).length, 3);
});

test('Zahlen: Anzahl der angrenzenden Minen', () => {
  // 3×3-Ausschnitt in einem 8×8-Brett: Mine in der Mitte (Feld 9) und in der Ecke (Feld 0).
  const mines = '0'.repeat(64).split('');
  mines[9] = '1';
  const counts = countsOf(mines.join(''), 8, 8);
  assert.equal(counts[0], 1);
  assert.equal(counts[10], 1);
  assert.equal(counts[18], 1);
  assert.equal(counts[11], 0);
  assert.equal(counts[63], 0);
});

for (const difficulty of DIFFICULTY_KEYS) {
  test(`Erzeugen (${difficulty}): richtige Größe und Minenzahl, sicherer Start, ohne Raten lösbar`, () => {
    const spec = DIFFICULTIES[difficulty];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const board = generateBoard(difficulty, makeRandom(seed));
      assert.equal(board.w, spec.w);
      assert.equal(board.h, spec.h);
      assert.equal(board.mines.length, spec.w * spec.h);
      assert.equal(mineCount(board.mines), spec.mines);
      assert.equal(board.mines[board.start], '0', 'Startfeld ist keine Mine');
      for (const n of neighbors(board.start, spec.w, spec.h)) assert.equal(board.mines[n], '0', 'Nachbarn des Starts sind sicher');
      assert.equal(solvableFrom(board.mines, spec.w, spec.h, board.start), true, `${difficulty} seed ${seed}`);
      assert.ok(openedCount(initialView(board.mines, spec.w, spec.h, board.start)) >= 9, 'ein Startbereich ist aufgedeckt');
    }
  });
}

test('Der Löser sagt „nicht lösbar“, wenn Raten nötig ist', () => {
  // Das sichere Feld in der Ecke ist ringsum von Minen umgeben: Keine Zahl grenzt daran, es lässt sich nicht erschließen.
  const mines = '0'.repeat(64).split('');
  for (const i of [1, 8, 9]) mines[i] = '1';
  assert.equal(solvableFrom(mines.join(''), 8, 8, 54), false);
  // Ohne die Falle ist dasselbe Brett lösbar.
  mines[9] = '0';
  mines[8] = '0';
  assert.equal(solvableFrom(mines.join(''), 8, 8, 54), true);
});

test('Gleiche Zufallsfolge ergibt dasselbe Brett', () => {
  assert.deepEqual(generateBoard('medium', makeRandom(3)), generateBoard('medium', makeRandom(3)));
  assert.notEqual(generateBoard('medium', makeRandom(3)).mines, generateBoard('medium', makeRandom(4)).mines);
});

test('Tagesrätsel bleibt stabil (es muss für alle Geräte und alle Versionen gleich sein)', () => {
  const day = dailyBoard('2026-11-14');
  assert.equal(day.difficulty, 'hard');
  assert.equal(day.start, 51);
  assert.equal(hashString(`${day.mines}:${day.start}`), 3205917303);
  assert.deepEqual(dailyBoard('2026-11-14'), day);
});

test('Tagesrätsel: Stufe nach Wochentag, jeder Tag ein anderes Brett', () => {
  // 2026-11-09 ist ein Montag.
  const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
  assert.deepEqual(week.map(dailyDifficulty), ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard']);
  assert.equal(new Set(week.map((d) => dailyBoard(d).mines)).size, 7);
});

test('Flaggen: setzen, wieder entfernen, nicht auf aufgedeckten Feldern', () => {
  const game = easyGame();
  const hidden = [...game.view].findIndex((ch) => ch === 'u');
  const opened = [...game.view].findIndex((ch) => ch === 'o');
  assert.equal(toggleFlag(game, hidden), true);
  assert.equal(game.view[hidden], 'f');
  assert.equal(flagCount(game), 1);
  assert.equal(minesLeft(game), 9);
  assert.equal(openCell(game, hidden), false, 'eine Flagge schützt das Feld');
  assert.equal(toggleFlag(game, hidden), true);
  assert.equal(game.view[hidden], 'u');
  assert.equal(toggleFlag(game, opened), false);
});

test('Treffer: Spiel verloren, Mine merkt sich das Feld; Neustart zählt als Fehlversuch', () => {
  const game = easyGame();
  const mine = [...game.mines].findIndex((ch, i) => ch === '1' && game.view[i] === 'u');
  assert.equal(openCell(game, mine), true);
  assert.equal(game.status, 'lost');
  assert.equal(game.boom, mine);
  assert.equal(openCell(game, 0), false, 'nach dem Treffer nichts mehr');
  assert.equal(toggleFlag(game, 0), false);
  game.time = 12_345;
  assert.equal(retry(game), true);
  assert.equal(game.status, 'playing');
  assert.equal(game.mistakes, 1);
  assert.equal(game.time, 0);
  assert.equal(game.boom, null);
  assert.equal(game.view, initialView(game.mines, game.w, game.h, game.start));
  assert.equal(retry(game), false, 'nur nach einem Treffer');
});

test('Alle sicheren Felder aufdecken gewinnt', () => {
  const game = easyGame(2);
  for (let i = 0; i < game.w * game.h; i++) if (game.mines[i] === '0') openCell(game, i);
  assert.equal(game.status, 'won');
  assert.equal(openedCount(game.view), game.w * game.h - 10);
  assert.equal(openCell(game, 0), false);
});

test('Zahl antippen: mit richtigen Flaggen deckt sie den Rest auf, mit falscher Flagge trifft man eine Mine', () => {
  const good = easyGame(1);
  const counts = countsOf(good.mines, good.w, good.h);
  // Eine aufgedeckte Zahl mit verdeckten Nachbarn suchen.
  const pick = (game) => [...game.view].findIndex((ch, i) => ch === 'o' && counts[i] > 0 && neighbors(i, game.w, game.h).some((n) => game.view[n] === 'u'));
  const i = pick(good);
  assert.ok(i >= 0);
  const around = neighbors(i, good.w, good.h);
  for (const n of around) if (good.mines[n] === '1') toggleFlag(good, n);
  assert.equal(openCell(good, i), true);
  assert.notEqual(good.status, 'lost');
  assert.ok(around.every((n) => good.mines[n] === '1' || good.view[n] === 'o'));

  const bad = easyGame(1);
  const j = pick(bad);
  const nearby = neighbors(j, bad.w, bad.h);
  const wrong = nearby.filter((n) => bad.mines[n] === '0' && bad.view[n] === 'u');
  const flagsNeeded = counts[j];
  // Statt der Minen werden sichere Felder geflaggt: Anzahl stimmt, Lage nicht.
  for (const n of wrong.slice(0, flagsNeeded)) toggleFlag(bad, n);
  if (wrong.length >= flagsNeeded) {
    assert.equal(openCell(bad, j), true);
    assert.equal(bad.status, 'lost');
  }
  // Ohne passende Flaggenzahl passiert nichts.
  const none = easyGame(1);
  assert.equal(openCell(none, pick(none)), false);
});

test('Fortschritt: gelöst vor verloren vor angefangen', () => {
  const game = easyGame();
  assert.equal(gameProgress(game), 0, 'direkt nach dem Start: noch nichts getan');
  const hidden = [...game.view].findIndex((ch, i) => ch === 'u' && game.mines[i] === '0');
  openCell(game, hidden);
  assert.ok(gameProgress(game) >= 1000);
  assert.ok(gameProgress({ ...game, status: 'lost' }) > gameProgress(game));
  assert.ok(gameProgress({ ...game, status: 'won' }) > gameProgress({ ...game, status: 'lost' }));
});

test('Ungültige gespeicherte Spiele werden verworfen', () => {
  const game = easyGame();
  assert.ok(normalizeMinesweeperData({ games: { easy: game } }).games.easy);
  assert.equal(normalizeMinesweeperData({ games: { hard: game } }).games.hard, undefined, 'falsche Stufe');
  assert.equal(normalizeMinesweeperData({ games: { easy: { ...game, mines: '1'.repeat(64) } } }).games.easy, undefined, 'falsche Minenzahl');
  assert.equal(normalizeMinesweeperData({ games: { easy: { ...game, view: 'x'.repeat(64) } } }).games.easy, undefined, 'ungültiger Stand');
  assert.equal(normalizeMinesweeperData({ games: { easy: { ...game, view: 'u' } } }).games.easy, undefined, 'falsche Länge');
  const mineAt = [...game.mines].findIndex((ch) => ch === '1');
  const opened = game.view.slice(0, mineAt) + 'o' + game.view.slice(mineAt + 1);
  assert.equal(normalizeMinesweeperData({ games: { easy: { ...game, view: opened } } }).games.easy, undefined, 'aufgedeckte Mine ohne Treffer');
  assert.ok(normalizeMinesweeperData({ games: { easy: { ...game, view: opened, status: 'lost', boom: mineAt } } }).games.easy, 'nach einem Treffer erlaubt');
  assert.equal(normalizeMinesweeperData({ daily: game }).daily, null, 'Tagesrätsel braucht einen Tag');
  assert.deepEqual(normalizeMinesweeperData(null), emptyMinesweeperData());
});

test('Spielstand ist klein', () => {
  const game = newGame(dailyBoard('2026-11-14'), 'x');
  assert.ok(JSON.stringify(game).length < 900, `${JSON.stringify(game).length} Zeichen`);
});

test('Zusammenführen: weiter fortgeschrittenes Spiel, mehr Siege', () => {
  const a = emptyMinesweeperData();
  const b = emptyMinesweeperData();
  const gameB = easyGame();
  openCell(gameB, [...gameB.view].findIndex((ch, i) => ch === 'u' && gameB.mines[i] === '0'));
  a.games.easy = easyGame();
  b.games.easy = gameB;
  a.stats.easy = { won: 2, bestMs: 20_000, totalMs: 50_000 };
  b.stats.easy = { won: 4, bestMs: 30_000, totalMs: 90_000 };
  const merged = mergeMinesweeperData(a, b);
  assert.equal(merged.games.easy.view, gameB.view);
  assert.equal(merged.stats.easy.won, 4);
  assert.equal(merged.stats.easy.bestMs, 20_000);
  assert.equal(mergeMinesweeperData(b, a).games.easy.view, gameB.view, 'Seite vertauscht');
});

test('Statistik, Abzeichen', () => {
  const data = emptyProfileData();
  const won = { ...easyGame(), status: 'won', time: 40_000, mistakes: 0, day: '2026-11-14' };
  assert.deepEqual(recordSectionWin(data.minesweeper, won), { isBest: true });
  const unlocked = unlockMinesweeperAchievements(data, '2026-11-14T10:00:00.000Z');
  assert.deepEqual(unlocked.map((x) => x.id).sort(), ['mine-fast', 'mine-first']);
  assert.deepEqual(unlockMinesweeperAchievements(data), []);
  assert.equal(minesweeperAchievements(data).find((x) => x.id === 'mine-10').progress, 1);
  // Mittlere und schwere Felder ohne Fehlversuch zählen für „Ohne Knall“.
  recordSectionWin(data.minesweeper, { ...won, difficulty: 'medium', day: undefined });
  assert.equal(data.minesweeper.flawless, 1);
});

test('Profildaten: Minensucher fehlt in alten Profilen, bleibt beim Abgleich erhalten', () => {
  assert.deepEqual(normalizeProfileData({}).minesweeper, emptyMinesweeperData());
  const local = emptyProfileData();
  local.minesweeper.games.easy = easyGame();
  const remote = emptyProfileData();
  remote.stats.daily.played = 9;
  const merged = mergeProfileData(remote, local);
  assert.equal(merged.stats.daily.played, 9);
  assert.equal(merged.minesweeper.games.easy.id, 'test');
});
