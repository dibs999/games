// Nonogramm: Oberfläche. Regeln stehen in logic.js, Spielstand in data.js, das Gerüst (Profil, Uhr, Speichern,
// Statistik, Rangliste, Abzeichen) in ../shared/puzzle-shell.js.

import { createPuzzleShell } from '../shared/puzzle-shell.js';
import { playTap, playPlace, playInvalid, playUnitDone } from '../shared/sound.js';
import { $, el } from '../shared/ui.js';
import { dailyPuzzle, generatePuzzle, cluesOf } from './logic.js';
import {
  newGame,
  randomGameId,
  setCell,
  clearAll,
  isWrong,
  lineDone,
  gameProgress,
  nonogramAchievements,
  unlockNonogramAchievements,
  BADGE_GROUPS,
} from './data.js';

const shell = createPuzzleShell({
  section: 'nonogram',
  name: 'Nonogramm',
  logo: { tile: 's-correct', letter: 'N', rest: 'ono' },
  helpHtml: `
      <p>Male das verborgene Bild: Die <strong>Zahlen am Rand</strong> sagen, wie viele gefüllte Felder in einem Block hintereinander liegen, in der Reihenfolge von links nach rechts bzw. von oben nach unten. Zwischen zwei Blöcken bleibt mindestens ein Feld leer.</p>
      <ul class="help-list">
        <li>Beispiel: <strong>3 1</strong> heißt ein Block aus drei, dann mindestens eine Lücke, dann ein einzelnes Feld.</li>
        <li>Wähle unten <strong>Füllen</strong> oder <strong>Markieren</strong> (✕ für „hier ist sicher nichts“). Tippe ein Feld an oder <strong>wische über mehrere</strong>. Dasselbe Feld nochmal antippen macht es wieder frei.</li>
        <li>Stimmt in einer Reihe alles mit der Zahl überein, wird die Zahl grau. Markierungen zählen beim Lösen nicht.</li>
        <li>Ein falsch gesetztes Feld wird rot und zählt als Fehler. Jedes Rätsel hat genau eine Lösung und lässt sich ohne Raten lösen.</li>
      </ul>
      <h3>Die Modi</h3>
      <ul class="help-list">
        <li><strong>Tagesrätsel:</strong> Ein Bild pro Tag, für alle gleich, neu um Mitternacht (deutsche Zeit). Montag und Dienstag leicht (5×5), Mittwoch bis Freitag mittel (10×10), am Wochenende schwer (14×14). Ein gelöstes Tagesrätsel hält deine Tages-Serie am Leben.</li>
        <li><strong>Leicht, Mittel, Schwer:</strong> Beliebig viele Rätsel. Dein angefangenes Rätsel bleibt gespeichert, auch auf anderen Geräten.</li>
      </ul>
      <p>Für Erfolge gibt es Abzeichen in Bronze, Silber und Gold (unter „Statistik“ → „Abzeichen“). In der Rangliste vergleicht ihr euch.</p>
      <h3>Tasten</h3>
      <p>Mit der Maus über mehrere Felder ziehen. <strong>X</strong> oder Leertaste wechselt zwischen Füllen und Markieren.</p>`,
  makeDaily: (day) => ({ ...newGame(dailyPuzzle(day), day), day }),
  makeLevel: (level) => newGame(generatePuzzle(level), randomGameId()),
  progress: gameProgress,
  achievements: nonogramAchievements,
  unlock: unlockNonogramAchievements,
  badgeGroups: BADGE_GROUPS,
  counter: { label: 'Fehler', value: (game) => game.mistakes, warn: (game) => game.mistakes > 0 },
  showErrors: { title: 'Fehler anzeigen', text: 'Falsch gesetzte Felder werden sofort rot.' },
  summaryExtra: (game) => (game.mistakes === 0 ? ' · ohne Fehler' : ` · ${game.mistakes} Fehler`),
  shareExtra: (game) => (game.mistakes === 0 ? ' · ohne Fehler' : ` · ${game.mistakes} Fehler`),
  ranking: {
    playing: (row) => `spielt gerade · ${row.filled} Felder bearbeitet`,
    solvedExtra: (row) => (row.mistakes === 0 ? ' · ohne Fehler' : ` · ${row.mistakes} Fehler`),
    icon: '🖼️',
    unit: (n) => (n === 1 ? '1 Bild' : `${n} Bilder`),
    solvedCaption: 'Alle gelösten Nonogramme, egal welche Stufe.',
  },
  isFinished: (game) => game.status === 'won',
  onGameReady: () => {
    builtFor = '';
  },
  render,
});

// ---------- Aufbau ----------

shell.els.main.insertAdjacentHTML('afterbegin', '<div id="ng-board" class="ng-board" role="group" aria-label="Nonogramm"></div>');
shell.els.below.innerHTML = `
  <div class="ng-controls">
    <div class="ng-tool" role="group" aria-label="Werkzeug">
      <button id="ng-fill" class="ng-tool-button" type="button" aria-pressed="true"><span class="ng-swatch is-fill" aria-hidden="true"></span>Füllen</button>
      <button id="ng-mark" class="ng-tool-button" type="button" aria-pressed="false"><span class="ng-swatch is-mark" aria-hidden="true">✕</span>Markieren</button>
    </div>
    <button id="ng-clear" class="button button-secondary ng-clear" type="button">Neustart</button>
  </div>`;

const ui = {
  board: $('ng-board'),
  fill: $('ng-fill'),
  mark: $('ng-mark'),
  clear: $('ng-clear'),
};

let tool = 'f'; // 'f' füllen, 'x' markieren
let builtFor = '';
let grid = null; // das Gitter mit den Feldern
let rowClues = [];
let colClues = [];

// Größe der Hinweiszahlen in Pixel, je größer das Rätsel, desto kleiner (damit das Gitter Platz hat).
const slotFor = (w) => (w <= 5 ? 22 : w <= 10 ? 17 : 14);

function buildBoard(game) {
  const { w, h } = game;
  const clues = cluesOf(game.solution, w, h);
  const slot = slotFor(w);
  const maxRow = Math.max(...clues.rows.map((c) => c.length));
  const maxCol = Math.max(...clues.cols.map((c) => c.length));
  ui.board.style.setProperty('--w', w);
  ui.board.style.setProperty('--h', h);
  ui.board.style.setProperty('--slot', `${slot}px`);
  ui.board.style.setProperty('--clue-w', `${maxRow * slot + 10}px`);
  ui.board.style.setProperty('--clue-h', `${maxCol * (slot + 2) + 8}px`);

  const colBox = el('div', 'ng-cols');
  rowClues = [];
  colClues = [];
  clues.cols.forEach((numbers) => {
    const box = el('div', 'ng-clue ng-clue-col');
    box.append(...numbers.map((n) => el('span', '', String(n))));
    colBox.append(box);
    colClues.push(box);
  });
  const rowBox = el('div', 'ng-rows');
  clues.rows.forEach((numbers) => {
    const box = el('div', 'ng-clue ng-clue-row');
    box.append(...numbers.map((n) => el('span', '', String(n))));
    rowBox.append(box);
    rowClues.push(box);
  });
  grid = el('div', 'ng-grid');
  const cells = [];
  for (let i = 0; i < w * h; i++) {
    const cell = el('button', 'ng-cell');
    cell.type = 'button';
    cell.dataset.i = i;
    cells.push(cell);
  }
  grid.append(...cells);
  ui.board.replaceChildren(el('div', 'ng-corner'), colBox, rowBox, grid);
  builtFor = game.id;
}

// ---------- Zeichnen ----------

function render() {
  const game = shell.currentGame();
  if (builtFor !== game.id) buildBoard(game);
  const showErrors = shell.sectionData().settings.showErrors !== false;
  ui.board.classList.toggle('is-won', game.status === 'won');
  for (const cell of grid.children) {
    const i = Number(cell.dataset.i);
    const state = game.cells[i];
    cell.classList.toggle('is-fill', state === 'f');
    cell.classList.toggle('is-mark', state === 'x');
    cell.classList.toggle('is-wrong', showErrors && isWrong(game, i));
    const text = state === 'x' ? '✕' : '';
    if (cell.textContent !== text) cell.textContent = text;
    const row = Math.floor(i / game.w) + 1;
    const col = (i % game.w) + 1;
    cell.setAttribute('aria-label', `Zeile ${row}, Spalte ${col}: ${state === 'f' ? 'gefüllt' : state === 'x' ? 'markiert' : 'offen'}`);
  }
  for (let r = 0; r < game.h; r++) rowClues[r].classList.toggle('is-done', lineDone(game, 'row', r));
  for (let c = 0; c < game.w; c++) colClues[c].classList.toggle('is-done', lineDone(game, 'col', c));
  ui.fill.setAttribute('aria-pressed', String(tool === 'f'));
  ui.mark.setAttribute('aria-pressed', String(tool === 'x'));
  ui.fill.disabled = ui.mark.disabled = ui.clear.disabled = game.status !== 'playing';
}

// ---------- Eingabe ----------

// Beim Wischen wird allen Feldern derselbe Zustand gegeben, den das erste Feld bekommt:
// Hat es schon das aktuelle Werkzeug, wird gelöscht, sonst gesetzt.
let paint = null; // { target, last }

function applyPaint(cell, first) {
  const game = shell.currentGame();
  const i = Number(cell.dataset.i);
  const state = game.cells[i];
  // Beim Wischen werden Felder mit dem anderen Werkzeug nicht überschrieben.
  if (!first && paint.target !== 'u' && state !== 'u' && state !== paint.target) return false;
  const wrongBefore = game.mistakes;
  if (!setCell(game, i, paint.target)) return false;
  if (game.mistakes > wrongBefore && shell.sectionData().settings.showErrors !== false) playInvalid();
  else playTap();
  return true;
}

function cellFromPoint(x, y) {
  const target = document.elementFromPoint(x, y);
  return target?.closest?.('.ng-cell') && grid.contains(target) ? target.closest('.ng-cell') : null;
}

function finishPaint() {
  if (!paint) return;
  paint = null;
  const game = shell.currentGame();
  if (game.status === 'won') {
    playUnitDone();
    shell.win(game);
  } else shell.changed();
}

grid_events();
function grid_events() {
  ui.board.addEventListener('pointerdown', (event) => {
    const cell = event.target.closest('.ng-cell');
    if (!cell || event.button > 0 || !shell.canPlay()) return;
    event.preventDefault();
    const game = shell.currentGame();
    const current = game.cells[Number(cell.dataset.i)];
    paint = { target: current === tool ? 'u' : tool, last: cell };
    ui.board.setPointerCapture?.(event.pointerId);
    if (applyPaint(cell, true)) render();
  });
  ui.board.addEventListener('pointermove', (event) => {
    if (!paint) return;
    const cell = cellFromPoint(event.clientX, event.clientY);
    if (!cell || cell === paint.last) return;
    paint.last = cell;
    if (applyPaint(cell, false)) render();
  });
  ui.board.addEventListener('pointerup', finishPaint);
  ui.board.addEventListener('pointercancel', finishPaint);
  // Rechtsklick am Rechner: das jeweils andere Werkzeug für ein Feld.
  ui.board.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const cell = event.target.closest('.ng-cell');
    if (!cell || !shell.canPlay()) return;
    const game = shell.currentGame();
    const i = Number(cell.dataset.i);
    const other = tool === 'f' ? 'x' : 'f';
    if (setCell(game, i, game.cells[i] === other ? 'u' : other)) {
      playTap();
      if (game.status === 'won') shell.win(game);
      else shell.changed();
    }
  });
}

function setTool(value) {
  tool = value;
  render();
}
ui.fill.addEventListener('click', () => setTool('f'));
ui.mark.addEventListener('click', () => setTool('x'));
ui.clear.addEventListener('click', () => {
  if (clearAll(shell.currentGame())) {
    playPlace(4);
    shell.changed();
  }
});

document.addEventListener('keydown', (event) => {
  if (!shell.canPlay() || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() === 'x' || event.key === ' ') {
    event.preventDefault();
    setTool(tool === 'f' ? 'x' : 'f');
  }
});

shell.start();
