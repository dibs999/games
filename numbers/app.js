// Zahlenjagd: Oberfläche. Regeln stehen in logic.js, Spielstand in data.js, das Gerüst (Profil, Uhr, Speichern,
// Statistik, Rangliste, Abzeichen) in ../shared/puzzle-shell.js.

import { createPuzzleShell } from '../shared/puzzle-shell.js';
import { playTap, playPlace, playInvalid } from '../shared/sound.js';
import { $, el } from '../shared/ui.js';
import { OPS, dailyTask, generateTask, describeStep } from './logic.js';
import {
  newGame,
  randomGameId,
  replay,
  available,
  applyStep,
  undoStep,
  resetSteps,
  giveUp,
  solutionOf,
  gameProgress,
  numbersAchievements,
  unlockNumbersAchievements,
  BADGE_GROUPS,
} from './data.js';

const GIVE_UP_WINDOW = 3000;

const shell = createPuzzleShell({
  section: 'numbers',
  name: 'Zahlenjagd',
  logo: { tile: 's-accent', letter: 'Z', rest: 'ahlen' },
  helpHtml: `
      <p>Erreiche die <strong>Zielzahl</strong>, indem du die Zahlen miteinander verrechnest.</p>
      <ul class="help-list">
        <li>Tippe eine Zahl an, dann die Rechenart (+ − × ÷), dann die zweite Zahl. Das Ergebnis ersetzt die beiden und ist gleich markiert, so kannst du direkt weiterrechnen.</li>
        <li>Jede Zahl darf nur einmal benutzt werden, aber du musst nicht alle brauchen.</li>
        <li>Ergebnisse müssen ganze Zahlen über null sein. Minus geht nur, wenn die erste Zahl größer ist, geteilt nur ohne Rest.</li>
        <li>Mit <strong>Zurück</strong> nimmst du den letzten Schritt zurück, mit <strong>Neustart</strong> beginnst du die Aufgabe von vorn. Wer nicht weiterkommt, kann <strong>aufgeben</strong> und sieht eine Lösung.</li>
        <li>Jede Aufgabe ist lösbar.</li>
      </ul>
      <h3>Die Modi</h3>
      <ul class="help-list">
        <li><strong>Tagesrätsel:</strong> Eine Aufgabe pro Tag, für alle gleich, neu um Mitternacht (deutsche Zeit). Montag und Dienstag leicht, Mittwoch bis Freitag mittel, am Wochenende schwer. Ein gelöstes Tagesrätsel hält deine Tages-Serie am Leben.</li>
        <li><strong>Leicht, Mittel, Schwer:</strong> Beliebig viele Aufgaben. Leicht hat vier Zahlen, mittel fünf, schwer sechs mit hoher Zielzahl.</li>
      </ul>
      <p>Für Erfolge gibt es Abzeichen in Bronze, Silber und Gold (unter „Statistik“ → „Abzeichen“). In der Rangliste vergleicht ihr euch.</p>`,
  makeDaily: (day) => ({ ...newGame(dailyTask(day), day), day }),
  makeLevel: (level) => newGame(generateTask(level), randomGameId()),
  progress: gameProgress,
  achievements: numbersAchievements,
  unlock: unlockNumbersAchievements,
  badgeGroups: BADGE_GROUPS,
  counter: { label: 'Schritte', value: (game) => game.steps.length },
  summaryExtra: (game) => ` · ${game.steps.length} ${game.steps.length === 1 ? 'Schritt' : 'Schritte'}`,
  shareExtra: (game) => ` · ${game.steps.length} ${game.steps.length === 1 ? 'Schritt' : 'Schritte'}`,
  ranking: {
    playing: () => 'rechnet gerade',
    icon: '🎯',
    unit: (n) => (n === 1 ? '1 Aufgabe' : `${n} Aufgaben`),
    solvedCaption: 'Alle gelösten Aufgaben, egal welche Stufe.',
  },
  // Eine aufgegebene Aufgabe wird beim nächsten Besuch durch eine neue ersetzt.
  isFinished: (game) => game.status !== 'playing',
  onGameReady: () => {
    selected = null;
    op = null;
    armedAt = 0;
  },
  render,
  lostText: 'Nicht geschafft – eine Lösung steht unten.',
});

// ---------- Aufbau ----------

shell.els.main.insertAdjacentHTML(
  'afterbegin',
  `<div class="nz-board">
      <div class="nz-target"><small>Zielzahl</small><strong id="nz-target">0</strong></div>
      <div id="nz-tiles" class="nz-tiles" role="group" aria-label="Zahlen"></div>
      <ol id="nz-log" class="nz-log" aria-label="Rechenschritte"></ol>
    </div>`,
);
shell.els.below.innerHTML = `
  <div id="nz-ops" class="nz-ops" role="group" aria-label="Rechenart">
    ${OPS.map((label, i) => `<button class="nz-op" type="button" data-op="${i}" aria-label="${['Plus', 'Minus', 'Mal', 'Geteilt'][i]}" aria-pressed="false">${label}</button>`).join('')}
  </div>
  <div class="nz-actions">
    <button id="nz-undo" class="button button-secondary" type="button">Zurück</button>
    <button id="nz-reset" class="button button-secondary" type="button">Neustart</button>
    <button id="nz-giveup" class="button button-secondary" type="button">Aufgeben</button>
  </div>`;

const ui = {
  target: $('nz-target'),
  tiles: $('nz-tiles'),
  log: $('nz-log'),
  ops: $('nz-ops'),
  undo: $('nz-undo'),
  reset: $('nz-reset'),
  giveUp: $('nz-giveup'),
};

let selected = null; // Nummer der markierten Zahl
let op = null; // gewählte Rechenart
let armedAt = 0; // wann „Aufgeben“ zum ersten Mal angetippt wurde

// ---------- Zeichnen ----------

function render() {
  const game = shell.currentGame();
  const playing = game.status === 'playing';
  ui.target.textContent = game.target;

  const items = available(game);
  ui.tiles.replaceChildren(
    ...items.map((item) => {
      const tile = el('button', 'nz-tile', String(item.v));
      tile.type = 'button';
      tile.dataset.index = item.index;
      tile.disabled = !playing && item.v !== game.target;
      tile.classList.toggle('is-selected', playing && item.index === selected);
      tile.classList.toggle('is-target', item.v === game.target);
      tile.classList.toggle('is-result', item.index >= game.numbers.length);
      tile.setAttribute('aria-label', `${item.v}${item.index === selected ? ', markiert' : ''}`);
      return tile;
    }),
  );

  // Die Schritte; nach dem Aufgeben stattdessen eine Lösung.
  const lines = [];
  const all = replay(game) || [];
  for (const [i, j, o] of game.steps) lines.push({ text: `${all[i].v} ${OPS[o]} ${all[j].v} = ${all[game.numbers.length + lines.length].v}` });
  if (game.status === 'lost') {
    const solution = solutionOf(game);
    if (solution) lines.push({ heading: 'Eine Lösung:' }, ...solution.map((step) => ({ text: describeStep(step), solution: true })));
  }
  ui.log.replaceChildren(
    ...lines.map((line) => {
      const li = el('li', line.solution ? 'is-solution' : line.heading ? 'is-heading' : '', line.text || line.heading);
      return li;
    }),
  );

  for (const button of ui.ops.children) {
    button.disabled = !playing;
    button.setAttribute('aria-pressed', String(Number(button.dataset.op) === op));
  }
  ui.undo.disabled = !playing || game.steps.length === 0;
  ui.reset.disabled = !playing || game.steps.length === 0;
  // Nach dem Spiel führt der rechte Knopf weiter, davor gibt man damit auf.
  ui.giveUp.textContent = playing ? (armedAt && Date.now() - armedAt < GIVE_UP_WINDOW ? 'Wirklich?' : 'Aufgeben') : game.status === 'won' && shell.state.mode === 'daily' ? 'Mehr Rätsel' : 'Neue Aufgabe';
  ui.giveUp.classList.toggle('is-armed', playing && armedAt > 0 && Date.now() - armedAt < GIVE_UP_WINDOW);
}

// ---------- Eingabe ----------

function onTile(index) {
  if (!shell.canPlay()) return;
  const game = shell.currentGame();
  if (selected == null || selected === index) {
    selected = selected === index ? null : index;
    op = selected == null ? null : op;
    playTap();
    render();
    return;
  }
  if (op == null) {
    selected = index;
    playTap();
    render();
    return;
  }
  const result = applyStep(game, selected, index, op);
  if (!result.ok) {
    playInvalid();
    shell.toast(result.reason, 1600);
    return;
  }
  playPlace(((result.value % 9) + 9) % 9 || 9);
  op = null;
  // Das Ergebnis ist gleich markiert, damit man direkt weiterrechnen kann.
  selected = game.numbers.length + game.steps.length - 1;
  if (game.status === 'won') {
    selected = null;
    shell.win(game);
    return;
  }
  shell.changed();
}

function onOperator(value) {
  if (!shell.canPlay()) return;
  if (selected == null) {
    shell.toast('Wähle zuerst eine Zahl', 1200);
    return;
  }
  op = op === value ? null : value;
  playTap();
  render();
}

function onUndo() {
  if (!shell.canPlay()) return;
  if (undoStep(shell.currentGame())) {
    selected = null;
    op = null;
    playTap();
    shell.changed();
  }
}

function onReset() {
  if (!shell.canPlay()) return;
  if (resetSteps(shell.currentGame())) {
    selected = null;
    op = null;
    playTap();
    shell.changed();
  }
}

// Aufgeben braucht zwei Tipps kurz hintereinander, damit es nicht versehentlich passiert.
function onGiveUp() {
  const game = shell.currentGame();
  if (game.status !== 'playing') {
    shell.nextRound();
    return;
  }
  if (!shell.canPlay()) return;
  if (!armedAt || Date.now() - armedAt >= GIVE_UP_WINDOW) {
    armedAt = Date.now();
    render();
    setTimeout(render, GIVE_UP_WINDOW + 50);
    return;
  }
  armedAt = 0;
  selected = null;
  op = null;
  giveUp(game);
  shell.lose(game);
}

ui.tiles.addEventListener('click', (event) => {
  const tile = event.target.closest('.nz-tile');
  if (tile) onTile(Number(tile.dataset.index));
});
ui.ops.addEventListener('click', (event) => {
  const button = event.target.closest('.nz-op');
  if (button) onOperator(Number(button.dataset.op));
});
ui.undo.addEventListener('click', onUndo);
ui.reset.addEventListener('click', onReset);
ui.giveUp.addEventListener('click', onGiveUp);

// Tastatur: + − * / wählen die Rechenart, Rücktaste nimmt zurück, Escape hebt die Markierung auf.
document.addEventListener('keydown', (event) => {
  if (!shell.canPlay() || event.ctrlKey || event.metaKey || event.altKey) return;
  const keys = { '+': 0, '-': 1, '*': 2, x: 2, '/': 3, ':': 3 };
  if (event.key in keys) {
    event.preventDefault();
    onOperator(keys[event.key]);
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    onUndo();
  } else if (event.key === 'Escape') {
    selected = null;
    op = null;
    render();
  }
});

shell.start();
