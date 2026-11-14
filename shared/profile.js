// Profildaten über alle Spiele. Jedes Spiel besitzt einen eigenen Abschnitt (Wordle: die Felder auf oberster
// Ebene wie bisher, Sudoku: "sudoku", Kreuzworträtsel: "crossword"). Hier werden die Abschnitte der Spiele zusammengesetzt.
//
// Unbekannte Schlüssel bleiben beim Normalisieren und Zusammenführen erhalten, ein neues Spiel kann also
// ergänzt werden, ohne dass ältere App-Versionen dessen Daten löschen.

import * as wordle from '../wordle/game.js';
import { emptySudokuData, normalizeSudokuData, mergeSudokuData, reuseUnchangedSudoku } from '../sudoku/data.js';
import {
  emptyCrosswordData,
  normalizeCrosswordData,
  mergeCrosswordData,
  reuseUnchangedCrossword,
} from '../crossword/data.js';

export function emptyProfileData() {
  return { ...wordle.emptyProfileData(), sudoku: emptySudokuData(), crossword: emptyCrosswordData() };
}

// Ergänzt fehlende Felder, damit ältere oder beschädigte Datensätze nichts zum Absturz bringen.
export function normalizeProfileData(data) {
  return {
    ...wordle.normalizeProfileData(data),
    sudoku: normalizeSudokuData(data?.sudoku),
    crossword: normalizeCrosswordData(data?.crossword),
  };
}

// Führt zwei Stände desselben Profils zusammen, wenn zwei Geräte gleichzeitig gespeichert haben.
export function mergeProfileData(remoteData, localData) {
  return {
    ...wordle.mergeProfileData(remoteData, localData),
    sudoku: mergeSudokuData(remoteData?.sudoku, localData?.sudoku),
    crossword: mergeCrosswordData(remoteData?.crossword, localData?.crossword),
  };
}

// Übernimmt neue Daten, behält aber unveränderte Spiele als dieselben Objekte.
export function reuseUnchangedGames(live, next) {
  return {
    ...wordle.reuseUnchangedGames(live, next),
    sudoku: reuseUnchangedSudoku(live?.sudoku, next.sudoku),
    crossword: reuseUnchangedCrossword(live?.crossword, next.crossword),
  };
}
