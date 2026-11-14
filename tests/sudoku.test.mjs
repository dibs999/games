// Tests für Sudoku (Logik, Spielzüge, Statistik, Zusammenführen): npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFFICULTIES,
  DIFFICULTY_KEYS,
  generatePuzzle,
  makeRandom,
  gradePuzzle,
  solve,
  hasUniqueSolution,
  dailyPuzzle,
  dailyDifficulty,
  conflicts,
  digitCounts,
  fromText,
} from '../sudoku/logic.js';
import {
  emptySudokuData,
  normalizeSudokuData,
  mergeSudokuData,
  newGame,
  placeDigit,
  toggleNote,
  eraseCell,
  fillNotes,
  recordSudokuWin,
  currentDailyStreak,
  sudokuAchievements,
  unlockSudokuAchievements,
  dailyRanking,
  bestTimeRanking,
  solvedRanking,
  formatTime,
  gameProgress,
} from '../sudoku/data.js';
import { emptyProfileData, normalizeProfileData, mergeProfileData } from '../shared/profile.js';

// Ein bekanntes, mit Einzelkandidaten lösbares Rätsel.
const EASY =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const EASY_SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

function puzzleFor(difficulty, seed = 1) {
  return generatePuzzle(difficulty, makeRandom(seed));
}

test('Lösen: eindeutiges Rätsel, Lösung stimmt, mehrdeutiges Feld wird erkannt', () => {
  const { count, solution } = solve(fromText(EASY));
  assert.equal(count, 1);
  assert.equal(solution.join(''), EASY_SOLUTION);
  assert.equal(hasUniqueSolution(fromText(EASY)), true);
  assert.equal(hasUniqueSolution(new Array(81).fill(0)), false);
  assert.equal(gradePuzzle(fromText(EASY)), 1);
});

test('Ein widersprüchliches Feld hat keine Lösung', () => {
  const grid = fromText(EASY);
  grid[2] = 5; // zweite 5 in der ersten Zeile
  assert.equal(solve(grid).count, 0);
});

for (const difficulty of DIFFICULTY_KEYS) {
  test(`Erzeugen (${difficulty}): eindeutig, richtige Stufe, Lösung passt zu den Vorgaben`, () => {
    for (const seed of [1, 2, 3, 4]) {
      const { puzzle, solution } = puzzleFor(difficulty, seed);
      const grid = fromText(puzzle);
      assert.equal(gradePuzzle(grid), DIFFICULTIES[difficulty].grade, `${difficulty} seed ${seed}`);
      const result = solve(grid);
      assert.equal(result.count, 1);
      assert.equal(result.solution.join(''), solution);
      for (let i = 0; i < 81; i++) if (puzzle[i] !== '0') assert.equal(puzzle[i], solution[i]);
    }
  });
}

test('Schwerere Stufen haben weniger Vorgaben', () => {
  const clues = (difficulty) => fromText(puzzleFor(difficulty).puzzle).filter(Boolean).length;
  assert.ok(clues('easy') > clues('medium'));
  assert.ok(clues('medium') > clues('hard'));
});

test('Gleiche Zufallsfolge ergibt dasselbe Rätsel', () => {
  assert.deepEqual(puzzleFor('medium', 7), puzzleFor('medium', 7));
  assert.notEqual(puzzleFor('medium', 7).puzzle, puzzleFor('medium', 8).puzzle);
});

test('Tagesrätsel bleibt stabil (es muss für alle Geräte und alle Versionen gleich sein)', () => {
  const day = dailyPuzzle('2026-11-14');
  assert.equal(day.difficulty, 'hard');
  assert.equal(
    day.puzzle,
    '810000540000000620400000800080100000001059000000602000293807000000000210060304000',
  );
  assert.equal(
    day.solution,
    '817236549359748621426591837582173964671459382934682175293817456748965213165324798',
  );
  assert.deepEqual(dailyPuzzle('2026-11-14'), day);
});

test('Tagesrätsel: Stufe nach Wochentag, jeder Tag hat ein anderes Rätsel', () => {
  // 2026-11-09 ist ein Montag.
  const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
  assert.deepEqual(week.map(dailyDifficulty), ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard']);
  const puzzles = new Set(week.map((day) => dailyPuzzle(day).puzzle));
  assert.equal(puzzles.size, 7);
});

test('Konflikte und Ziffernzähler', () => {
  const grid = new Array(81).fill(0);
  grid[0] = 5;
  grid[8] = 5; // gleiche Zeile
  grid[40] = 3;
  assert.deepEqual([...conflicts(grid)].sort((a, b) => a - b), [0, 8]);
  assert.equal(conflicts(fromText(EASY)).size, 0);
  const counts = digitCounts(grid);
  assert.equal(counts[5], 2);
  assert.equal(counts[3], 1);
  assert.equal(counts[1], 0);
});

function easyGame() {
  return newGame({ puzzle: EASY, solution: EASY_SOLUTION, difficulty: 'easy' }, 'test');
}

test('Eintragen: Vorgaben sind gesperrt, falsche Ziffern zählen als Fehler', () => {
  const game = easyGame();
  assert.equal(placeDigit(game, 0, 9), false, 'Vorgabe');
  assert.equal(game.cells[0], '5');
  assert.equal(placeDigit(game, 2, 4), true); // richtig (Lösung: 4)
  assert.equal(game.mistakes, 0);
  assert.equal(placeDigit(game, 3, 1), true); // falsch (Lösung: 6)
  assert.equal(game.mistakes, 1);
  assert.equal(placeDigit(game, 3, 1), false, 'dieselbe Ziffer nochmal');
  assert.equal(game.mistakes, 1);
});

test('Eintragen streicht die Ziffer aus den Notizen der Nachbarfelder', () => {
  const game = easyGame();
  toggleNote(game, 3, 4); // Feld 3 (Zeile 0): Notiz 4
  toggleNote(game, 3, 6);
  toggleNote(game, 30, 4); // anderer Block, andere Zeile und Spalte
  placeDigit(game, 2, 4); // 4 in Zeile 0
  assert.equal(game.notes[3], 1 << 5, 'nur die 6 bleibt');
  assert.equal(game.notes[30], 1 << 3, 'unbeteiligtes Feld bleibt');
});

test('Notizen: umschalten, nur in leeren Feldern, Löschen', () => {
  const game = easyGame();
  assert.equal(toggleNote(game, 0, 3), false, 'Vorgabe');
  assert.equal(toggleNote(game, 2, 4), true);
  assert.equal(game.notes[2], 1 << 3);
  assert.equal(toggleNote(game, 2, 4), true);
  assert.equal(game.notes[2], undefined, 'zweites Mal schaltet aus');
  placeDigit(game, 2, 4);
  assert.equal(toggleNote(game, 2, 7), false, 'Feld ist belegt');
  assert.equal(eraseCell(game, 2), true);
  assert.equal(game.cells[2], '0');
  assert.equal(eraseCell(game, 2), false, 'nichts zu löschen');
  assert.equal(eraseCell(game, 0), false, 'Vorgabe');
});

test('Notizen füllen setzt die möglichen Ziffern, Gewinnen beendet das Spiel', () => {
  const game = easyGame();
  fillNotes(game);
  // In Zeile 0 stehen 5, 3 und 7: sie fehlen in den Notizen, die 4 (die Lösung) ist dabei.
  assert.ok(game.notes[2] & (1 << 3), 'die Lösung 4 ist möglich');
  for (const d of [5, 3, 7]) assert.equal(game.notes[2] & (1 << (d - 1)), 0, `${d} steht schon in der Zeile`);
  assert.equal(game.notes[0], undefined, 'Vorgaben haben keine Notizen');

  for (let i = 0; i < 81; i++) if (game.puzzle[i] === '0') placeDigit(game, i, Number(EASY_SOLUTION[i]));
  assert.equal(game.status, 'won');
  assert.equal(game.mistakes, 0);
  assert.equal(placeDigit(game, 2, 9), false, 'nach dem Sieg nichts mehr ändern');
});

test('Ungültige gespeicherte Spiele werden verworfen', () => {
  const game = easyGame();
  const valid = normalizeSudokuData({ games: { easy: game } });
  assert.ok(valid.games.easy);
  const wrongLevel = normalizeSudokuData({ games: { hard: game } });
  assert.equal(wrongLevel.games.hard, undefined);
  const changedGiven = { ...game, cells: '9' + game.cells.slice(1) };
  assert.equal(normalizeSudokuData({ games: { easy: changedGiven } }).games.easy, undefined);
  assert.equal(normalizeSudokuData({ games: { easy: { ...game, solution: 'abc' } } }).games.easy, undefined);
  assert.equal(normalizeSudokuData({ daily: game }).daily, null, 'Tagesrätsel braucht einen Tag');
  const badNotes = normalizeSudokuData({ games: { easy: { ...game, notes: { 3: 5, 99: 1, x: 2, 4: 1000 } } } });
  assert.deepEqual(badNotes.games.easy.notes, { 3: 5 });
  assert.deepEqual(normalizeSudokuData(null), emptySudokuData());
});

test('Statistik: Sieg trägt Zeit, Bestzeit und Tagesserie ein', () => {
  const sudoku = emptySudokuData();
  const first = { ...easyGame(), time: 400_000, mistakes: 0, status: 'won', day: '2026-11-13' };
  assert.deepEqual(recordSudokuWin(sudoku, first), { isBest: true });
  assert.equal(sudoku.stats.easy.won, 1);
  assert.equal(sudoku.stats.daily.streak, 1);
  const second = { ...first, time: 500_000, day: '2026-11-14' };
  assert.deepEqual(recordSudokuWin(sudoku, second), { isBest: false });
  assert.equal(sudoku.stats.easy.bestMs, 400_000);
  assert.equal(sudoku.stats.easy.totalMs, 900_000);
  assert.equal(sudoku.stats.daily.streak, 2);
  assert.equal(currentDailyStreak(sudoku.stats.daily, '2026-11-15'), 2, 'gestern gelöst: Serie lebt');
  assert.equal(currentDailyStreak(sudoku.stats.daily, '2026-11-16'), 0, 'einen Tag ausgelassen');
  // Freies Rätsel verändert die Tagesserie nicht.
  recordSudokuWin(sudoku, { ...first, day: undefined, difficulty: 'hard', time: 900_000, mistakes: 0 });
  assert.equal(sudoku.stats.daily.won, 2);
  assert.equal(sudoku.stats.hard.won, 1);
  assert.equal(sudoku.flawless, 1, 'schwer ohne Fehler zählt');
});

test('Tagesserie bricht ab, wenn ein Tag fehlt', () => {
  const sudoku = emptySudokuData();
  const win = (day) => recordSudokuWin(sudoku, { ...easyGame(), time: 1000, status: 'won', day });
  win('2026-11-01');
  win('2026-11-02');
  win('2026-11-05');
  assert.equal(sudoku.stats.daily.streak, 1);
  assert.equal(sudoku.stats.daily.maxStreak, 2);
});

test('Zusammenführen: weiter fortgeschrittenes Spiel, mehr Siege, beste Zeit', () => {
  const a = emptySudokuData();
  const b = emptySudokuData();
  const gameA = easyGame();
  const gameB = easyGame();
  placeDigit(gameB, 2, 4);
  placeDigit(gameB, 3, 6);
  a.games.easy = gameA;
  b.games.easy = gameB;
  a.stats.easy = { won: 3, bestMs: 500_000, totalMs: 1_500_000 };
  b.stats.easy = { won: 5, bestMs: 700_000, totalMs: 3_000_000 };
  a.flawless = 4;
  const merged = mergeSudokuData(a, b);
  assert.equal(merged.games.easy.cells, gameB.cells, 'mehr Ziffern gewinnt');
  assert.equal(merged.stats.easy.won, 5);
  assert.equal(merged.stats.easy.bestMs, 500_000);
  assert.equal(merged.stats.easy.totalMs, 3_000_000);
  assert.equal(merged.flawless, 4);
  // Seite vertauscht: gleiches Ergebnis
  assert.equal(mergeSudokuData(b, a).games.easy.cells, gameB.cells);
});

test('Zusammenführen: ein gelöstes Tagesrätsel geht vor, ein neuerer Tag geht vor', () => {
  const done = { ...easyGame(), day: '2026-11-14', status: 'won', time: 1000 };
  const playing = { ...easyGame(), day: '2026-11-14' };
  placeDigit(playing, 2, 4);
  const next = { ...easyGame(), day: '2026-11-15' };
  const mk = (daily) => ({ ...emptySudokuData(), daily });
  assert.equal(mergeSudokuData(mk(done), mk(playing)).daily.status, 'won');
  assert.equal(mergeSudokuData(mk(playing), mk(done)).daily.status, 'won');
  assert.equal(mergeSudokuData(mk(done), mk(next)).daily.day, '2026-11-15');
});

test('Abzeichen: Fortschritt, Freischalten mit Datum, Bestzeit-Abzeichen', () => {
  const data = emptyProfileData();
  assert.equal(sudokuAchievements(data).filter((a) => a.earned).length, 0);
  recordSudokuWin(data.sudoku, { ...easyGame(), time: 250_000, mistakes: 0, status: 'won', day: '2026-11-14' });
  const unlocked = unlockSudokuAchievements(data, '2026-11-14T10:00:00.000Z');
  assert.deepEqual(unlocked.map((a) => a.id).sort(), ['sudoku-fast', 'sudoku-first']);
  assert.equal(data.achievements['sudoku-first'], '2026-11-14T10:00:00.000Z');
  assert.deepEqual(unlockSudokuAchievements(data), [], 'nichts doppelt melden');
  const tenth = sudokuAchievements(data).find((a) => a.id === 'sudoku-10');
  assert.equal(tenth.progress, 1);
  assert.equal(tenth.target, 10);
});

test('Ranglisten', () => {
  const profile = (id, mutate) => {
    const data = emptyProfileData();
    mutate(data.sudoku);
    return { id, name: id, data };
  };
  const won = (time, day = '2026-11-14') => ({ ...easyGame(), day, status: 'won', time });
  const started = () => {
    const game = { ...easyGame(), day: '2026-11-14' };
    placeDigit(game, 2, 4);
    return game;
  };
  const profiles = [
    profile('anna', (s) => (s.daily = won(300_000))),
    profile('ben', (s) => (s.daily = won(200_000))),
    profile('cleo', (s) => (s.daily = started())),
    profile('dora', () => {}),
  ];
  assert.deepEqual(dailyRanking(profiles, '2026-11-14').map((r) => r.id), ['ben', 'anna', 'cleo', 'dora']);
  assert.equal(dailyRanking(profiles, '2026-11-15')[0].tier, 2, 'anderer Tag: alle offen');

  const times = [
    profile('a', (s) => (s.stats.easy = { won: 2, bestMs: 400_000, totalMs: 1 })),
    profile('b', (s) => (s.stats.easy = { won: 1, bestMs: 300_000, totalMs: 1 })),
    profile('c', () => {}),
  ];
  assert.deepEqual(bestTimeRanking(times, 'easy').map((r) => r.id), ['b', 'a', 'c']);
  assert.deepEqual(solvedRanking(times).map((r) => [r.id, r.solved]), [['a', 2], ['b', 1], ['c', 0]]);
});

test('Zeit formatieren', () => {
  assert.equal(formatTime(null), '–');
  assert.equal(formatTime(65_000), '1:05');
  assert.equal(formatTime(3_725_000), '1:02:05');
});

test('Fortschritt zählt eigene Ziffern, gelöst steht darüber', () => {
  const game = easyGame();
  const start = gameProgress(game);
  placeDigit(game, 2, 4);
  assert.ok(gameProgress(game) > start);
  assert.ok(gameProgress({ ...game, status: 'won' }) > gameProgress(game));
});

test('Profildaten: Sudoku fehlt in alten Profilen, bleibt beim Wordle-Abgleich erhalten', () => {
  const old = normalizeProfileData({ stats: { daily: { played: 2, won: 2 } } });
  assert.deepEqual(old.sudoku, emptySudokuData());
  assert.equal(old.stats.daily.played, 2, 'Wordle-Daten bleiben');

  const local = emptyProfileData();
  placeDigit((local.sudoku.games.easy = easyGame()), 2, 4);
  const remote = emptyProfileData();
  remote.stats.daily.played = 9;
  const merged = mergeProfileData(remote, local);
  assert.equal(merged.stats.daily.played, 9, 'Wordle wird zusammengeführt');
  assert.equal(merged.sudoku.games.easy.cells[2], '4', 'Sudoku bleibt erhalten');
});
