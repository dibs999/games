// Tests für das Kreuzworträtsel (Wortliste, Erzeugen, Spielzüge, Statistik, Zusammenführen): npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { WORDS } from '../crossword/words.js';
import {
  DIFFICULTIES,
  DIFFICULTY_KEYS,
  generatePuzzle,
  buildPuzzle,
  makeRandom,
  dailyPuzzle,
  dailyDifficulty,
  normalizeLetter,
} from '../crossword/logic.js';
import {
  emptyCrosswordData,
  normalizeCrosswordData,
  mergeCrosswordData,
  newGame,
  puzzleOf,
  setLetter,
  clearCell,
  isWrong,
  wordDone,
  filledCount,
  gameProgress,
  recordCrosswordWin,
  crosswordAchievements,
  unlockCrosswordAchievements,
  dailyRanking,
  bestTimeRanking,
  solvedRanking,
} from '../crossword/data.js';
import { emptyProfileData, normalizeProfileData, mergeProfileData } from '../shared/profile.js';

const index = (answer) => {
  const i = WORDS.findIndex((word) => word[0] === answer);
  assert.ok(i >= 0, `${answer} fehlt in der Wortliste`);
  return i;
};

// Ein kleines Rätsel von Hand: ELBE waagerecht, EIS und BÄR senkrecht.
//   E L B E
//   I . Ä .
//   S . R .
const SMALL = { w: 4, h: 3, words: [[index('ELBE'), 0, 0, 0], [index('EIS'), 0, 0, 1], [index('BÄR'), 0, 2, 1]] };

function smallGame(overrides = {}) {
  return { ...newGame({ ...SMALL, difficulty: 'easy' }, 'test'), ...overrides };
}

function typeAll(game, letters) {
  const puzzle = puzzleOf(game);
  for (let i = 0; i < puzzle.solution.length; i++) {
    if (puzzle.solution[i] !== '.' && letters !== 'wrong') setLetter(game, i, puzzle.solution[i]);
  }
}

test('Wortliste: gültige Zeichen, keine Doppelten, Hinweise verraten das Wort nicht', () => {
  const seen = new Set();
  for (const [answer, clue, tier] of WORDS) {
    assert.match(answer, /^[A-ZÄÖÜ]{3,13}$/, answer);
    assert.ok(!seen.has(answer), `doppelt: ${answer}`);
    seen.add(answer);
    assert.ok([1, 2, 3].includes(tier), answer);
    assert.ok(clue.length > 5 && clue.length <= 70, `Hinweis zu ${answer}`);
    const stem = answer.slice(0, Math.max(4, answer.length - 2)).toLowerCase();
    assert.ok(!clue.toLowerCase().includes(stem), `Hinweis verrät ${answer}: ${clue}`);
  }
  assert.ok(WORDS.length >= 300);
  for (const tier of [1, 2, 3]) assert.ok(WORDS.filter((w) => w[2] === tier).length >= 80, `zu wenige Wörter in Stufe ${tier}`);
});

test('Aufbau: Nummern, Wörter und Lösung eines kleinen Rätsels', () => {
  const puzzle = buildPuzzle(SMALL);
  assert.ok(puzzle);
  assert.equal(puzzle.solution, 'ELBE' + 'I.Ä.' + 'S.R.');
  assert.equal(puzzle.numbers[0], 1, 'Feld oben links beginnt waagerecht und senkrecht');
  assert.equal(puzzle.numbers[2], 2, 'B beginnt BÄR');
  assert.deepEqual(puzzle.across.map((w) => [w.n, w.answer]), [[1, 'ELBE']]);
  assert.deepEqual(puzzle.down.map((w) => [w.n, w.answer]), [[1, 'EIS'], [2, 'BÄR']]);
  assert.match(puzzle.words[0].clue, /Hamburg/);
  // Das gemeinsame Feld gehört zu zwei Wörtern, ein freies Feld zu keinem.
  const corner = puzzle.cellWords[0];
  assert.ok(corner[0] >= 0 && corner[1] >= 0);
  assert.deepEqual(puzzle.cellWords[5], [-1, -1]);
});

test('Aufbau lehnt unstimmige Rätsel ab', () => {
  const elbe = index('ELBE');
  const eis = index('EIS');
  assert.equal(buildPuzzle({ w: 4, h: 3, words: [[999999, 0, 0, 0]] }), null, 'unbekanntes Wort');
  assert.equal(buildPuzzle({ w: 4, h: 3, words: [[elbe, 0, 2, 0]] }), null, 'ragt aus dem Feld');
  assert.equal(buildPuzzle({ w: 4, h: 3, words: [[elbe, 0, 0, 0], [eis, 0, 1, 1]] }), null, 'Buchstaben passen nicht (L ≠ E)');
  assert.equal(buildPuzzle({ w: 4, h: 3, words: [[elbe, 0, 0, 0], [elbe, 0, 0, 0]] }), null, 'Wort doppelt');
  // Zwei Wörter nebeneinander würden eine ungewollte Reihe bilden.
  assert.equal(buildPuzzle({ w: 4, h: 3, words: [[elbe, 0, 0, 0], [index('ELBE'), 1, 0, 0]] }), null, 'parallele Wörter');
  assert.equal(buildPuzzle({ w: 2, h: 2, words: [] }), null);
});

for (const difficulty of DIFFICULTY_KEYS) {
  test(`Erzeugen (${difficulty}): stimmig, passende Größe und Wortzahl`, () => {
    const spec = DIFFICULTIES[difficulty];
    for (const seed of [1, 2, 3, 4, 5]) {
      const puzzle = generatePuzzle(difficulty, makeRandom(seed));
      const built = buildPuzzle(puzzle);
      assert.ok(built, `${difficulty} seed ${seed}`);
      assert.ok(puzzle.w <= spec.size && puzzle.h <= spec.size);
      assert.ok(built.words.length >= spec.words[0] && built.words.length <= spec.words[1], `Wortzahl ${built.words.length}`);
      assert.equal(new Set(built.words.map((w) => w.answer)).size, built.words.length, 'kein Wort doppelt');
      // Jedes belegte Feld gehört zu mindestens einem Wort, und das Rätsel hängt zusammen (Kreuzungen).
      const letters = built.solution.split('').filter((ch) => ch !== '.').length;
      const total = built.words.reduce((sum, w) => sum + w.len, 0);
      assert.ok(total - letters >= built.words.length - 1, 'zu wenige Kreuzungen für ein zusammenhängendes Gitter');
    }
  });
}

test('Leichte Rätsel nutzen nur leichte Wörter, schwere auch schwere', () => {
  const tiers = (difficulty) => {
    const found = new Set();
    for (let seed = 1; seed <= 8; seed++) {
      for (const [i] of generatePuzzle(difficulty, makeRandom(seed)).words) found.add(WORDS[i][2]);
    }
    return [...found].sort();
  };
  assert.deepEqual(tiers('easy'), [1]);
  assert.ok(tiers('hard').includes(3));
});

test('Gleiche Zufallsfolge ergibt dasselbe Rätsel', () => {
  assert.deepEqual(generatePuzzle('medium', makeRandom(7)), generatePuzzle('medium', makeRandom(7)));
  assert.notDeepEqual(generatePuzzle('medium', makeRandom(7)).words, generatePuzzle('medium', makeRandom(8)).words);
});

test('Tagesrätsel bleibt stabil (es muss für alle Geräte und alle Versionen gleich sein)', () => {
  const day = dailyPuzzle('2026-11-14');
  assert.equal(day.difficulty, 'hard');
  assert.equal(day.w, 11);
  assert.equal(day.h, 13);
  assert.deepEqual(day.words, [[173, 0, 1, 0], [85, 0, 5, 1], [115, 2, 2, 0], [233, 2, 2, 1], [164, 4, 1, 0], [7, 4, 1, 1], [76, 4, 6, 0], [186, 4, 8, 1], [184, 5, 5, 1], [241, 5, 10, 1], [198, 6, 1, 0], [35, 6, 3, 1], [210, 8, 2, 0], [222, 8, 2, 1], [44, 9, 8, 0], [38, 10, 0, 0], [13, 10, 6, 0], [275, 12, 1, 0]]);
  assert.deepEqual(dailyPuzzle('2026-11-14'), day);
});

test('Tagesrätsel: Stufe nach Wochentag, jeder Tag hat ein anderes Rätsel', () => {
  // 2026-11-09 ist ein Montag.
  const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
  assert.deepEqual(week.map(dailyDifficulty), ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard']);
  const puzzles = new Set(week.map((day) => JSON.stringify(dailyPuzzle(day).words)));
  assert.equal(puzzles.size, 7);
});

test('Tastatur: ß wird nicht zum Buchstaben, Umlaute schon', () => {
  assert.equal(normalizeLetter('a'), 'A');
  assert.equal(normalizeLetter('ä'), 'Ä');
  assert.equal(normalizeLetter('ß'), null);
  assert.equal(normalizeLetter('1'), null);
  assert.equal(normalizeLetter('Enter'), null);
});

test('Eintragen: falscher Buchstabe zählt als Fehler, freie Felder sind gesperrt', () => {
  const game = smallGame();
  assert.equal(setLetter(game, 0, 'E'), true);
  assert.equal(game.mistakes, 0);
  assert.equal(setLetter(game, 1, 'X'), true);
  assert.equal(game.mistakes, 1);
  assert.equal(isWrong(game, 1), true);
  assert.equal(setLetter(game, 1, 'X'), false, 'derselbe Buchstabe');
  assert.equal(setLetter(game, 5, 'A'), false, 'freies Feld');
  assert.equal(game.entries[5], '.');
  assert.equal(setLetter(game, 1, 'L'), true, 'Korrektur');
  assert.equal(isWrong(game, 1), false);
  assert.equal(game.mistakes, 1, 'Fehler bleiben gezählt');
  assert.equal(filledCount(game), 2);
});

test('Löschen und fertige Wörter', () => {
  const game = smallGame();
  for (const [i, ch] of [[0, 'E'], [1, 'L'], [2, 'B'], [3, 'E']]) setLetter(game, i, ch);
  const puzzle = puzzleOf(game);
  assert.equal(wordDone(game, puzzle.across[0]), true);
  assert.equal(wordDone(game, puzzle.down[0]), false);
  assert.equal(clearCell(game, 3), true);
  assert.equal(clearCell(game, 3), false, 'schon leer');
  assert.equal(clearCell(game, 5), false, 'freies Feld');
  assert.equal(wordDone(game, puzzle.across[0]), false);
});

test('Alles richtig gelöst: Spiel gewonnen, danach keine Änderungen mehr', () => {
  const game = smallGame();
  typeAll(game);
  assert.equal(game.status, 'won');
  assert.equal(game.mistakes, 0);
  assert.equal(setLetter(game, 0, 'A'), false);
  assert.equal(clearCell(game, 0), false);
});

test('Ungültige gespeicherte Spiele werden verworfen', () => {
  const game = smallGame();
  assert.ok(normalizeCrosswordData({ games: { easy: game } }).games.easy);
  assert.equal(normalizeCrosswordData({ games: { hard: game } }).games.hard, undefined, 'falsche Stufe');
  assert.equal(normalizeCrosswordData({ games: { easy: { ...game, entries: 'abc' } } }).games.easy, undefined);
  assert.equal(normalizeCrosswordData({ games: { easy: { ...game, entries: 'E'.repeat(12) } } }).games.easy, undefined, 'Buchstaben auf freien Feldern');
  assert.equal(normalizeCrosswordData({ games: { easy: { ...game, words: [[1e6, 0, 0, 0]] } } }).games.easy, undefined);
  assert.equal(normalizeCrosswordData({ daily: game }).daily, null, 'Tagesrätsel braucht einen Tag');
  assert.deepEqual(normalizeCrosswordData(null), emptyCrosswordData());
});

test('Spielstand ist klein', () => {
  const game = newGame({ ...dailyPuzzle('2026-11-14') }, '2026-11-14');
  assert.ok(JSON.stringify(game).length < 900, `${JSON.stringify(game).length} Zeichen`);
});

test('Statistik: Sieg trägt Zeit, Bestzeit und Tagesserie ein', () => {
  const data = emptyCrosswordData();
  const win = (extra) => ({ ...smallGame(), status: 'won', time: 200_000, mistakes: 0, ...extra });
  assert.deepEqual(recordCrosswordWin(data, win({ day: '2026-11-13' })), { isBest: true });
  assert.deepEqual(recordCrosswordWin(data, win({ day: '2026-11-14', time: 300_000 })), { isBest: false });
  assert.equal(data.stats.easy.won, 2);
  assert.equal(data.stats.easy.bestMs, 200_000);
  assert.equal(data.stats.daily.streak, 2);
  recordCrosswordWin(data, win({ difficulty: 'hard', day: undefined }));
  assert.equal(data.stats.daily.won, 2, 'freies Rätsel ändert die Tagesserie nicht');
  assert.equal(data.flawless, 1, 'schwer ohne Fehler zählt');
});

test('Zusammenführen: weiter fortgeschrittenes Spiel, mehr Siege, beste Zeit', () => {
  const a = emptyCrosswordData();
  const b = emptyCrosswordData();
  const gameA = smallGame();
  const gameB = smallGame();
  setLetter(gameB, 0, 'E');
  setLetter(gameB, 1, 'L');
  a.games.easy = gameA;
  b.games.easy = gameB;
  a.stats.easy = { won: 3, bestMs: 500_000, totalMs: 1_500_000 };
  b.stats.easy = { won: 5, bestMs: 700_000, totalMs: 3_000_000 };
  const merged = mergeCrosswordData(a, b);
  assert.equal(merged.games.easy.entries, gameB.entries);
  assert.equal(merged.stats.easy.won, 5);
  assert.equal(merged.stats.easy.bestMs, 500_000);
  assert.equal(mergeCrosswordData(b, a).games.easy.entries, gameB.entries, 'Seite vertauscht');
  assert.ok(gameProgress({ ...gameB, status: 'won' }) > gameProgress(gameB));
});

test('Abzeichen: Freischalten mit Datum, schnelles Lösen', () => {
  const data = emptyProfileData();
  assert.equal(crosswordAchievements(data).filter((a) => a.earned).length, 0);
  recordCrosswordWin(data.crossword, { ...smallGame(), status: 'won', time: 200_000, mistakes: 0, day: '2026-11-14' });
  const unlocked = unlockCrosswordAchievements(data, '2026-11-14T10:00:00.000Z');
  assert.deepEqual(unlocked.map((a) => a.id).sort(), ['kreuz-fast', 'kreuz-first']);
  assert.deepEqual(unlockCrosswordAchievements(data), [], 'nichts doppelt melden');
  assert.equal(data.achievements['kreuz-first'], '2026-11-14T10:00:00.000Z');
});

test('Ranglisten', () => {
  const profile = (id, mutate) => {
    const data = emptyProfileData();
    mutate(data.crossword);
    return { id, name: id, data };
  };
  const won = (time) => ({ ...smallGame(), day: '2026-11-14', status: 'won', time });
  const started = () => {
    const game = { ...smallGame(), day: '2026-11-14' };
    setLetter(game, 0, 'E');
    return game;
  };
  const profiles = [
    profile('anna', (c) => (c.daily = won(300_000))),
    profile('ben', (c) => (c.daily = won(200_000))),
    profile('cleo', (c) => (c.daily = started())),
    profile('dora', () => {}),
  ];
  assert.deepEqual(dailyRanking(profiles, '2026-11-14').map((r) => r.id), ['ben', 'anna', 'cleo', 'dora']);
  const times = [
    profile('a', (c) => (c.stats.easy = { won: 2, bestMs: 400_000, totalMs: 1 })),
    profile('b', (c) => (c.stats.easy = { won: 1, bestMs: 300_000, totalMs: 1 })),
    profile('c', () => {}),
  ];
  assert.deepEqual(bestTimeRanking(times, 'easy').map((r) => r.id), ['b', 'a', 'c']);
  assert.deepEqual(solvedRanking(times).map((r) => [r.id, r.solved]), [['a', 2], ['b', 1], ['c', 0]]);
});

test('Profildaten: Kreuzworträtsel fehlt in alten Profilen, bleibt beim Abgleich erhalten', () => {
  const old = normalizeProfileData({ stats: { daily: { played: 2, won: 2 } } });
  assert.deepEqual(old.crossword, emptyCrosswordData());

  const local = emptyProfileData();
  local.crossword.games.easy = smallGame();
  setLetter(local.crossword.games.easy, 0, 'E');
  const remote = emptyProfileData();
  remote.stats.daily.played = 9;
  remote.sudoku.flawless = 4;
  const merged = mergeProfileData(remote, local);
  assert.equal(merged.stats.daily.played, 9, 'Wordle wird zusammengeführt');
  assert.equal(merged.sudoku.flawless, 4, 'Sudoku wird zusammengeführt');
  assert.equal(merged.crossword.games.easy.entries[0], 'E', 'Kreuzworträtsel bleibt erhalten');
});
