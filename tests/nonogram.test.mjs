// Tests für das Nonogramm (Hinweise, Lösen, Erzeugen, Spielzüge, Zusammenführen, Abzeichen): npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFFICULTIES,
  DIFFICULTY_KEYS,
  cluesOfLine,
  cluesOf,
  solveLine,
  logicSolve,
  generatePuzzle,
  dailyPuzzle,
  dailyDifficulty,
  makeRandom,
  hashString,
} from '../nonogram/logic.js';
import {
  newGame,
  setCell,
  clearAll,
  isWrong,
  lineDone,
  markedCount,
  gameProgress,
  emptyNonogramData,
  normalizeNonogramData,
  mergeNonogramData,
  nonogramAchievements,
  unlockNonogramAchievements,
} from '../nonogram/data.js';
import { recordSectionWin } from '../shared/puzzle-stats.js';
import { emptyProfileData, normalizeProfileData, mergeProfileData } from '../shared/profile.js';

// Ein kleines Bild von Hand (5×5): ein Herz.
//   . # . # .
//   # # # # #
//   # # # # #
//   . # # # .
//   . . # . .
const HEART = '01010' + '11111' + '11111' + '01110' + '00100';

function heartGame(overrides = {}) {
  return { ...newGame({ w: 5, h: 5, solution: HEART, difficulty: 'easy' }, 'test'), ...overrides };
}

test('Hinweise einer Reihe', () => {
  assert.deepEqual(cluesOfLine([0, 1, 1, 0, 1]), [2, 1]);
  assert.deepEqual(cluesOfLine([1, 1, 1, 1, 1]), [5]);
  assert.deepEqual(cluesOfLine([0, 0, 0]), [0], 'leere Reihe');
  assert.deepEqual(cluesOfLine([1, 0, 1, 0, 1]), [1, 1, 1]);
  const { rows, cols } = cluesOf(HEART, 5, 5);
  assert.deepEqual(rows, [[1, 1], [5], [5], [3], [1]]);
  assert.deepEqual(cols, [[2], [4], [4], [4], [2]]);
});

test('Eine Reihe lösen: was sicher gefüllt oder leer ist', () => {
  assert.deepEqual(solveLine([3], [-1, -1, -1, -1, -1]), [-1, -1, 1, -1, -1], 'Überlappung in der Mitte');
  assert.deepEqual(solveLine([5], [-1, -1, -1, -1, -1]), [1, 1, 1, 1, 1]);
  assert.deepEqual(solveLine([1, 1], [-1, -1, -1]), [1, 0, 1]);
  assert.deepEqual(solveLine([2], [-1, 1, -1, -1]), [-1, 1, -1, 0], 'der Block muss bei Feld 1 liegen');
  assert.deepEqual(solveLine([0], [-1, -1, -1]), [0, 0, 0], 'leere Reihe');
  assert.deepEqual(solveLine([2, 1], [1, -1, -1, -1, -1]), [1, 1, 0, -1, -1]);
});

test('Eine unmögliche Reihe wird erkannt', () => {
  assert.equal(solveLine([2], [1, -1, -1, 1]), null);
  assert.equal(solveLine([4], [-1, 0, -1, -1, -1]), null);
});

test('Das Herz lässt sich allein mit Logik lösen', () => {
  const { solved, grid } = logicSolve(cluesOf(HEART, 5, 5), 5, 5);
  assert.equal(solved, true);
  assert.equal(grid.join(''), [...HEART].join(''));
});

test('Ein mehrdeutiges Rätsel wird nicht als gelöst gemeldet', () => {
  // Diagonalen vertauschbar: zwei Lösungen mit denselben Hinweisen.
  const a = '10' + '01';
  const b = '01' + '10';
  assert.deepEqual(cluesOf(a, 2, 2), cluesOf(b, 2, 2));
  assert.equal(logicSolve(cluesOf(a, 2, 2), 2, 2).solved, false);
});

for (const difficulty of DIFFICULTY_KEYS) {
  test(`Erzeugen (${difficulty}): richtige Größe, keine leeren Reihen, mit Logik lösbar`, () => {
    const spec = DIFFICULTIES[difficulty];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const puzzle = generatePuzzle(difficulty, makeRandom(seed));
      assert.equal(puzzle.w, spec.w);
      assert.equal(puzzle.h, spec.h);
      assert.equal(puzzle.solution.length, spec.w * spec.h);
      const clues = cluesOf(puzzle.solution, spec.w, spec.h);
      assert.ok(clues.rows.every((c) => c[0] > 0) && clues.cols.every((c) => c[0] > 0));
      const result = logicSolve(clues, spec.w, spec.h);
      assert.equal(result.solved, true, `${difficulty} seed ${seed}`);
      assert.equal(result.grid.join(''), [...puzzle.solution].join(''), 'die gefundene Lösung ist die gespeicherte');
    }
  });
}

test('Gleiche Zufallsfolge ergibt dasselbe Rätsel', () => {
  assert.deepEqual(generatePuzzle('medium', makeRandom(3)), generatePuzzle('medium', makeRandom(3)));
  assert.notEqual(generatePuzzle('medium', makeRandom(3)).solution, generatePuzzle('medium', makeRandom(4)).solution);
});

test('Tagesrätsel bleibt stabil (es muss für alle Geräte und alle Versionen gleich sein)', () => {
  const day = dailyPuzzle('2026-11-14');
  assert.equal(day.difficulty, 'hard');
  assert.equal(hashString(day.solution), 4105719915);
  assert.deepEqual(dailyPuzzle('2026-11-14'), day);
});

test('Tagesrätsel: Stufe nach Wochentag, jeder Tag ein anderes Bild', () => {
  // 2026-11-09 ist ein Montag.
  const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
  assert.deepEqual(week.map(dailyDifficulty), ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard']);
  assert.equal(new Set(week.map((d) => dailyPuzzle(d).solution)).size, 7);
});

test('Felder setzen: gefüllt, markiert, wieder offen', () => {
  const game = heartGame();
  assert.equal(setCell(game, 1, 'f'), true);
  assert.equal(game.cells[1], 'f');
  assert.equal(setCell(game, 1, 'f'), false, 'schon so');
  assert.equal(setCell(game, 0, 'x'), true);
  assert.equal(setCell(game, 1, 'u'), true);
  assert.equal(game.cells[1], 'u');
  assert.equal(setCell(game, 1, 'q'), false, 'ungültiger Wert');
  assert.equal(markedCount(game), 1);
  assert.equal(game.mistakes, 0);
});

test('Falsche Züge zählen als Fehler, auch nach dem Zurücknehmen', () => {
  const game = heartGame();
  setCell(game, 0, 'f'); // Feld 0 muss leer sein
  assert.equal(isWrong(game, 0), true);
  assert.equal(game.mistakes, 1);
  setCell(game, 1, 'x'); // Feld 1 muss gefüllt sein
  assert.equal(isWrong(game, 1), true);
  assert.equal(game.mistakes, 2);
  setCell(game, 0, 'u');
  assert.equal(isWrong(game, 0), false);
  assert.equal(game.mistakes, 2);
  setCell(game, 0, 'x'); // richtig markiert
  assert.equal(game.mistakes, 2);
});

test('Gelöst, wenn genau die richtigen Felder gefüllt sind; Markierungen sind egal', () => {
  const game = heartGame();
  for (let i = 0; i < 25; i++) if (HEART[i] === '1') setCell(game, i, 'f');
  assert.equal(game.status, 'won');
  assert.equal(game.mistakes, 0);
  assert.equal(setCell(game, 0, 'f'), false, 'nach dem Sieg nichts mehr');

  const other = heartGame();
  for (let i = 0; i < 25; i++) if (HEART[i] === '1') setCell(other, i, 'f');
  // nicht gewonnen, wenn ein Feld zu viel gefüllt ist
  const extra = heartGame();
  for (let i = 0; i < 25; i++) if (HEART[i] === '1') setCell(extra, i, 'f');
  assert.equal(extra.status, 'won');
  const wrong = heartGame();
  setCell(wrong, 0, 'f');
  for (let i = 0; i < 25; i++) if (HEART[i] === '1') setCell(wrong, i, 'f');
  assert.equal(wrong.status, 'playing', 'ein falsch gefülltes Feld verhindert den Sieg');
  setCell(wrong, 0, 'x');
  assert.equal(wrong.status, 'won', 'markiert zählt als leer');
});

test('Alles löschen', () => {
  const game = heartGame();
  assert.equal(clearAll(game), false, 'nichts zu löschen');
  setCell(game, 1, 'f');
  setCell(game, 0, 'x');
  assert.equal(clearAll(game), true);
  assert.equal(game.cells, 'u'.repeat(25));
});

test('Zahlen am Rand abhaken, wenn die Reihe stimmt', () => {
  const game = heartGame();
  assert.equal(lineDone(game, 'row', 4), false);
  setCell(game, 22, 'f');
  assert.equal(lineDone(game, 'row', 4), true, 'Zeile 4 ist ein einzelnes Feld in der Mitte');
  setCell(game, 20, 'f');
  assert.equal(lineDone(game, 'row', 4), false, 'jetzt zu viel');
  assert.equal(lineDone(game, 'col', 2), false);
});

test('Fortschritt zählt bearbeitete Felder, gelöst steht darüber', () => {
  const game = heartGame();
  assert.equal(gameProgress(game), 0);
  setCell(game, 1, 'f');
  assert.ok(gameProgress(game) >= 1000);
  assert.ok(gameProgress({ ...game, status: 'won' }) > gameProgress(game));
});

test('Ungültige gespeicherte Spiele werden verworfen', () => {
  const game = heartGame();
  assert.ok(normalizeNonogramData({ games: { easy: game } }).games.easy);
  assert.equal(normalizeNonogramData({ games: { hard: game } }).games.hard, undefined, 'falsche Stufe');
  assert.equal(normalizeNonogramData({ games: { easy: { ...game, solution: '2'.repeat(25) } } }).games.easy, undefined);
  assert.equal(normalizeNonogramData({ games: { easy: { ...game, cells: 'z'.repeat(25) } } }).games.easy, undefined);
  assert.equal(normalizeNonogramData({ games: { easy: { ...game, cells: 'u' } } }).games.easy, undefined, 'falsche Länge');
  assert.equal(normalizeNonogramData({ daily: game }).daily, null, 'Tagesrätsel braucht einen Tag');
  assert.deepEqual(normalizeNonogramData(null), emptyNonogramData());
});

test('Spielstand ist klein', () => {
  const game = newGame(dailyPuzzle('2026-11-14'), 'x');
  assert.ok(JSON.stringify(game).length < 600, `${JSON.stringify(game).length} Zeichen`);
});

test('Zusammenführen: weiter fortgeschrittenes Spiel, mehr Siege', () => {
  const a = emptyNonogramData();
  const b = emptyNonogramData();
  const gameB = heartGame();
  setCell(gameB, 1, 'f');
  a.games.easy = heartGame();
  b.games.easy = gameB;
  a.stats.easy = { won: 2, bestMs: 20_000, totalMs: 50_000 };
  b.stats.easy = { won: 4, bestMs: 30_000, totalMs: 90_000 };
  const merged = mergeNonogramData(a, b);
  assert.equal(merged.games.easy.cells, gameB.cells);
  assert.equal(merged.stats.easy.won, 4);
  assert.equal(merged.stats.easy.bestMs, 20_000);
  assert.equal(mergeNonogramData(b, a).games.easy.cells, gameB.cells, 'Seite vertauscht');
});

test('Statistik und Abzeichen', () => {
  const data = emptyProfileData();
  const won = { ...heartGame(), status: 'won', time: 25_000, mistakes: 0, day: '2026-11-14' };
  assert.deepEqual(recordSectionWin(data.nonogram, won), { isBest: true });
  const unlocked = unlockNonogramAchievements(data, '2026-11-14T10:00:00.000Z');
  assert.deepEqual(unlocked.map((x) => x.id).sort(), ['nono-fast', 'nono-first']);
  assert.deepEqual(unlockNonogramAchievements(data), []);
  assert.equal(nonogramAchievements(data).find((x) => x.id === 'nono-10').progress, 1);
});

test('Profildaten: Nonogramm fehlt in alten Profilen, bleibt beim Abgleich erhalten', () => {
  assert.deepEqual(normalizeProfileData({}).nonogram, emptyNonogramData());
  const local = emptyProfileData();
  local.nonogram.games.easy = heartGame();
  const remote = emptyProfileData();
  remote.stats.daily.played = 9;
  const merged = mergeProfileData(remote, local);
  assert.equal(merged.stats.daily.played, 9);
  assert.equal(merged.nonogram.games.easy.id, 'test');
});
