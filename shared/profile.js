// Profildaten über alle Spiele. Jedes Spiel besitzt einen eigenen Abschnitt (Wordle: die Felder auf oberster
// Ebene wie bisher, alle anderen Spiele: ein Schlüssel wie "sudoku" oder "crossword"). Hier werden die Abschnitte
// der Spiele zusammengesetzt. Dazu kommt die gemeinsame Tages-Serie unter "dayStreak" (siehe streak.js).
//
// Unbekannte Schlüssel bleiben beim Normalisieren und Zusammenführen erhalten, ein neues Spiel kann also
// ergänzt werden, ohne dass ältere App-Versionen dessen Daten löschen.
//
// Ein neues Spiel wird in SECTIONS eingetragen.

import * as wordle from '../wordle/game.js';
import { emptySudokuData, normalizeSudokuData, mergeSudokuData, reuseUnchangedSudoku } from '../sudoku/data.js';
import {
  emptyCrosswordData,
  normalizeCrosswordData,
  mergeCrosswordData,
  reuseUnchangedCrossword,
} from '../crossword/data.js';
import { emptyNumbersData, normalizeNumbersData, mergeNumbersData, reuseUnchangedNumbers } from '../numbers/data.js';
import {
  emptyMinesweeperData,
  normalizeMinesweeperData,
  mergeMinesweeperData,
  reuseUnchangedMinesweeper,
} from '../minesweeper/data.js';
import { mergeDayStreak, normalizeDayStreak, deriveDayStreak } from './streak.js';

const SECTIONS = [
  { key: 'sudoku', empty: emptySudokuData, normalize: normalizeSudokuData, merge: mergeSudokuData, reuse: reuseUnchangedSudoku },
  { key: 'crossword', empty: emptyCrosswordData, normalize: normalizeCrosswordData, merge: mergeCrosswordData, reuse: reuseUnchangedCrossword },
  { key: 'minesweeper', empty: emptyMinesweeperData, normalize: normalizeMinesweeperData, merge: mergeMinesweeperData, reuse: reuseUnchangedMinesweeper },
  { key: 'numbers', empty: emptyNumbersData, normalize: normalizeNumbersData, merge: mergeNumbersData, reuse: reuseUnchangedNumbers },
];

// Die Tages-Serie ist so lang wie die längste der Serien in den Spielen oder die gespeicherte, falls die länger ist.
// So bekommen auch Profile aus der Zeit vor der gemeinsamen Serie sofort einen sinnvollen Wert.
function withDayStreak(profile, stored) {
  const derived = deriveDayStreak([profile.stats?.daily, ...SECTIONS.map(({ key }) => profile[key]?.stats?.daily)]);
  return { ...profile, dayStreak: mergeDayStreak(normalizeDayStreak(stored), derived) };
}

export function emptyProfileData() {
  const data = wordle.emptyProfileData();
  for (const { key, empty } of SECTIONS) data[key] = empty();
  return withDayStreak(data, null);
}

// Ergänzt fehlende Felder, damit ältere oder beschädigte Datensätze nichts zum Absturz bringen.
export function normalizeProfileData(data) {
  const normalized = wordle.normalizeProfileData(data);
  for (const { key, normalize } of SECTIONS) normalized[key] = normalize(data?.[key]);
  return withDayStreak(normalized, data?.dayStreak);
}

// Führt zwei Stände desselben Profils zusammen, wenn zwei Geräte gleichzeitig gespeichert haben.
export function mergeProfileData(remoteData, localData) {
  const merged = wordle.mergeProfileData(remoteData, localData);
  for (const { key, merge } of SECTIONS) merged[key] = merge(remoteData?.[key], localData?.[key]);
  return withDayStreak(merged, mergeDayStreak(remoteData?.dayStreak, localData?.dayStreak));
}

// Übernimmt neue Daten, behält aber unveränderte Spiele als dieselben Objekte.
export function reuseUnchangedGames(live, next) {
  const result = wordle.reuseUnchangedGames(live, next);
  for (const { key, reuse } of SECTIONS) result[key] = reuse(live?.[key], next[key]);
  return result;
}
