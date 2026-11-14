// Minensucher: Oberfläche. Regeln stehen in logic.js, Spielstand in data.js, das Gerüst (Profil, Uhr, Speichern,
// Statistik, Rangliste, Abzeichen) in ../shared/puzzle-shell.js.

import { createPuzzleShell } from '../shared/puzzle-shell.js';
import { playTap, playPlace, playUnitDone } from '../shared/sound.js';
import { $, el } from '../shared/ui.js';
import { dailyBoard, generateBoard, countsOf, openedCount } from './logic.js';
import {
  newGame,
  randomGameId,
  openCell,
  toggleFlag,
  retry,
  minesLeft,
  gameProgress,
  minesweeperAchievements,
  unlockMinesweeperAchievements,
  BADGE_GROUPS,
} from './data.js';

const LONG_PRESS_MS = 420;

const shell = createPuzzleShell({
  section: 'minesweeper',
  name: 'Minensucher',
  logo: { tile: 's-grape', letter: 'M', rest: 'inen' },
  helpHtml: `
      <p>Decke alle Felder auf, unter denen <strong>keine Mine</strong> liegt. Eine Zahl sagt, wie viele Minen an dieses Feld grenzen (auch schräg).</p>
      <ul class="help-list">
        <li><strong>Antippen</strong> deckt ein Feld auf. Wähle unten „Flagge“, um mit dem Antippen Minen zu markieren. Ein <strong>langer Druck</strong> (am Rechner: Rechtsklick) setzt oder entfernt eine Flagge direkt.</li>
        <li>Tippst du eine aufgedeckte Zahl an, bei der schon genauso viele Flaggen stehen, wie sie anzeigt, werden ihre übrigen Nachbarfelder aufgedeckt. Stimmt eine Flagge nicht, trifft das eine Mine.</li>
        <li>Ein Stück des Feldes ist schon aufgedeckt. Jedes Brett lässt sich <strong>ohne Raten</strong> allein mit Nachdenken lösen.</li>
        <li>Nach einem Treffer kannst du dasselbe Brett nochmal versuchen. Das zählt als Fehlversuch.</li>
      </ul>
      <h3>Die Modi</h3>
      <ul class="help-list">
        <li><strong>Tagesrätsel:</strong> Ein Brett pro Tag, für alle gleich, neu um Mitternacht (deutsche Zeit). Montag und Dienstag leicht, Mittwoch bis Freitag mittel, am Wochenende schwer. Ein gelöstes Tagesrätsel hält deine Tages-Serie am Leben.</li>
        <li><strong>Leicht, Mittel, Schwer:</strong> Beliebig viele Bretter, je schwerer, desto größer das Feld und desto mehr Minen.</li>
      </ul>
      <p>Für Erfolge gibt es Abzeichen in Bronze, Silber und Gold (unter „Statistik“ → „Abzeichen“). In der Rangliste vergleicht ihr euch.</p>`,
  makeDaily: (day) => ({ ...newGame(dailyBoard(day), day), day }),
  makeLevel: (level) => newGame(generateBoard(level), randomGameId()),
  progress: gameProgress,
  achievements: minesweeperAchievements,
  unlock: unlockMinesweeperAchievements,
  badgeGroups: BADGE_GROUPS,
  counter: { label: 'Minen', value: (game) => minesLeft(game), warn: (game) => minesLeft(game) < 0 },
  summaryExtra: (game) => (game.mistakes === 0 ? ' · ohne Fehlversuch' : ` · ${game.mistakes} ${game.mistakes === 1 ? 'Fehlversuch' : 'Fehlversuche'}`),
  shareExtra: (game) => (game.mistakes === 0 ? ' · ohne Fehlversuch' : ` · ${game.mistakes} Fehlversuche`),
  ranking: {
    playing: (row) => `spielt gerade · ${row.filled} Felder mehr aufgedeckt`,
    solvedExtra: (row) => (row.mistakes === 0 ? ' · ohne Fehlversuch' : ` · ${row.mistakes} Fehlversuche`),
    icon: '💣',
    unit: (n) => (n === 1 ? '1 Feld' : `${n} Felder`),
    solvedCaption: 'Alle geräumten Minenfelder, egal welche Stufe.',
  },
  // Nach einem Treffer bleibt das Brett stehen (man kann es nochmal versuchen).
  isFinished: (game) => game.status === 'won',
  onGameReady: () => {
    builtFor = '';
  },
  render,
  lostText: 'Bumm! Du kannst es nochmal versuchen.',
});

// ---------- Aufbau ----------

shell.els.main.insertAdjacentHTML('afterbegin', '<div id="ms-board" class="ms-board" role="group" aria-label="Minenfeld"></div>');
shell.els.below.innerHTML = `
  <div class="ms-controls">
    <div class="ms-mode" role="group" aria-label="Was beim Antippen passiert">
      <button id="ms-dig" class="ms-mode-button" type="button" aria-pressed="true">⛏ Aufdecken</button>
      <button id="ms-flag" class="ms-mode-button" type="button" aria-pressed="false">🚩 Flagge</button>
    </div>
    <button id="ms-retry" class="button button-secondary ms-retry" type="button" hidden>Nochmal</button>
    <button id="ms-new" class="button button-secondary ms-retry" type="button" hidden>Neues Brett</button>
  </div>`;

const ui = {
  board: $('ms-board'),
  dig: $('ms-dig'),
  flag: $('ms-flag'),
  retry: $('ms-retry'),
  fresh: $('ms-new'),
};

let flagMode = false;
let builtFor = '';

// ---------- Zeichnen ----------

function buildBoard(game) {
  const cells = [];
  for (let i = 0; i < game.w * game.h; i++) {
    const cell = el('button', 'ms-cell');
    cell.type = 'button';
    cell.dataset.i = i;
    cells.push(cell);
  }
  ui.board.style.setProperty('--w', game.w);
  ui.board.style.setProperty('--h', game.h);
  ui.board.replaceChildren(...cells);
  builtFor = game.id;
}

function render() {
  const game = shell.currentGame();
  if (builtFor !== game.id) buildBoard(game);
  const counts = countsOf(game.mines, game.w, game.h);
  const lost = game.status === 'lost';
  const won = game.status === 'won';
  ui.board.classList.toggle('is-lost', lost);
  ui.board.classList.toggle('is-won', won);

  for (const cell of ui.board.children) {
    const i = Number(cell.dataset.i);
    const state = game.view[i];
    const mine = game.mines[i] === '1';
    let text = '';
    let label = '';
    let kind = 'hidden';
    if (state === 'o') {
      kind = 'open';
      if (mine) {
        kind = i === game.boom ? 'boom' : 'open';
        text = '💣';
        label = 'Mine';
      } else if (counts[i] > 0) {
        text = String(counts[i]);
        label = `${counts[i]} angrenzende ${counts[i] === 1 ? 'Mine' : 'Minen'}`;
      } else label = 'leer';
    } else if (state === 'f') {
      kind = lost && !mine ? 'wrong' : 'flag';
      text = lost && !mine ? '❌' : '🚩';
      label = 'Flagge';
    } else if ((lost || won) && mine) {
      kind = won ? 'flag' : 'mine';
      text = won ? '🚩' : '💣';
      label = won ? 'Flagge' : 'Mine';
    } else label = 'verdeckt';
    if (cell.dataset.kind !== kind) cell.dataset.kind = kind;
    cell.dataset.n = state === 'o' && !mine ? counts[i] : '';
    if (cell.textContent !== text) cell.textContent = text;
    cell.setAttribute('aria-label', `Zeile ${Math.floor(i / game.w) + 1}, Spalte ${(i % game.w) + 1}: ${label}`);
  }

  ui.dig.setAttribute('aria-pressed', String(!flagMode));
  ui.flag.setAttribute('aria-pressed', String(flagMode));
  ui.dig.disabled = ui.flag.disabled = game.status !== 'playing';
  ui.retry.hidden = !lost;
  ui.fresh.hidden = !(lost || won) || shell.state.mode === 'daily';
}

// ---------- Eingabe ----------

function dig(i) {
  if (!shell.canPlay()) return;
  const game = shell.currentGame();
  const before = openedCount(game.view);
  if (!openCell(game, i)) return;
  if (game.status === 'lost') {
    shell.lose(game);
    return;
  }
  const opened = openedCount(game.view) - before;
  // Ein großer Bereich auf einmal klingt anders als ein einzelnes Feld.
  if (opened > 6) playUnitDone();
  else playPlace(Math.min(9, Math.max(1, opened)));
  if (game.status === 'won') {
    shell.win(game);
    return;
  }
  shell.changed();
}

function flag(i) {
  if (!shell.canPlay()) return;
  if (toggleFlag(shell.currentGame(), i)) {
    playTap();
    shell.changed();
  }
}

let press = null;
let lastFlagAt = 0;

ui.board.addEventListener('pointerdown', (event) => {
  const cell = event.target.closest('.ms-cell');
  if (!cell || event.button > 0) return;
  const i = Number(cell.dataset.i);
  press = {
    i,
    fired: false,
    timer: setTimeout(() => {
      press.fired = true;
      lastFlagAt = Date.now();
      flag(i);
      navigator.vibrate?.(15);
    }, LONG_PRESS_MS),
  };
});

const cancelPress = () => {
  if (press) clearTimeout(press.timer);
};
ui.board.addEventListener('pointerup', cancelPress);
ui.board.addEventListener('pointerleave', cancelPress);
ui.board.addEventListener('pointercancel', cancelPress);

ui.board.addEventListener('click', (event) => {
  const cell = event.target.closest('.ms-cell');
  if (!cell) return;
  // Nach einem langen Druck folgt noch ein Klick: der soll nichts mehr tun.
  if (press?.fired) {
    press = null;
    return;
  }
  press = null;
  const i = Number(cell.dataset.i);
  if (flagMode) flag(i);
  else dig(i);
});

// Rechtsklick am Rechner setzt eine Flagge (der lange Druck am Handy löst oft auch dieses Ereignis aus).
ui.board.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  const cell = event.target.closest('.ms-cell');
  if (!cell || Date.now() - lastFlagAt < 700) return;
  flag(Number(cell.dataset.i));
});

function setFlagMode(on) {
  flagMode = on;
  render();
}
ui.dig.addEventListener('click', () => setFlagMode(false));
ui.flag.addEventListener('click', () => setFlagMode(true));
ui.retry.addEventListener('click', () => {
  if (retry(shell.currentGame())) {
    playTap();
    shell.changed();
  }
});
ui.fresh.addEventListener('click', () => shell.startNewRound());

// Tastatur: F wechselt zwischen Aufdecken und Flagge.
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
  if (event.key.toLowerCase() === 'f' && shell.state.profile && shell.currentGame()?.status === 'playing') setFlagMode(!flagMode);
});

shell.start();
