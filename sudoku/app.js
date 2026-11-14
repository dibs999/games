// Sudoku: Oberfläche. Rätsel und Regeln stehen in logic.js, Spielstand und Statistik in data.js.

import {
  DIFFICULTIES,
  DIFFICULTY_KEYS,
  CELLS,
  PEERS,
  dailyPuzzle,
  generatePuzzle,
  conflicts,
  digitCounts,
  fromText,
} from './logic.js';
import {
  newGame,
  randomGameId,
  placeDigit,
  toggleNote,
  eraseCell,
  fillNotes,
  isGiven,
  recordSudokuWin,
  sudokuAchievements,
  unlockSudokuAchievements,
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
const PRAISE = ['Gelöst!', 'Sauber gelöst!', 'Stark!', 'Knobelprofi!', 'Geschafft!'];
const PERSIST_DELAY = 1500;
const HISTORY_MAX = 300;
const LEVEL_NAME = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };

// Die Abzeichen in der Ansicht, nach Thema gruppiert.
const BADGE_GROUPS = [
  { title: 'Gelöste Rätsel', ids: ['sudoku-first', 'sudoku-10', 'sudoku-50', 'sudoku-200'] },
  { title: 'Stufen', ids: ['sudoku-medium', 'sudoku-hard', 'sudoku-hard-10'] },
  { title: 'Tagesrätsel', ids: ['sudoku-daily-3', 'sudoku-daily-7', 'sudoku-daily-30'] },
  { title: 'Können', ids: ['sudoku-flawless', 'sudoku-fast'] },
];

const els = {
  loadScreen: $('load-screen'),
  loadStatus: $('load-status'),
  loadActions: $('load-actions'),
  gameScreen: $('game-screen'),
  switchProfile: $('switch-profile'),
  board: $('board'),
  creating: $('creating'),
  numpad: $('numpad'),
  toasts: $('toasts'),
  srStatus: $('sr-status'),
  time: $('puzzle-time'),
  level: $('puzzle-level'),
  mistakes: $('puzzle-mistakes'),
  toolUndo: $('tool-undo'),
  toolErase: $('tool-erase'),
  toolNotes: $('tool-notes'),
  toolFill: $('tool-fill'),
  notesState: $('notes-state'),
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
  focusDigit: null, // Ziffer, die ohne markiertes Feld hervorgehoben wird
  notes: false, // Notizen-Modus
  history: [], // Züge zum Zurücknehmen (nur im Speicher)
  clockAt: 0,
  clockTimer: null,
  persistTimer: null,
  revision: 0, // zählt lokale Änderungen, damit ein veralteter Serverstand sie nicht überschreibt
  busy: false, // Sieg wird gefeiert
  creating: false,
  modeToken: 0,
  statsTab: 'stats',
  statsResult: null,
  countdownTimer: null,
  rankingBoard: 'daily',
  rankingLevel: 'medium',
  unseenBadges: new Set(),
};

const toast = createToaster(() => els.toasts);

// ---------- Zugriff auf den Spielstand ----------

const sudoku = () => state.profile.data.sudoku;

function currentGame() {
  const data = sudoku();
  return state.mode === 'daily' ? data.daily : data.games[state.mode];
}

function levelOf(game) {
  return game.difficulty;
}

function modeTitle(mode) {
  return mode === 'daily' ? 'Tagesrätsel' : LEVEL_NAME[mode];
}

function ensureDaily() {
  const data = sudoku();
  if (!data.daily || data.daily.day !== state.today) {
    data.daily = { ...newGame(dailyPuzzle(state.today), state.today), day: state.today };
  }
}

function ensureLevel(level) {
  const data = sudoku();
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

// Nach Zügen etwas verzögert speichern, damit nicht jeder Zug einzeln hochgeladen wird.
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
  const data = profile.data.sudoku;
  ensureDaily();
  // Abzeichen, die schon verdient waren, still mit dem heutigen Datum nachtragen.
  if (unlockSudokuAchievements(profile.data).length > 0) schedulePersist();

  els.loadScreen.hidden = true;
  els.gameScreen.hidden = false;
  fillAvatar(els.switchProfile.querySelector('.avatar'), profile.name);
  els.switchProfile.querySelector('.profile-chip-name').textContent = profile.name;
  els.switchProfile.setAttribute('aria-label', `${profile.name} – Profil wechseln`);
  document.title = `Sudoku – ${profile.name}`;

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

// ---------- Modus ----------

async function setMode(mode) {
  const token = ++state.modeToken;
  tickClock();
  state.mode = mode;
  state.selected = null;
  state.focusDigit = null;
  state.history = [];
  clearToasts();
  if (mode === 'daily') ensureDaily();
  else if (!sudoku().games[mode] || sudoku().games[mode].status === 'won') {
    // Das Erzeugen dauert einen Moment: erst „Rätsel wird erstellt …“ zeigen.
    state.creating = true;
    renderAll();
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    if (token !== state.modeToken) return;
    ensureLevel(mode);
    state.creating = false;
    schedulePersist();
  }
  renderAll();
}

// Nach einem gelösten freien Rätsel ein neues erzeugen.
function startNewRound() {
  if (state.mode === 'daily') return;
  const data = sudoku();
  if (data.games[state.mode]) data.games[state.mode].status = 'won';
  setMode(state.mode);
}

// ---------- Zeichnen ----------

function buildBoard() {
  const cells = [];
  for (let i = 0; i < CELLS; i++) {
    const cell = el('button', 'cell');
    cell.type = 'button';
    cell.dataset.i = i;
    cell.style.setProperty('--d', Math.floor(i / 9) + (i % 9));
    cell.append(el('span', 'cell-digit'));
    cell.append(el('span', 'cell-notes'));
    cells.push(cell);
  }
  els.board.replaceChildren(...cells);
}

function buildNumpad() {
  const keys = [];
  for (let d = 1; d <= 9; d++) {
    const key = el('button', 'num-key', String(d));
    key.type = 'button';
    key.dataset.digit = d;
    key.append(el('small', '', ''));
    keys.push(key);
  }
  els.numpad.replaceChildren(...keys);
}

function renderBoard() {
  const game = state.profile && currentGame();
  const cells = els.board.children;
  els.creating.hidden = !state.creating;
  if (!game) return;
  const grid = fromText(game.cells);
  const selected = state.selected;
  const peers = selected != null ? new Set(PEERS[selected]) : new Set();
  const focus = state.focusDigit ?? (selected != null && grid[selected] ? grid[selected] : null);
  const showErrors = sudoku().settings.showErrors;
  const bad = showErrors
    ? new Set(grid.map((d, i) => (d && String(d) !== game.solution[i] ? i : -1)).filter((i) => i >= 0))
    : conflicts(grid);
  els.board.classList.toggle('is-won', game.status === 'won');

  for (let i = 0; i < CELLS; i++) {
    const cell = cells[i];
    const d = grid[i];
    const given = isGiven(game, i);
    cell.classList.toggle('is-given', given);
    cell.classList.toggle('is-selected', i === selected);
    cell.classList.toggle('is-peer', i !== selected && peers.has(i));
    cell.classList.toggle('is-same', i !== selected && focus != null && d === focus);
    cell.classList.toggle('is-wrong', !given && bad.has(i));
    const digit = cell.firstChild;
    const notes = cell.lastChild;
    digit.textContent = d || '';
    digit.hidden = !d;
    const mask = game.notes[i] || 0;
    notes.hidden = d !== 0 || !mask;
    if (!notes.hidden) {
      if (notes.childElementCount !== 9) notes.replaceChildren(...Array.from({ length: 9 }, () => document.createElement('span')));
      for (let n = 1; n <= 9; n++) {
        const span = notes.children[n - 1];
        span.textContent = mask & (1 << (n - 1)) ? n : '';
        span.classList.toggle('is-hit', focus === n);
      }
    }
    const row = Math.floor(i / 9) + 1;
    const col = (i % 9) + 1;
    const content = d ? `${d}${given ? ', vorgegeben' : ''}` : mask ? 'Notizen' : 'leer';
    cell.setAttribute('aria-label', `Zeile ${row}, Spalte ${col}: ${content}`);
  }
}

function renderNumpad() {
  const game = state.profile && currentGame();
  if (!game) return;
  const grid = fromText(game.cells);
  const placed = digitCounts(grid);
  const correct = new Array(10).fill(0);
  grid.forEach((d, i) => {
    if (d && String(d) === game.solution[i]) correct[d] += 1;
  });
  const playing = game.status === 'playing';
  for (const key of els.numpad.children) {
    const d = Number(key.dataset.digit);
    const done = correct[d] === 9;
    key.classList.toggle('is-done', done);
    key.classList.toggle('is-focus', state.focusDigit === d);
    key.disabled = !playing || (done && state.selected == null);
    key.lastChild.textContent = String(Math.max(0, 9 - placed[d]));
    key.setAttribute('aria-label', `${d}, noch ${Math.max(0, 9 - placed[d])} frei`);
  }
  els.numpad.classList.toggle('notes-mode', state.notes);
}

function renderInfo() {
  const game = state.profile && currentGame();
  if (!game) return;
  els.time.textContent = formatTime(game.time);
  els.mistakes.textContent = game.mistakes;
  els.mistakes.parentElement.classList.toggle('has-mistakes', game.mistakes > 0);
  els.level.textContent = state.mode === 'daily' ? `Heute · ${LEVEL_NAME[levelOf(game)]}` : LEVEL_NAME[levelOf(game)];
}

function renderTools() {
  const game = state.profile && currentGame();
  if (!game) return;
  const playing = game.status === 'playing';
  const editable = playing && state.selected != null && !isGiven(game, state.selected);
  els.toolUndo.disabled = !playing || state.history.length === 0;
  els.toolErase.disabled = !editable;
  els.toolFill.disabled = !playing;
  els.toolNotes.disabled = !playing;
  els.toolNotes.setAttribute('aria-pressed', String(state.notes));
  els.notesState.textContent = state.notes ? 'an' : 'aus';
}

function renderTabs() {
  for (const tab of document.querySelectorAll('.mode-tab')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.mode === state.mode));
  }
}

function renderAll() {
  renderTabs();
  renderBoard();
  renderNumpad();
  renderInfo();
  renderTools();
}

// ---------- Eingabe ----------

function snapshot(game) {
  return { cells: game.cells, notes: { ...game.notes } };
}

function unitComplete(game, i) {
  const r = Math.floor(i / 9);
  const c = i % 9;
  const box = Math.floor(r / 3) * 3 + Math.floor(c / 3);
  const done = (indices) => indices.every((j) => game.cells[j] === game.solution[j]);
  const row = Array.from({ length: 9 }, (_, k) => r * 9 + k);
  const col = Array.from({ length: 9 }, (_, k) => k * 9 + c);
  const block = Array.from({ length: 9 }, (_, k) => (Math.floor(box / 3) * 3 + Math.floor(k / 3)) * 9 + (box % 3) * 3 + (k % 3));
  return done(row) || done(col) || done(block);
}

function inputBlocked() {
  return !state.profile || state.busy || state.creating || currentGame().status !== 'playing';
}

function select(i) {
  if (!state.profile) return;
  state.selected = i;
  state.focusDigit = null;
  renderBoard();
  renderNumpad();
  renderTools();
}

function inputDigit(d) {
  if (inputBlocked()) return;
  const game = currentGame();
  const i = state.selected;
  // Ohne bearbeitbares Feld hebt eine Ziffer nur alle gleichen Ziffern hervor.
  if (i == null || isGiven(game, i)) {
    state.focusDigit = state.focusDigit === d ? null : d;
    renderBoard();
    renderNumpad();
    return;
  }
  const before = snapshot(game);
  const filled = game.cells[i] !== '0';
  let changed = false;
  if (state.notes) {
    changed = !filled && toggleNote(game, i, d);
    if (changed) playTap();
  } else if (game.cells[i] === String(d)) {
    // Dieselbe Ziffer nochmal tippen löscht sie.
    changed = eraseCell(game, i);
    if (changed) playTap();
  } else {
    changed = placeDigit(game, i, d);
    if (changed) {
      const wrong = String(d) !== game.solution[i];
      // Ohne Fehleranzeige verrät auch der Klang nicht, ob die Ziffer stimmt.
      if (wrong && sudoku().settings.showErrors) playInvalid();
      else if (game.status === 'won') {
        // Beim Sieg spielt der Jubel statt des einzelnen Klangs.
      } else if (unitComplete(game, i)) playUnitDone();
      else playPlace(d);
    }
  }
  if (!changed) return;
  state.history.push(before);
  if (state.history.length > HISTORY_MAX) state.history.shift();
  state.focusDigit = null;
  if (game.status === 'won') {
    onWin(game);
    return;
  }
  schedulePersist();
  renderAll();
}

function eraseSelected() {
  if (inputBlocked() || state.selected == null) return;
  const game = currentGame();
  const before = snapshot(game);
  if (!eraseCell(game, state.selected)) return;
  state.history.push(before);
  playTap();
  schedulePersist();
  renderAll();
}

function undo() {
  if (inputBlocked() || state.history.length === 0) return;
  const game = currentGame();
  const previous = state.history.pop();
  game.cells = previous.cells;
  game.notes = previous.notes;
  playTap();
  schedulePersist();
  renderAll();
}

function toggleNotesMode() {
  if (inputBlocked()) return;
  state.notes = !state.notes;
  renderTools();
  renderNumpad();
}

function fillAllNotes() {
  if (inputBlocked()) return;
  const game = currentGame();
  const before = snapshot(game);
  fillNotes(game);
  state.history.push(before);
  playTap();
  schedulePersist();
  renderAll();
}

function moveSelection(dx, dy) {
  if (!state.profile) return;
  if (state.selected == null) {
    select(40);
    return;
  }
  const r = Math.min(8, Math.max(0, Math.floor(state.selected / 9) + dy));
  const c = Math.min(8, Math.max(0, (state.selected % 9) + dx));
  select(r * 9 + c);
}

// ---------- Sieg ----------

async function onWin(game) {
  state.busy = true;
  tickClock();
  const data = sudoku();
  const { isBest } = recordSudokuWin(data, game);
  const unlocked = unlockSudokuAchievements(state.profile.data);
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

// ---------- Statistik, Teilen ----------

function shareText() {
  const { game } = state.statsResult;
  const label = LEVEL_NAME[levelOf(game)].toLowerCase();
  const title = game.day ? `Sudoku #${puzzleNumber(game.day)} (${label})` : `Sudoku (${label})`;
  const mistakes = game.mistakes === 0 ? 'ohne Fehler' : `${game.mistakes} ${game.mistakes === 1 ? 'Fehler' : 'Fehler'}`;
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
  const data = sudoku();
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
    $('next-label').textContent = state.mode === 'daily' ? 'Mehr Sudoku' : 'Neues Rätsel';
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
  if (state.mode === 'daily') setMode(levelOf(currentGame()));
  else startNewRound();
}

// ---------- Abzeichen ----------

function renderBadges() {
  renderBadgePanel(sudokuAchievements(state.profile.data), BADGE_GROUPS, state.unseenBadges);
}

function selectStatsTab(tab) {
  state.statsTab = showStatsTab(tab, state.unseenBadges, renderBadges);
}

// ---------- Rangliste ----------

const RANKING_CAPTION = {
  daily: () => `Tagesrätsel #${puzzleNumber(state.today)}: schnellste Zeit zuerst, danach wer noch dran ist.`,
  times: () => 'Bestzeit pro Stufe.',
  streak: () => 'Aktuelle Serie im Tagesrätsel, bei Gleichstand zählt die beste Serie.',
  solved: () => 'Alle gelösten Sudokus, egal welche Stufe.',
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
      if (row.tier === 1) return { ...row, value: '…', sub: `spielt gerade · ${row.filled} Felder belegt`, empty: true };
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
    value: `🧩 ${row.solved}`,
    sub: row.solved === 1 ? '1 Sudoku' : `${row.solved} Sudokus`,
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

// Vom Statistik-Dialog aus: die Tafel, die zum gerade Gezeigten passt.
function openRankingFromStats() {
  openRanking(state.mode === 'daily' ? 'daily' : 'times');
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
    state.selected = null;
    state.history = [];
    toast('Neues Tagesrätsel!', 2000);
    renderAll();
  }
}

// Übernimmt einen Stand vom Server (oder aus einem Konflikt) und zeichnet neu.
function applyProfileUpdate(beforeId) {
  ensureDaily();
  if (state.mode !== 'daily' && !sudoku().games[state.mode]) ensureLevel(state.mode);
  const game = currentGame();
  // Ein anderes Rätsel als vorher: Markierung und Zurück-Liste gelten nicht mehr.
  if (game.id !== beforeId) {
    state.selected = null;
    state.history = [];
  }
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
    els.showErrors.checked = sudoku().settings.showErrors;
    openBaseSettings();
  };
  els.showErrors.addEventListener('change', () => {
    sudoku().settings.showErrors = els.showErrors.checked;
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
    const cell = event.target.closest('.cell');
    if (cell) select(Number(cell.dataset.i));
  });
  els.numpad.addEventListener('click', (event) => {
    const key = event.target.closest('.num-key');
    if (key) inputDigit(Number(key.dataset.digit));
  });
  els.toolUndo.addEventListener('click', undo);
  els.toolErase.addEventListener('click', eraseSelected);
  els.toolNotes.addEventListener('click', toggleNotesMode);
  els.toolFill.addEventListener('click', fillAllNotes);

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
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
      return;
    }
    if (event.altKey) return;
    const arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (/^[1-9]$/.test(event.key)) {
      inputDigit(Number(event.key));
    } else if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
      event.preventDefault();
      eraseSelected();
    } else if (arrows[event.key]) {
      event.preventDefault();
      moveSelection(...arrows[event.key]);
    } else if (event.key.toLowerCase() === 'n') {
      toggleNotesMode();
    } else if (event.key === 'Escape') {
      state.selected = null;
      state.focusDigit = null;
      renderAll();
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
  els.statsDialog.addEventListener('close', () => {
    stopCountdown();
    state.clockAt = performance.now();
  });
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
  $('stats-ranking').addEventListener('click', openRankingFromStats);
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
  buildBoard();
  buildNumpad();
  bindEvents();
  loadAndStart();
}

init();
