// Kreuzworträtsel: Oberfläche. Rätsel und Wörter stehen in logic.js und words.js, Spielstand in data.js.

import { DIFFICULTY_KEYS, dailyPuzzle, generatePuzzle, normalizeLetter } from './logic.js';
import {
  newGame,
  randomGameId,
  puzzleOf,
  setLetter,
  clearCell,
  isWrong,
  wordDone,
  recordCrosswordWin,
  crosswordAchievements,
  unlockCrosswordAchievements,
  currentDailyStreak,
  averageMs,
  formatTime,
  gameProgress,
  dailyRanking,
  bestTimeRanking,
  streakRanking,
  solvedRanking,
  rankOf,
} from './data.js';
import { LEVEL_NAME } from '../shared/puzzle-stats.js';
import { berlinDayKey, puzzleNumber, secondsUntilBerlinMidnight } from '../shared/day.js';
import { burstConfetti } from '../shared/fx.js';
import { mergeProfileData, reuseUnchangedGames } from '../shared/profile.js';
import {
  isCloud,
  listProfiles,
  fetchProfile,
  saveProfile,
  flushPending,
  flushAllPending,
  hasPendingSave,
  timeValue,
  onConflictMerged,
} from '../shared/store.js';
import { playTap, playPlace, playUnitDone, playInvalid, playWin } from '../shared/sound.js';
import { $, el, wait, fillAvatar, openDialog, createToaster, clearToasts, bindDialogs, shareResult } from '../shared/ui.js';
import { initSettings } from '../shared/settings.js';
import { loadProfile, lastProfileId } from '../shared/session.js';
import { renderBadgePanel, showStatsTab, renderRankingRows, statBox } from '../shared/puzzle-ui.js';
import {
  showBadgePopups as showBadgePopupsShared,
  dismissBadgePopups,
  isBadgePopupOpen,
  advanceBadgePopup,
  initBadgePopup,
} from '../shared/badge-popup.js';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const PRAISE = ['Gelöst!', 'Wortgewandt!', 'Stark!', 'Rätselprofi!', 'Geschafft!'];
const PERSIST_DELAY = 1500;
const ACROSS = 0;
const DOWN = 1;
const DIR_NAME = ['waagerecht', 'senkrecht'];
const DIR_ARROW = ['→', '↓'];
const KEY_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P', 'Ü'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ö', 'Ä'],
  ['DIR', 'Y', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE'],
];

// Die Abzeichen in der Ansicht, nach Thema gruppiert.
const BADGE_GROUPS = [
  { title: 'Gelöste Rätsel', ids: ['kreuz-first', 'kreuz-10', 'kreuz-50', 'kreuz-200'] },
  { title: 'Stufen', ids: ['kreuz-medium', 'kreuz-hard', 'kreuz-hard-10'] },
  { title: 'Tagesrätsel', ids: ['kreuz-daily-3', 'kreuz-daily-7', 'kreuz-daily-30'] },
  { title: 'Können', ids: ['kreuz-flawless', 'kreuz-fast'] },
];

const els = {
  loadScreen: $('load-screen'),
  loadStatus: $('load-status'),
  loadActions: $('load-actions'),
  gameScreen: $('game-screen'),
  switchProfile: $('switch-profile'),
  board: $('board'),
  creating: $('creating'),
  keyboard: $('keyboard'),
  toasts: $('toasts'),
  srStatus: $('sr-status'),
  time: $('puzzle-time'),
  level: $('puzzle-level'),
  mistakes: $('puzzle-mistakes'),
  clueMeta: $('clue-meta'),
  clueBody: $('clue-body'),
  cluesDialog: $('clues-dialog'),
  statsDialog: $('stats-dialog'),
  rankingDialog: $('ranking-dialog'),
  rankingList: $('ranking-list'),
  rankingLevels: $('ranking-levels'),
  settingsDialog: $('settings-dialog'),
  showErrors: $('show-errors'),
  highContrast: $('high-contrast'),
  soundToggle: $('sound-toggle'),
  themeSelect: $('theme-select'),
};

const state = {
  profile: null,
  profiles: [], // alle Profile, nur für die Rangliste
  today: berlinDayKey(),
  mode: 'daily', // 'daily' | 'easy' | 'medium' | 'hard'
  selected: null, // markiertes Feld
  dir: ACROSS, // Richtung des markierten Wortes
  clockAt: 0,
  clockTimer: null,
  persistTimer: null,
  revision: 0, // zählt lokale Änderungen, damit ein veralteter Serverstand sie nicht überschreibt
  busy: false, // Sieg wird gefeiert
  creating: false,
  modeToken: 0,
  builtKey: '', // welches Gitter gerade im DOM steht
  statsTab: 'stats',
  statsResult: null,
  countdownTimer: null,
  rankingBoard: 'daily',
  rankingLevel: 'medium',
  unseenBadges: new Set(),
};

const toast = createToaster(() => els.toasts);

// ---------- Zugriff auf den Spielstand ----------

const crossword = () => state.profile.data.crossword;

function currentGame() {
  const data = crossword();
  return state.mode === 'daily' ? data.daily : data.games[state.mode];
}

const currentPuzzle = () => puzzleOf(currentGame());

function modeTitle(mode) {
  return mode === 'daily' ? 'Tagesrätsel' : LEVEL_NAME[mode];
}

function ensureDaily() {
  const data = crossword();
  if (!data.daily || data.daily.day !== state.today) {
    data.daily = { ...newGame(dailyPuzzle(state.today), state.today), day: state.today };
  }
}

function ensureLevel(level) {
  const data = crossword();
  // Ein gelöstes Rätsel weicht beim nächsten Besuch der Stufe einem neuen.
  if (!data.games[level] || data.games[level].status === 'won') {
    data.games[level] = newGame(generatePuzzle(level), randomGameId());
  }
}

// ---------- Speichern ----------

async function persist() {
  clearTimeout(state.persistTimer);
  state.persistTimer = null;
  const profile = state.profile;
  if (!profile) return;
  state.revision += 1;
  const result = await saveProfile(profile);
  if (result.status === 'offline') {
    toast('Offline – wird gespeichert, sobald du wieder online bist', 2500);
  } else if (result.status === 'error') {
    toast(`${result.error?.message || 'Speichern fehlgeschlagen'} Wird erneut versucht.`, 3000);
  } else if (result.status === 'missing') {
    toast('Dieses Profil gibt es nicht mehr.', 3000);
    setTimeout(() => goToHub({ switchProfile: true }), 1800);
  }
}

// Nach Zügen etwas verzögert speichern, damit nicht jeder Buchstabe einzeln hochgeladen wird.
function schedulePersist() {
  state.revision += 1;
  clearTimeout(state.persistTimer);
  state.persistTimer = setTimeout(persist, PERSIST_DELAY);
}

// ---------- Uhr ----------

function clockRunning() {
  const game = state.profile && currentGame();
  return Boolean(
    game &&
      game.status === 'playing' &&
      !state.busy &&
      !state.creating &&
      !document.hidden &&
      !document.querySelector('dialog[open]') &&
      !isBadgePopupOpen(),
  );
}

// Rechnet die seit dem letzten Aufruf vergangene Zeit dem Spiel zu, solange es wirklich läuft.
function tickClock() {
  const now = performance.now();
  if (state.clockAt && clockRunning()) currentGame().time += now - state.clockAt;
  state.clockAt = now;
  renderInfo();
}

// ---------- Profil ----------

function goToHub({ switchProfile = false } = {}) {
  dismissBadgePopups();
  tickClock();
  window.location.href = switchProfile ? '../?wechseln' : '../';
}

async function loadProfileList() {
  try {
    state.profiles = await listProfiles();
  } catch {
    // Offline: die Rangliste zeigt dann nur das eigene Profil.
  }
}

function startWithProfile(profile) {
  state.profile = profile;
  state.today = berlinDayKey();
  state.unseenBadges.clear();
  const data = profile.data.crossword;
  ensureDaily();
  // Abzeichen, die schon verdient waren, still mit dem heutigen Datum nachtragen.
  if (unlockCrosswordAchievements(profile.data).length > 0) schedulePersist();

  els.loadScreen.hidden = true;
  els.gameScreen.hidden = false;
  fillAvatar(els.switchProfile.querySelector('.avatar'), profile.name);
  els.switchProfile.querySelector('.profile-chip-name').textContent = profile.name;
  els.switchProfile.setAttribute('aria-label', `${profile.name} – Profil wechseln`);
  document.title = `Kreuzworträtsel – ${profile.name}`;

  // Erst das Tagesrätsel; ist es gelöst, das angefangene freie Rätsel (sonst „Mittel“).
  let mode = 'daily';
  if (data.daily.status === 'won') {
    mode = DIFFICULTY_KEYS.find((key) => data.games[key] && gameProgress(data.games[key]) >= 1000) || 'medium';
  }
  setMode(mode);
  if (mode !== 'daily') toast('Tagesrätsel heute schon gelöst ✓', 2200);
  state.clockTimer = setInterval(tickClock, 250);
}

async function loadAndStart() {
  const id = lastProfileId();
  if (!id) {
    goToHub();
    return;
  }
  els.loadStatus.textContent = 'Profil wird geladen …';
  els.loadActions.replaceChildren();
  try {
    const profile = await loadProfile(id);
    if (!profile) {
      goToHub({ switchProfile: true });
      return;
    }
    startWithProfile(profile);
  } catch (error) {
    els.loadStatus.textContent = error.message || 'Profil konnte nicht geladen werden.';
    const retry = el('button', 'button button-secondary', 'Erneut versuchen');
    retry.type = 'button';
    retry.addEventListener('click', loadAndStart);
    const back = el('a', 'button button-secondary', 'Zur Startseite');
    back.href = '../';
    els.loadActions.append(retry, back);
  }
}

// ---------- Modus und Markierung ----------

async function setMode(mode) {
  const token = ++state.modeToken;
  tickClock();
  state.mode = mode;
  state.selected = null;
  clearToasts();
  if (mode === 'daily') ensureDaily();
  else if (!crossword().games[mode] || crossword().games[mode].status === 'won') {
    // Das Erzeugen dauert einen Moment: erst „Rätsel wird erstellt …“ zeigen.
    state.creating = true;
    renderAll();
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    if (token !== state.modeToken) return;
    ensureLevel(mode);
    state.creating = false;
    schedulePersist();
  }
  selectStart();
  renderAll();
}

// Nach einem gelösten freien Rätsel ein neues erzeugen.
function startNewRound() {
  if (state.mode === 'daily') return;
  const data = crossword();
  if (data.games[state.mode]) data.games[state.mode].status = 'won';
  setMode(state.mode);
}

// Die erste noch nicht fertige Aufgabe markieren.
function selectStart() {
  const game = currentGame();
  const puzzle = puzzleOf(game);
  const word = puzzle.words.find((w) => !wordDone(game, w)) || puzzle.words[0];
  selectWord(word);
}

function selectWord(word) {
  const game = currentGame();
  state.dir = word.dir;
  state.selected = word.cells.find((i) => game.entries[i] === '.') ?? word.cells[0];
}

function activeWord() {
  if (state.selected == null) return null;
  const puzzle = currentPuzzle();
  const cw = puzzle.cellWords[state.selected];
  const position = cw[state.dir] >= 0 ? cw[state.dir] : cw[1 - state.dir];
  return position >= 0 ? puzzle.words[position] : null;
}

function selectCell(i, { tapped = false } = {}) {
  if (!state.profile || state.creating) return;
  const puzzle = currentPuzzle();
  if (puzzle.solution[i] === '.') return;
  const cw = puzzle.cellWords[i];
  if (tapped && i === state.selected && cw[ACROSS] >= 0 && cw[DOWN] >= 0) {
    // Dasselbe Feld nochmal: Richtung wechseln.
    state.dir = 1 - state.dir;
  } else {
    state.selected = i;
    if (cw[state.dir] < 0) state.dir = 1 - state.dir;
  }
  renderBoard();
  renderClue();
}

function toggleDirection() {
  if (state.selected == null) return;
  const cw = currentPuzzle().cellWords[state.selected];
  if (cw[ACROSS] >= 0 && cw[DOWN] >= 0) state.dir = 1 - state.dir;
  renderBoard();
  renderClue();
}

// Zum nächsten (delta = 1) oder vorherigen Hinweis springen; fertige Wörter werden übersprungen.
function stepClue(delta) {
  if (!state.profile || state.creating) return;
  const game = currentGame();
  const { words } = currentPuzzle();
  const current = activeWord();
  const start = current ? words.indexOf(current) : -1;
  const allDone = words.every((w) => wordDone(game, w));
  for (let step = 1; step <= words.length; step++) {
    const word = words[(((start + delta * step) % words.length) + words.length) % words.length];
    if (allDone || !wordDone(game, word)) {
      selectWord(word);
      break;
    }
  }
  renderBoard();
  renderClue();
}

function moveSelection(dx, dy) {
  if (!state.profile || state.creating) return;
  const puzzle = currentPuzzle();
  if (state.selected == null) {
    selectStart();
    renderBoard();
    renderClue();
    return;
  }
  let r = Math.floor(state.selected / puzzle.w);
  let c = state.selected % puzzle.w;
  // Leere Felder überspringen, bis wieder ein Wortfeld kommt.
  for (;;) {
    r += dy;
    c += dx;
    if (r < 0 || c < 0 || r >= puzzle.h || c >= puzzle.w) return;
    if (puzzle.solution[r * puzzle.w + c] !== '.') break;
  }
  const i = r * puzzle.w + c;
  state.selected = i;
  const cw = puzzle.cellWords[i];
  const wanted = dx !== 0 ? ACROSS : DOWN;
  state.dir = cw[wanted] >= 0 ? wanted : 1 - wanted;
  renderBoard();
  renderClue();
}

// ---------- Zeichnen ----------

function buildBoard() {
  const game = currentGame();
  const puzzle = puzzleOf(game);
  const cells = [];
  for (let i = 0; i < puzzle.solution.length; i++) {
    if (puzzle.solution[i] === '.') {
      cells.push(el('div', 'cw-void'));
      continue;
    }
    const cell = el('button', 'cw-cell');
    cell.type = 'button';
    cell.dataset.i = i;
    cell.style.setProperty('--d', Math.floor(i / puzzle.w) + (i % puzzle.w));
    if (puzzle.numbers[i]) cell.append(el('span', 'cw-num', String(puzzle.numbers[i])));
    cell.append(el('span', 'cw-letter'));
    cells.push(cell);
  }
  els.board.style.setProperty('--w', puzzle.w);
  els.board.style.setProperty('--h', puzzle.h);
  els.board.replaceChildren(...cells);
  state.builtKey = `${game.id}|${puzzle.w}x${puzzle.h}|${game.words.length}`;
}

function renderBoard() {
  const game = state.profile && currentGame();
  els.creating.hidden = !state.creating;
  if (!game) return;
  const puzzle = puzzleOf(game);
  const key = `${game.id}|${puzzle.w}x${puzzle.h}|${game.words.length}`;
  if (key !== state.builtKey) buildBoard();
  const word = activeWord();
  const inWord = new Set(word ? word.cells : []);
  const showErrors = crossword().settings.showErrors;
  els.board.classList.toggle('is-won', game.status === 'won');
  for (const cell of els.board.children) {
    if (!cell.dataset.i) continue;
    const i = Number(cell.dataset.i);
    const letter = game.entries[i] === '.' ? '' : game.entries[i];
    cell.lastChild.textContent = letter;
    cell.classList.toggle('is-selected', i === state.selected);
    cell.classList.toggle('is-word', i !== state.selected && inWord.has(i));
    cell.classList.toggle('is-wrong', showErrors && isWrong(game, i));
    const row = Math.floor(i / puzzle.w) + 1;
    const col = (i % puzzle.w) + 1;
    const number = puzzle.numbers[i] ? `, Nummer ${puzzle.numbers[i]}` : '';
    cell.setAttribute('aria-label', `Zeile ${row}, Spalte ${col}${number}: ${letter || 'leer'}`);
  }
}

function renderClue() {
  const word = state.profile && currentGame() && activeWord();
  if (!word) {
    els.clueMeta.textContent = '';
    els.clueBody.textContent = state.creating ? 'Rätsel wird erstellt …' : 'Tippe ein Feld an';
    return;
  }
  els.clueMeta.textContent = `${word.n} ${DIR_NAME[word.dir]} ${DIR_ARROW[word.dir]} · ${word.len} Buchstaben`;
  els.clueBody.textContent = word.clue;
  const dirKey = els.keyboard.querySelector('[data-key="DIR"]');
  if (dirKey) {
    dirKey.textContent = DIR_ARROW[state.dir];
    dirKey.setAttribute('aria-label', `Richtung ${DIR_NAME[state.dir]}, tippen zum Wechseln`);
  }
}

function renderInfo() {
  const game = state.profile && currentGame();
  if (!game) return;
  els.time.textContent = formatTime(game.time);
  els.mistakes.textContent = game.mistakes;
  els.mistakes.parentElement.classList.toggle('has-mistakes', game.mistakes > 0);
  const level = LEVEL_NAME[game.difficulty];
  els.level.textContent = state.mode === 'daily' ? `Heute · ${level}` : level;
}

function renderTabs() {
  for (const tab of document.querySelectorAll('.mode-tab')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.mode === state.mode));
  }
}

function renderAll() {
  renderTabs();
  renderBoard();
  renderClue();
  renderInfo();
}

function buildKeyboard() {
  const rows = KEY_ROWS.map((keys) => {
    const row = el('div', 'keyboard-row');
    for (const key of keys) {
      const button = el('button', 'key');
      button.type = 'button';
      button.dataset.key = key;
      if (key === 'DIR') {
        button.classList.add('key-wide');
        button.textContent = DIR_ARROW[ACROSS];
      } else if (key === 'BACKSPACE') {
        button.classList.add('key-wide');
        button.setAttribute('aria-label', 'Löschen');
        button.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7.07L2.4 12l4.66-7H22v14zm-11.59-2L14 13.41 17.59 17 19 15.59 15.41 12 19 8.41 17.59 7 14 10.59 10.41 7 9 8.41 12.59 12 9 15.59z"/></svg>';
      } else {
        button.textContent = key;
      }
      row.append(button);
    }
    return row;
  });
  els.keyboard.replaceChildren(...rows);
}

// ---------- Eingabe ----------

function inputBlocked() {
  return !state.profile || state.busy || state.creating || currentGame().status !== 'playing';
}

// Nach einem Buchstaben zum nächsten leeren Feld des Wortes, sonst zum nächsten Feld.
function advance() {
  const word = activeWord();
  if (!word) return;
  const game = currentGame();
  const position = word.cells.indexOf(state.selected);
  const next = word.cells.slice(position + 1).find((i) => game.entries[i] === '.') ?? word.cells[position + 1];
  if (next != null) state.selected = next;
  else if (wordDone(game, word)) stepClue(1);
}

function inputLetter(letter) {
  if (inputBlocked() || state.selected == null) return;
  const game = currentGame();
  const i = state.selected;
  const word = activeWord();
  const wasDone = word ? wordDone(game, word) : false;
  const changed = setLetter(game, i, letter);
  if (changed) {
    const showErrors = crossword().settings.showErrors;
    const puzzle = currentPuzzle();
    const wrong = letter !== puzzle.solution[i];
    // Ohne Fehleranzeige verrät auch der Klang nicht, ob der Buchstabe stimmt.
    if (wrong && showErrors) playInvalid();
    else if (game.status === 'won') {
      // Beim Sieg spielt der Jubel statt des einzelnen Klangs.
    } else if (!wasDone && word && wordDone(game, word)) playUnitDone();
    else if (wrong) playTap();
    else playPlace((letter.charCodeAt(0) % 9) + 1);
    if (game.status === 'won') {
      onWin(game);
      return;
    }
    schedulePersist();
  }
  advance();
  renderBoard();
  renderClue();
  renderInfo();
}

function backspace() {
  if (inputBlocked() || state.selected == null) return;
  const game = currentGame();
  if (game.entries[state.selected] === '.') {
    // Leeres Feld: ein Feld zurück und dort löschen.
    const word = activeWord();
    const position = word ? word.cells.indexOf(state.selected) : -1;
    if (position > 0) state.selected = word.cells[position - 1];
  }
  if (clearCell(game, state.selected)) {
    playTap();
    schedulePersist();
  }
  renderBoard();
  renderClue();
}

function clearCurrent() {
  if (inputBlocked() || state.selected == null) return;
  if (clearCell(currentGame(), state.selected)) {
    playTap();
    schedulePersist();
    renderBoard();
  }
}

// ---------- Sieg ----------

async function onWin(game) {
  state.busy = true;
  tickClock();
  const data = crossword();
  const { isBest } = recordCrosswordWin(data, game);
  const unlocked = unlockCrosswordAchievements(state.profile.data);
  for (const badge of unlocked) state.unseenBadges.add(badge.id);
  persist();
  renderAll();
  const profile = state.profile;
  const mode = state.mode;
  const stillHere = () => state.profile === profile && state.mode === mode && currentGame() === game;

  playWin();
  burstConfetti();
  toast(PRAISE[Math.floor(Math.random() * PRAISE.length)], 1800);
  await wait(REDUCED_MOTION ? 600 : 1800);
  if (!stillHere()) {
    state.busy = false;
    return;
  }
  await showBadgePopupsShared(unlocked, { onShow: (badge) => state.unseenBadges.add(badge.id) });
  state.busy = false;
  if (stillHere() && !document.querySelector('dialog[open]')) showStats({ result: { game, isBest } });
}

// ---------- Hinweise, Statistik, Teilen ----------

function renderClueList() {
  const game = currentGame();
  const puzzle = currentPuzzle();
  const current = activeWord();
  const fill = (listEl, words) => {
    listEl.replaceChildren(
      ...words.map((word) => {
        const li = el('li');
        const button = el('button', 'clue-item');
        button.type = 'button';
        button.dataset.word = puzzle.words.indexOf(word);
        button.classList.toggle('is-current', word === current);
        button.classList.toggle('is-done', wordDone(game, word));
        button.append(el('span', 'clue-num', String(word.n)), el('span', 'clue-text', word.clue), el('span', 'clue-len', `${word.len}`));
        button.setAttribute('aria-label', `${word.n} ${DIR_NAME[word.dir]}, ${word.len} Buchstaben: ${word.clue}`);
        li.append(button);
        return li;
      }),
    );
  };
  fill($('clues-across'), puzzle.across);
  fill($('clues-down'), puzzle.down);
}

function openClues() {
  if (!state.profile || state.creating) return;
  tickClock();
  renderClueList();
  openDialog(els.cluesDialog);
}

function shareText() {
  const { game } = state.statsResult;
  const label = LEVEL_NAME[game.difficulty].toLowerCase();
  const title = game.day ? `Kreuzworträtsel #${puzzleNumber(game.day)} (${label})` : `Kreuzworträtsel (${label})`;
  const mistakes = game.mistakes === 0 ? 'ohne Fehler' : `${game.mistakes} Fehler`;
  const url = `${location.origin}${location.pathname}`;
  return `${title}\n⏱ ${formatTime(game.time)} · ${mistakes}\n\n${url}`;
}

function updateCountdown() {
  const total = secondsUntilBerlinMidnight();
  const pad = (n) => String(n).padStart(2, '0');
  const text = `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  $('countdown').replaceChildren('Neues Tagesrätsel in ', Object.assign(document.createElement('strong'), { textContent: text }));
  checkNewDay();
}

function stopCountdown() {
  clearInterval(state.countdownTimer);
  state.countdownTimer = null;
}

function showStats({ result = null, tab = 'stats' } = {}) {
  if (!state.profile || !currentGame()) return;
  const data = crossword();
  const game = currentGame();
  const finished = game.status === 'won';
  state.statsResult = finished ? result || { game, isBest: false } : null;

  $('stats-mode').textContent = modeTitle(state.mode);
  const numbers = $('stats-numbers');
  if (state.mode === 'daily') {
    const daily = data.stats.daily;
    numbers.classList.remove('is-three');
    numbers.replaceChildren(
      statBox(daily.won, 'Gelöst'),
      statBox(currentDailyStreak(daily, state.today), 'Aktuelle Serie'),
      statBox(daily.maxStreak, 'Beste Serie'),
      statBox(formatTime(daily.bestMs), 'Bestzeit'),
    );
  } else {
    const stats = data.stats[state.mode];
    numbers.classList.add('is-three');
    numbers.replaceChildren(
      statBox(stats.won, 'Gelöst'),
      statBox(formatTime(stats.bestMs), 'Bestzeit'),
      statBox(formatTime(averageMs(stats)), 'Ø Zeit'),
    );
  }
  $('level-list').replaceChildren(
    ...DIFFICULTY_KEYS.map((key) => {
      const stats = data.stats[key];
      const li = el('li');
      const name = el('strong', '', LEVEL_NAME[key]);
      name.append(el('small', '', ` · ${stats.won} gelöst`));
      li.append(name, el('span', 'level-time', formatTime(stats.bestMs)));
      li.append(el('small', '', stats.won ? `Ø ${formatTime(averageMs(stats))}` : 'noch nicht gelöst'), el('span', 'level-time-label', 'Bestzeit'));
      return li;
    }),
  );

  $('result-section').hidden = !finished;
  $('countdown').hidden = !(finished && state.mode === 'daily');
  stopCountdown();
  if (finished) {
    const { game: won, isBest } = state.statsResult;
    $('result-title').textContent = 'Gelöst!';
    $('result-summary').textContent = `${modeTitle(state.mode)} · ${formatTime(won.time)} · ${won.mistakes === 0 ? 'ohne Fehler' : `${won.mistakes} Fehler`}`;
    $('result-best').hidden = !isBest;
    $('next-label').textContent = state.mode === 'daily' ? 'Mehr Rätsel' : 'Neues Rätsel';
    if (state.mode === 'daily') {
      updateCountdown();
      state.countdownTimer = setInterval(updateCountdown, 1000);
    }
  }
  renderBadges();
  selectStatsTab(tab);
  openDialog(els.statsDialog);
}

function nextRound() {
  if (state.busy) return;
  els.statsDialog.close();
  // Nach dem Tagesrätsel geht es mit einem freien Rätsel derselben Stufe weiter.
  if (state.mode === 'daily') setMode(currentGame().difficulty);
  else startNewRound();
}

// ---------- Abzeichen ----------

function renderBadges() {
  renderBadgePanel(crosswordAchievements(state.profile.data), BADGE_GROUPS, state.unseenBadges);
}

function selectStatsTab(tab) {
  state.statsTab = showStatsTab(tab, state.unseenBadges, renderBadges);
}

// ---------- Rangliste ----------

const RANKING_CAPTION = {
  daily: () => `Tagesrätsel #${puzzleNumber(state.today)}: schnellste Zeit zuerst, danach wer noch dran ist.`,
  times: () => 'Bestzeit pro Stufe.',
  streak: () => 'Aktuelle Serie im Tagesrätsel, bei Gleichstand zählt die beste Serie.',
  solved: () => 'Alle gelösten Kreuzworträtsel, egal welche Stufe.',
};

// Alle Profile; das eigene mit seinem aktuellen, evtl. noch nicht gespeicherten Stand.
function rankingProfiles() {
  const list = state.profiles.map((p) => (state.profile && p.id === state.profile.id ? state.profile : p));
  if (state.profile && !list.includes(state.profile)) list.push(state.profile);
  return list;
}

function rankingRows(board, profiles) {
  if (board === 'daily') {
    const rows = dailyRanking(profiles, state.today);
    return rows.map((row) => {
      const mistakes = row.mistakes === 0 ? 'ohne Fehler' : `${row.mistakes} Fehler`;
      if (row.tier === 0) {
        return { ...row, place: rankOf(rows, row.id, (r) => `${r.tier}:${r.ms}`), value: formatTime(row.ms), sub: `gelöst · ${mistakes}` };
      }
      if (row.tier === 1) return { ...row, value: '…', sub: `spielt gerade · ${row.filled} Buchstaben`, empty: true };
      return { ...row, value: '–', sub: 'noch nicht gespielt', empty: true };
    });
  }
  if (board === 'times') {
    const rows = bestTimeRanking(profiles, state.rankingLevel);
    return rows.map((row) => ({
      ...row,
      place: row.bestMs != null ? rankOf(rows, row.id, (r) => r.bestMs) : null,
      value: formatTime(row.bestMs),
      sub: row.won ? `${row.won} gelöst` : 'noch nicht gelöst',
      empty: row.bestMs == null,
    }));
  }
  if (board === 'streak') {
    const rows = streakRanking(profiles, state.today);
    return rows.map((row) => ({
      ...row,
      place: row.streak > 0 ? rankOf(rows, row.id, (r) => r.streak) : null,
      value: row.streak > 0 ? `🔥 ${row.streak}` : '0',
      sub: `beste Serie: ${row.best}`,
      empty: row.streak === 0,
    }));
  }
  const rows = solvedRanking(profiles);
  return rows.map((row) => ({
    ...row,
    place: row.solved > 0 ? rankOf(rows, row.id, (r) => r.solved) : null,
    value: `✏️ ${row.solved}`,
    sub: row.solved === 1 ? '1 Rätsel' : `${row.solved} Rätsel`,
    empty: row.solved === 0,
  }));
}

function renderRanking() {
  const board = state.rankingBoard;
  for (const tab of els.rankingDialog.querySelectorAll('[data-board]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.board === board));
  }
  els.rankingLevels.hidden = board !== 'times';
  for (const tab of els.rankingLevels.querySelectorAll('[data-level]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.level === state.rankingLevel));
  }
  $('ranking-caption').textContent = RANKING_CAPTION[board]();
  renderRankingRows(els.rankingList, rankingRows(board, rankingProfiles()), state.profile?.id);
}

function openRanking(board = state.rankingBoard) {
  state.rankingBoard = RANKING_CAPTION[board] ? board : 'daily';
  if (state.mode !== 'daily' && state.rankingBoard === 'times') state.rankingLevel = state.mode;
  renderRanking();
  openDialog(els.rankingDialog);
  // Im Hintergrund auffrischen, damit auch Ergebnisse von anderen Geräten erscheinen.
  loadProfileList().then(() => {
    if (els.rankingDialog.open) renderRanking();
  });
}

// ---------- Neuer Tag und Abgleich mit dem Server ----------

// Erkennt Mitternacht (deutsche Zeit) und lädt dann das neue Tagesrätsel.
function checkNewDay() {
  const today = berlinDayKey();
  if (today === state.today || state.busy) return;
  state.today = today;
  if (!state.profile) return;
  ensureDaily();
  if (state.mode === 'daily') {
    if (els.statsDialog.open) els.statsDialog.close();
    selectStart();
    toast('Neues Tagesrätsel!', 2000);
    renderAll();
  }
}

// Übernimmt einen Stand vom Server (oder aus einem Konflikt) und zeichnet neu.
function applyProfileUpdate(beforeId) {
  ensureDaily();
  if (state.mode !== 'daily' && !crossword().games[state.mode]) ensureLevel(state.mode);
  // Ein anderes Rätsel als vorher: Markierung neu setzen.
  if (currentGame().id !== beforeId || state.selected == null) selectStart();
  if (state.busy) return;
  renderAll();
}

async function refreshFromCloud() {
  const profile = state.profile;
  if (!isCloud || !profile) return;
  await flushPending(profile.id, profile).catch(() => null);
  if (hasPendingSave(profile.id)) return;
  const revision = state.revision;
  let remote;
  try {
    remote = await fetchProfile(profile.id);
  } catch {
    return;
  }
  // Während des Ladens weitergespielt: der geladene Stand ist dann veraltet.
  if (!remote || state.profile !== profile || state.busy || state.revision !== revision || hasPendingSave(profile.id)) return;
  if (timeValue(remote.updatedAt) === timeValue(profile.updatedAt)) return;
  const beforeId = currentGame().id;
  const merged = mergeProfileData(remote.data, profile.data);
  profile.data = reuseUnchangedGames(profile.data, merged);
  profile.updatedAt = remote.updatedAt;
  applyProfileUpdate(beforeId);
  if (JSON.stringify(merged) !== JSON.stringify(remote.data)) persist();
}

// ---------- Ereignisse ----------

function bindEvents() {
  const openBaseSettings = initSettings({
    dialog: els.settingsDialog,
    themeSelect: els.themeSelect,
    highContrast: els.highContrast,
    soundToggle: els.soundToggle,
  });
  const openSettings = () => {
    els.showErrors.checked = crossword().settings.showErrors;
    openBaseSettings();
  };
  els.showErrors.addEventListener('change', () => {
    crossword().settings.showErrors = els.showErrors.checked;
    schedulePersist();
    renderBoard();
  });
  initBadgePopup();
  bindDialogs();

  els.switchProfile.addEventListener('click', async () => {
    tickClock();
    if (state.profile) await persist();
    goToHub({ switchProfile: true });
  });

  for (const tab of document.querySelectorAll('.mode-tab')) {
    tab.addEventListener('click', () => {
      if (!state.profile || state.busy || state.creating) return;
      const mode = tab.dataset.mode;
      if (mode !== state.mode) setMode(mode);
    });
  }

  els.board.addEventListener('click', (event) => {
    const cell = event.target.closest('.cw-cell');
    if (cell) selectCell(Number(cell.dataset.i), { tapped: true });
  });
  els.keyboard.addEventListener('click', (event) => {
    const key = event.target.closest('.key');
    if (!key) return;
    const value = key.dataset.key;
    if (value === 'DIR') toggleDirection();
    else if (value === 'BACKSPACE') backspace();
    else inputLetter(value);
  });
  $('clue-prev').addEventListener('click', () => stepClue(-1));
  $('clue-next').addEventListener('click', () => stepClue(1));
  $('clue-text').addEventListener('click', openClues);
  for (const list of [$('clues-across'), $('clues-down')]) {
    list.addEventListener('click', (event) => {
      const item = event.target.closest('.clue-item');
      if (!item) return;
      selectWord(currentPuzzle().words[Number(item.dataset.word)]);
      els.cluesDialog.close();
      renderBoard();
      renderClue();
    });
  }

  document.addEventListener('keydown', (event) => {
    // Solange ein neues Abzeichen gezeigt wird, schließen Enter, Leertaste und Escape die Meldung.
    if (isBadgePopupOpen()) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
        event.preventDefault();
        if (!event.repeat) advanceBadgePopup();
      }
      return;
    }
    if (els.gameScreen.hidden || document.querySelector('dialog[open]')) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const onOtherControl = event.target instanceof HTMLElement && event.target.closest('button') && !event.target.closest('.cw-cell, .key');
    const arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (event.key === 'Backspace') {
      event.preventDefault();
      backspace();
    } else if (event.key === 'Delete') {
      event.preventDefault();
      clearCurrent();
    } else if (arrows[event.key]) {
      event.preventDefault();
      moveSelection(...arrows[event.key]);
    } else if (event.key === ' ') {
      if (onOtherControl) return;
      event.preventDefault();
      toggleDirection();
    } else if (event.key === 'Tab' || event.key === 'Enter') {
      if (onOtherControl && event.key === 'Enter') return;
      event.preventDefault();
      stepClue(event.shiftKey ? -1 : 1);
    } else if (event.key === 'ß') {
      inputLetter('S');
      inputLetter('S');
    } else if (event.key.length === 1) {
      const letter = normalizeLetter(event.key);
      if (letter) inputLetter(letter);
    }
  });

  for (const button of document.querySelectorAll('[data-open]')) {
    button.addEventListener('click', () => {
      const id = button.dataset.open;
      tickClock();
      if (id === 'stats-dialog') showStats();
      else if (id === 'settings-dialog') openSettings();
      else openDialog($(id));
    });
  }
  els.statsDialog.addEventListener('close', stopCountdown);
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('close', () => {
      state.clockAt = performance.now();
    });
  }

  $('share-button').addEventListener('click', () => {
    if (state.statsResult) shareResult(shareText(), toast, els.statsDialog);
  });
  $('next-button').addEventListener('click', nextRound);
  $('tab-stats').addEventListener('click', () => selectStatsTab('stats'));
  $('tab-badges').addEventListener('click', () => selectStatsTab('badges'));
  $('stats-ranking').addEventListener('click', () => openRanking(state.mode === 'daily' ? 'daily' : 'times'));
  for (const tab of els.rankingDialog.querySelectorAll('[data-board]')) {
    tab.addEventListener('click', () => {
      state.rankingBoard = tab.dataset.board;
      renderRanking();
    });
  }
  for (const tab of els.rankingLevels.querySelectorAll('[data-level]')) {
    tab.addEventListener('click', () => {
      state.rankingLevel = tab.dataset.level;
      renderRanking();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!state.profile) return;
    if (document.visibilityState === 'hidden') {
      tickClock();
      persist();
      return;
    }
    state.clockAt = performance.now();
    checkNewDay();
    refreshFromCloud();
  });
  // Beim Verlassen der Seite den Stand noch vormerken (wird beim nächsten Öffnen hochgeladen).
  window.addEventListener('pagehide', () => {
    if (!state.profile) return;
    tickClock();
    persist();
  });
  window.addEventListener('online', () => {
    flushAllPending();
  });
  setInterval(() => {
    checkNewDay();
    if (state.profile && hasPendingSave(state.profile.id)) flushPending(state.profile.id, state.profile).catch(() => null);
  }, 30_000);

  onConflictMerged((profile) => {
    if (profile === state.profile) applyProfileUpdate(currentGame().id);
  });
}

function init() {
  buildKeyboard();
  bindEvents();
  loadAndStart();
}

init();
