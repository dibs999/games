// Startseite: Profil wählen (oder anlegen), dann das Spiel.
// Das gewählte Profil merkt sich der Browser, jedes Spiel lädt es von dort.

import { $, el, fillAvatar, openDialog, createToaster, bindDialogs } from './shared/ui.js';
import { berlinDayKey } from './shared/day.js';
import { currentDayStreak, solvedToday } from './shared/streak.js';
import { emptyProfileData } from './shared/profile.js';
import { lastProfileId, loadProfile, rememberProfile } from './shared/session.js';
import {
  isCloud,
  listProfiles,
  createProfile,
  flushPending,
  cleanName,
  setActiveProfile,
  listLocalOnlyProfiles,
  importLocalProfile,
} from './shared/store.js';
import { achievements as wordleAchievements } from './wordle/game.js';
import { sudokuAchievements, formatTime, gameProgress } from './sudoku/data.js';
import { dailyDifficulty, DIFFICULTIES } from './sudoku/logic.js';
import { crosswordAchievements, gameProgress as crosswordProgress } from './crossword/data.js';
import { minesweeperAchievements, gameProgress as minesweeperProgress } from './minesweeper/data.js';
import { dailyDifficulty as minesweeperDifficulty, DIFFICULTIES as MINESWEEPER_LEVELS } from './minesweeper/logic.js';
import { numbersAchievements, gameProgress as numbersProgress } from './numbers/data.js';
import { dailyDifficulty as numbersDifficulty, DIFFICULTIES as NUMBERS_LEVELS } from './numbers/logic.js';
import { dailyDifficulty as crosswordDifficulty, DIFFICULTIES as CROSSWORD_LEVELS } from './crossword/logic.js';

const els = {
  profileScreen: $('profile-screen'),
  profileList: $('profile-list'),
  profileStatus: $('profile-status'),
  profileToasts: $('profile-toasts'),
  localHint: $('local-hint'),
  localImport: $('local-import'),
  localImportList: $('local-import-list'),
  newProfileButton: $('new-profile-button'),
  newProfileDialog: $('new-profile-dialog'),
  newProfileForm: $('new-profile-form'),
  newProfileName: $('new-profile-name'),
  newProfileError: $('new-profile-error'),
  gamesScreen: $('games-screen'),
  gamesHello: $('games-hello'),
  streakCard: $('streak-card'),
  streakDays: $('streak-days'),
  streakText: $('streak-text'),
  gameList: $('game-list'),
  switchProfile: $('switch-profile'),
};

const state = {
  profiles: [],
  profile: null, // das gewählte Profil (Spielauswahl sichtbar)
  today: berlinDayKey(),
  loadToken: 0,
  selectToken: 0,
};

const toast = createToaster(() => els.profileToasts);

// ---------- Spiele ----------

// Hier kommen weitere Spiele dazu: Ordner, Name, Kurzbeschreibung und eine Zeile Stand zum Profil.
const GAMES = [
  {
    id: 'wordle',
    href: 'wordle/',
    name: 'Wordle',
    text: 'Errate das Wort in sechs Versuchen',
    icon: '<span class="lt s-correct" style="--r:-6deg" aria-hidden="true">W</span>',
    status(data) {
      const pills = [];
      const daily = data.daily;
      if (daily?.day === state.today && daily.status === 'won') {
        pills.push({ text: `Heute ✓ ${daily.guesses.length}/6`, kind: 'win' });
      } else if (daily?.day === state.today && daily.status === 'lost') {
        pills.push({ text: 'Heute ✗', kind: 'open' });
      } else pills.push({ text: 'Heute offen', kind: 'open' });
      return pills;
    },
    doneToday: (data) => data.daily?.day === state.today && data.daily.status !== 'playing',
  },
  {
    id: 'sudoku',
    href: 'sudoku/',
    name: 'Sudoku',
    text: 'Zahlenrätsel in drei Stufen',
    icon:
      '<svg class="game-icon-svg" viewBox="0 0 48 48" aria-hidden="true"><rect x="3" y="3" width="42" height="42" rx="9" class="gi-bg"/><path d="M17 8v32M31 8v32M8 17h32M8 31h32" class="gi-line"/><text x="24" y="29" text-anchor="middle" class="gi-num">9</text></svg>',
    status(data) {
      const pills = [];
      const daily = data.sudoku.daily;
      if (daily?.day === state.today && daily.status === 'won') {
        pills.push({ text: `Heute ✓ ${formatTime(daily.time)}`, kind: 'win' });
      } else if (daily?.day === state.today && gameProgress(daily) >= 1000) {
        pills.push({ text: 'Heute läuft', kind: 'open' });
      } else pills.push({ text: `Heute offen · ${DIFFICULTIES[dailyDifficulty(state.today)].label.toLowerCase()}`, kind: 'open' });
      return pills;
    },
    doneToday: (data) => data.sudoku.daily?.day === state.today && data.sudoku.daily.status === 'won',
  },
  {
    id: 'crossword',
    href: 'crossword/',
    name: 'Kreuzworträtsel',
    text: 'Wörter erraten mit Hinweisen',
    icon:
      '<svg class="game-icon-svg" viewBox="0 0 48 48" aria-hidden="true"><rect x="3" y="3" width="42" height="42" rx="9" class="gi-bg gi-yellow"/><g class="gi-cells"><rect x="7" y="7" width="8" height="8" rx="1.5"/><rect x="16" y="7" width="8" height="8" rx="1.5"/><rect x="25" y="7" width="8" height="8" rx="1.5"/><rect x="34" y="7" width="8" height="8" rx="1.5"/><rect x="16" y="16" width="8" height="8" rx="1.5"/><rect x="16" y="25" width="8" height="8" rx="1.5"/><rect x="7" y="25" width="8" height="8" rx="1.5"/><rect x="25" y="25" width="8" height="8" rx="1.5"/><rect x="34" y="25" width="8" height="8" rx="1.5"/><rect x="16" y="34" width="8" height="8" rx="1.5"/><rect x="34" y="16" width="8" height="8" rx="1.5"/></g></svg>',
    status(data) {
      const pills = [];
      const daily = data.crossword.daily;
      if (daily?.day === state.today && daily.status === 'won') {
        pills.push({ text: `Heute ✓ ${formatTime(daily.time)}`, kind: 'win' });
      } else if (daily?.day === state.today && crosswordProgress(daily) >= 1000) {
        pills.push({ text: 'Heute läuft', kind: 'open' });
      } else {
        const level = CROSSWORD_LEVELS[crosswordDifficulty(state.today)].label.toLowerCase();
        pills.push({ text: `Heute offen · ${level}`, kind: 'open' });
      }
      return pills;
    },
    doneToday: (data) => data.crossword.daily?.day === state.today && data.crossword.daily.status === 'won',
  },
  {
    id: 'numbers',
    href: 'numbers/',
    name: 'Zahlenjagd',
    text: 'Mit Rechnen zur Zielzahl',
    icon: '<span class="game-icon-tile gi-accent" aria-hidden="true">×</span>',
    status: (data) => puzzleStatus(data, 'numbers', numbersProgress, numbersDifficulty, NUMBERS_LEVELS),
    doneToday: (data) => data.numbers.daily?.day === state.today && data.numbers.daily.status === 'won',
  },
  {
    id: 'minesweeper',
    href: 'minesweeper/',
    name: 'Minensucher',
    text: 'Minenfelder ohne Raten räumen',
    icon: '<span class="game-icon-tile gi-grape" aria-hidden="true">💣</span>',
    status: (data) => puzzleStatus(data, 'minesweeper', minesweeperProgress, minesweeperDifficulty, MINESWEEPER_LEVELS),
    doneToday: (data) => data.minesweeper.daily?.day === state.today && data.minesweeper.daily.status === 'won',
  },
];

// Stand eines Rätselspiels mit Tagesrätsel (Abschnitt im Profil): gelöst mit Zeit, läuft oder offen mit Stufe.
function puzzleStatus(data, section, progress, levelOf, levels) {
  const daily = data[section].daily;
  if (daily?.day === state.today && daily.status === 'won') return [{ text: `Heute ✓ ${formatTime(daily.time)}`, kind: 'win' }];
  if (daily?.day === state.today && progress(daily) >= 1000) return [{ text: 'Heute läuft', kind: 'open' }];
  return [{ text: `Heute offen · ${levels[levelOf(state.today)].label.toLowerCase()}`, kind: 'open' }];
}

function earnedBadges(data) {
  return [...wordleAchievements(data), ...sudokuAchievements(data), ...crosswordAchievements(data), ...numbersAchievements(data), ...minesweeperAchievements(data)].filter((a) => a.earned).length;
}

// ---------- Profile ----------

function setProfileStatus(message, { error = false, retry = false } = {}) {
  els.profileStatus.replaceChildren(message);
  els.profileStatus.classList.toggle('is-error', error);
  if (retry) {
    const button = el('button', 'button button-secondary', 'Erneut versuchen');
    button.type = 'button';
    button.style.marginTop = '0.8rem';
    button.addEventListener('click', () => loadProfiles());
    els.profileStatus.append(document.createElement('br'), button);
  }
}

function profilePills(data) {
  const pills = [];
  const badges = earnedBadges(data);
  if (badges > 0) pills.push({ text: `🏅 ${badges}`, kind: 'badge' });
  // Gemeinsame Tages-Serie: grün, wenn heute schon ein Tagesrätsel gelöst wurde.
  const streak = currentDayStreak(data.dayStreak, state.today);
  if (solvedToday(data.dayStreak, state.today)) pills.push({ text: `🔥 ${streak} ✓`, kind: 'win' });
  else if (streak > 0) pills.push({ text: `🔥 ${streak}`, kind: 'streak' });
  else pills.push({ text: 'Heute offen', kind: 'open' });
  return pills;
}

function renderProfiles() {
  const lastId = lastProfileId();
  const sorted = [...state.profiles].sort((a, b) => {
    if (a.id === lastId) return -1;
    if (b.id === lastId) return 1;
    return a.name.localeCompare(b.name, 'de');
  });

  els.profileList.replaceChildren(
    ...sorted.map((profile) => {
      const li = el('li');
      const button = el('button', 'profile-card');
      button.type = 'button';
      button.dataset.id = profile.id;
      if (profile.id === lastId) {
        button.classList.add('is-last');
        button.append(el('span', 'badge-last', 'Zuletzt gespielt'));
      }
      const avatar = el('span', 'avatar');
      avatar.setAttribute('aria-hidden', 'true');
      fillAvatar(avatar, profile.name);
      const meta = el('span', 'profile-card-meta');
      for (const part of profilePills(profile.data)) meta.append(el('span', `pill pill-${part.kind}`, part.text));
      button.append(avatar, el('span', 'profile-card-name', profile.name), meta);
      li.append(button);
      return li;
    }),
  );

  if (state.profiles.length === 0) setProfileStatus('Noch keine Profile. Leg das erste an!');
}

function renderLocalImport() {
  const locals = listLocalOnlyProfiles();
  els.localImport.hidden = locals.length === 0;
  els.localImportList.replaceChildren(
    ...locals.map((profile) => {
      const li = el('li');
      const avatar = el('span', 'avatar');
      avatar.setAttribute('aria-hidden', 'true');
      fillAvatar(avatar, profile.name);
      const button = el('button', 'button', 'Online übernehmen');
      button.type = 'button';
      button.dataset.importId = profile.id;
      button.setAttribute('aria-label', `${profile.name} online übernehmen`);
      li.append(avatar, el('span', 'local-import-name', profile.name), button);
      return li;
    }),
  );
}

async function importProfile(button) {
  button.disabled = true;
  button.parentElement.querySelector('.local-import-error')?.remove();
  try {
    const profile = await importLocalProfile(button.dataset.importId);
    state.profiles.push(profile);
    setProfileStatus('');
    renderProfiles();
    renderLocalImport();
    toast(`${profile.name} ist jetzt auf allen Geräten verfügbar`, 2500);
  } catch (error) {
    button.disabled = false;
    const message = el(
      'span',
      'local-import-error',
      error.code === 'duplicate' ? 'Diesen Namen gibt es online schon.' : error.message || 'Übernehmen fehlgeschlagen.',
    );
    message.setAttribute('role', 'alert');
    button.parentElement.append(message);
  }
}

// quiet: bereits angezeigte Profile stehen lassen und nur im Hintergrund auffrischen.
async function loadProfiles({ quiet = false } = {}) {
  const token = ++state.loadToken;
  if (!quiet) setProfileStatus('Profile werden geladen …');
  try {
    const profiles = await listProfiles();
    if (token !== state.loadToken) return;
    state.profiles = profiles;
    setProfileStatus('');
    renderProfiles();
    renderLocalImport();
  } catch (error) {
    if (token !== state.loadToken) return;
    if (quiet) setProfileStatus('Offline – zuletzt geladener Stand.');
    else setProfileStatus(error.message || 'Profile konnten nicht geladen werden.', { error: true, retry: true });
  }
}

function showProfileScreen() {
  state.selectToken += 1;
  state.profile = null;
  setActiveProfile(null);
  els.gamesScreen.hidden = true;
  els.profileScreen.hidden = false;
  if (state.profiles.length > 0) {
    setProfileStatus('');
    renderProfiles();
  }
  loadProfiles({ quiet: state.profiles.length > 0 });
}

// ---------- Spielauswahl ----------

// Die gemeinsame Serie: Es zählt, dass an einem Tag irgendein Tagesrätsel gelöst wurde.
function renderStreak(data) {
  const streak = currentDayStreak(data.dayStreak, state.today);
  const solved = solvedToday(data.dayStreak, state.today);
  const done = GAMES.filter((game) => game.doneToday(data)).length;
  els.streakCard.classList.toggle('is-solved', solved);
  els.streakCard.classList.toggle('is-cold', streak === 0);
  els.streakDays.textContent = streak === 1 ? '1 Tag in Folge' : `${streak} Tage in Folge`;
  const record = data.dayStreak.max > streak ? ` · Rekord ${data.dayStreak.max}` : '';
  if (solved) els.streakText.textContent = `Heute geschafft ✓ · ${done} von ${GAMES.length} Tagesrätseln gelöst${record}`;
  else if (streak > 0) els.streakText.textContent = `Löse heute ein Tagesrätsel, um die Serie zu halten${record}`;
  else els.streakText.textContent = `Löse ein Tagesrätsel, um eine Serie zu starten${record}`;
}

function renderGames() {
  const { profile } = state;
  fillAvatar(els.switchProfile.querySelector('.avatar'), profile.name);
  els.switchProfile.querySelector('.profile-chip-name').textContent = profile.name;
  els.switchProfile.setAttribute('aria-label', `${profile.name} – Profil wechseln`);
  const badges = earnedBadges(profile.data);
  els.gamesHello.textContent = badges > 0 ? `Hallo ${profile.name}! 🏅 ${badges} Abzeichen` : `Hallo ${profile.name}!`;
  renderStreak(profile.data);

  els.gameList.replaceChildren(
    ...GAMES.map((game) => {
      const li = el('li');
      const link = el('a', 'game-card');
      link.href = game.href;
      const icon = el('span', 'game-icon');
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = game.icon; // feste Zeichenketten aus GAMES, keine Nutzereingaben
      const body = el('span', 'game-body');
      const status = el('span', 'game-status');
      for (const part of game.status(profile.data)) status.append(el('span', `pill pill-${part.kind}`, part.text));
      body.append(el('span', 'game-name', game.name), el('span', 'game-text', game.text), status);
      const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chevron.setAttribute('class', 'ico game-chevron');
      chevron.setAttribute('viewBox', '0 0 24 24');
      chevron.setAttribute('aria-hidden', 'true');
      chevron.innerHTML = '<path d="M9 5l7 7-7 7"/>';
      link.append(icon, body, chevron);
      li.append(link);
      return li;
    }),
  );
}

function showGames(profile) {
  state.profile = profile;
  els.profileScreen.hidden = true;
  els.gamesScreen.hidden = false;
  renderGames();
}

async function selectProfile(id) {
  const token = ++state.selectToken;
  const card = els.profileList.querySelector(`[data-id="${CSS.escape(id)}"]`);
  card?.classList.add('is-loading');
  let profile;
  try {
    profile = await loadProfile(id);
  } catch (error) {
    card?.classList.remove('is-loading');
    toast(error.message || 'Profil konnte nicht geladen werden.', 3000);
    return;
  }
  card?.classList.remove('is-loading');
  // Ein späterer Klick hat diese Auswahl überholt.
  if (token !== state.selectToken) return;
  if (!profile) {
    state.profiles = state.profiles.filter((p) => p.id !== id);
    renderProfiles();
    toast('Dieses Profil gibt es nicht mehr.', 3000);
    return;
  }
  state.today = berlinDayKey();
  rememberProfile(id);
  showGames(profile);
}

async function submitNewProfile(event) {
  event.preventDefault();
  const name = cleanName(els.newProfileName.value);
  if (!name) {
    els.newProfileError.textContent = 'Bitte einen Namen eingeben.';
    return;
  }
  if (state.profiles.some((p) => p.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) {
    els.newProfileError.textContent = 'Diesen Namen gibt es schon. Wähle ihn in der Liste aus.';
    return;
  }
  const submit = els.newProfileForm.querySelector('[type="submit"]');
  submit.disabled = true;
  els.newProfileError.textContent = '';
  try {
    const profile = await createProfile(name, emptyProfileData());
    state.profiles.push(profile);
    els.newProfileDialog.close();
    await selectProfile(profile.id);
  } catch (error) {
    if (error.code === 'duplicate') {
      // Jemand anderes hat den Namen gerade angelegt: Liste auffrischen, damit das Profil sichtbar wird.
      els.newProfileError.textContent = 'Diesen Namen gibt es schon. Wähle ihn in der Liste aus.';
      if (isCloud) loadProfiles({ quiet: true });
    } else {
      els.newProfileError.textContent = error.message || 'Profil konnte nicht angelegt werden.';
    }
  } finally {
    submit.disabled = false;
  }
}

// ---------- Ereignisse ----------

function bindEvents() {
  els.profileList.addEventListener('click', (event) => {
    const card = event.target.closest('.profile-card');
    if (card) selectProfile(card.dataset.id);
  });
  els.localImportList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-import-id]');
    if (button && !button.disabled) importProfile(button);
  });
  els.newProfileButton.addEventListener('click', () => {
    els.newProfileForm.reset();
    els.newProfileError.textContent = '';
    openDialog(els.newProfileDialog);
    els.newProfileName.focus();
  });
  els.newProfileForm.addEventListener('submit', submitNewProfile);
  els.switchProfile.addEventListener('click', async () => {
    if (state.profile) await flushPending(state.profile.id).catch(() => null);
    showProfileScreen();
  });
  bindDialogs();

  // Zurück von einem Spiel (auch aus dem Zwischenspeicher des Browsers): Stand neu laden, damit „Heute ✓“ stimmt.
  const refresh = () => {
    state.today = berlinDayKey();
    if (isCloud && !els.profileScreen.hidden) loadProfiles({ quiet: true });
    else if (state.profile) {
      loadProfile(state.profile.id)
        .then((profile) => {
          if (profile && state.profile) showGames(profile);
        })
        .catch(() => null);
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) refresh();
  });
}

// Mit gemerktem Profil gleich die Spielauswahl zeigen. „?wechseln“ (aus den Spielen) zeigt die Profilliste.
async function init() {
  bindEvents();
  els.localHint.hidden = isCloud;
  const wantsList = new URLSearchParams(location.search).has('wechseln');
  const lastId = lastProfileId();
  if (lastId && !wantsList) {
    try {
      const profile = await loadProfile(lastId);
      if (profile) {
        showGames(profile);
        return;
      }
    } catch {
      // Nicht erreichbar: unten die Profilliste mit ihrer Fehlermeldung zeigen.
    }
  }
  showProfileScreen();
}

init();
