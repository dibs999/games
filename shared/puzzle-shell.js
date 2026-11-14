// Gemeinsames Gerüst für Rätselspiele mit Stufen und Tagesrätsel (Zahlenjagd, Minensucher, Nonogramm, …).
//
// Das Gerüst baut die Seite (Kopf, Reiter, Infozeile, Dialoge) und erledigt alles Gemeinsame: Profil laden,
// Tagesrätsel und Stufen, Uhr, Speichern, Sieg und Abzeichen, Statistik, Rangliste, Teilen, Mitternacht,
// Abgleich mit dem Server. Ein Spiel liefert nur sein Spielfeld und seine Regeln (siehe config unten).
//
// Aufruf in der app.js eines Spiels:
//   const shell = createPuzzleShell(config);   // baut die Seite, Spielfeld in shell.els.main / shell.els.below einsetzen
//   …
//   shell.start();                             // lädt das Profil und beginnt
//
// config:
//   section        Schlüssel im Profil (data.<section>), z. B. 'minesweeper'
//   name           Anzeigename, z. B. 'Minensucher'
//   logo           { tile: 's-sky', letter: 'M', rest: 'inen' }  Logo im Kopf
//   description    Beschreibung für die Seite
//   helpHtml       Inhalt des Dialogs „So wird gespielt“ (feste Zeichenkette)
//   makeDaily(day) Tagesrätsel als Spiel (mit day und difficulty)
//   makeLevel(level)  freies Rätsel als Spiel (mit difficulty)
//   progress(game) Fortschritt: wächst mit jedem Zug, ab 1000 gilt ein Rätsel als angefangen
//   achievements(data), unlock(data, now), badgeGroups   Abzeichen
//   counter        optional { label, value(game), warn(game) }: Zähler rechts in der Infozeile (z. B. Fehler)
//   showErrors     optional { title, text }: Schalter „Fehler anzeigen“ in den Einstellungen
//   summaryExtra(game)    Text hinter der Zeit im Ergebnis, z. B. ' · 2 Fehler'
//   shareExtra(game)      Text hinter der Zeit beim Teilen
//   ranking        { playing(row), icon, unit(n), solvedCaption }
//   isFinished(game)      ein neues freies Rätsel erzeugen, wenn das aktuelle fertig ist (Standard: gelöst)
//   onGameReady(game)     ein anderes Spiel ist jetzt aktuell: Auswahl und Ähnliches zurücksetzen
//   render()              das Spielfeld zeichnen (wird bei jeder Änderung aufgerufen)
//   lostText              Text, wenn ein Spiel verloren wurde

import { LEVELS, LEVEL_NAME } from './puzzle-stats.js';
import {
  recordSectionWin,
  currentDailyStreak,
  averageMs,
  formatTime,
  rankOf,
  dailyRanking,
  bestTimeRanking,
  streakRanking,
  solvedRanking,
} from './puzzle-stats.js';
import { berlinDayKey, puzzleNumber, secondsUntilBerlinMidnight } from './day.js';
import { recordDailyWin } from './streak.js';
import { burstConfetti } from './fx.js';
import { mergeProfileData, reuseUnchangedGames } from './profile.js';
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
} from './store.js';
import { playWin, playLose } from './sound.js';
import { $, el, wait, fillAvatar, openDialog, createToaster, clearToasts, bindDialogs, shareResult } from './ui.js';
import { initSettings } from './settings.js';
import { loadProfile, lastProfileId } from './session.js';
import { renderBadgePanel, showStatsTab, renderRankingRows, statBox } from './puzzle-ui.js';
import {
  showBadgePopups,
  dismissBadgePopups,
  isBadgePopupOpen,
  advanceBadgePopup,
  initBadgePopup,
} from './badge-popup.js';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const PRAISE = ['Gelöst!', 'Stark!', 'Sauber!', 'Geschafft!', 'Klasse!'];
const PERSIST_DELAY = 1500;

const ICON = {
  chip: '<svg class="ico chip-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9.5l5-5 5 5M7 14.5l5 5 5-5"/></svg>',
  help: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.3"/><path d="M9.4 9.4a2.7 2.7 0 0 1 5.3.8c0 1.9-2.7 2.2-2.7 4"/><circle cx="12" cy="17.4" r=".7" fill="currentColor"/></svg>',
  stats: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 20v-6M12 20V5M18.5 20v-9.5"/></svg>',
  settings: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h9.5M18.5 7.5H20M4 16.5h3.5M12.5 16.5H20"/><circle cx="16" cy="7.5" r="2.4"/><circle cx="10" cy="16.5" r="2.4"/></svg>',
  clock: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 3h5"/></svg>',
  close: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  share: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11M7.5 8 12 3.5 16.5 8"/><path d="M5 13v5.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V13"/></svg>',
  next: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

// Der Aufbau der Seite. Alles feste Zeichenketten, keine Nutzereingaben.
function pageHtml(config) {
  const { logo } = config;
  const dialog = (id, title, body) => `
  <dialog id="${id}" class="dialog" aria-labelledby="${id}-title">
    <div class="toasts dialog-toasts" role="status" aria-live="polite"></div>
    <div class="dialog-body">
      <div class="grabber" aria-hidden="true"></div>
      <button class="dialog-close" type="button" data-close aria-label="Schließen">${ICON.close}</button>
      ${title ? `<h2 id="${id}-title">${title}</h2>` : ''}${body}
    </div>
  </dialog>`;
  const tab = (key, label) => `<button class="mode-tab" type="button" data-mode="${key}" aria-pressed="false">${label}</button>`;
  const levelTab = (key, label, selected) =>
    `<button class="dialog-tab" type="button" role="tab" data-level="${key}" aria-selected="${selected}">${label}</button>`;
  const boardTab = (key, label, selected) =>
    `<button class="dialog-tab" type="button" role="tab" data-board="${key}" aria-selected="${selected}" aria-controls="ranking-list">${label}</button>`;
  return `
  <main id="load-screen" class="screen load-screen">
    <p id="load-status" class="load-status" role="status">Profil wird geladen …</p>
    <div id="load-actions" class="load-actions"></div>
  </main>

  <div id="game-screen" class="screen puzzle-shell" hidden>
    <header class="game-header">
      <button id="switch-profile" class="profile-chip" type="button" aria-label="Profil wechseln">
        <span class="avatar avatar-small" aria-hidden="true"></span>
        <span class="profile-chip-name"></span>
        ${ICON.chip}
      </button>
      <a class="logo-mini" href="../" aria-label="${config.name} – zur Spielauswahl">
        <span class="lt ${logo.tile}" style="--r:-6deg" aria-hidden="true">${logo.letter}</span><span class="logo-mini-rest" aria-hidden="true">${logo.rest}</span>
      </a>
      <div class="header-actions">
        <button class="icon-button" type="button" data-open="help-dialog" aria-label="Spielregeln">${ICON.help}</button>
        <button class="icon-button" type="button" data-open="stats-dialog" aria-label="Statistik">${ICON.stats}</button>
        <button class="icon-button" type="button" data-open="settings-dialog" aria-label="Einstellungen">${ICON.settings}</button>
      </div>
    </header>

    <nav class="mode-tabs" aria-label="Spielmodus">
      ${tab('daily', 'Tagesrätsel')}${LEVELS.map((key) => tab(key, LEVEL_NAME[key])).join('')}
    </nav>

    <div class="puzzle-info" aria-live="off">
      <span class="puzzle-clock" aria-label="Zeit">${ICON.clock}<strong id="puzzle-time">0:00</strong></span>
      <span id="puzzle-level" class="puzzle-level"></span>
      ${config.counter ? `<span class="puzzle-mistakes">${config.counter.label} <strong id="puzzle-mistakes">0</strong></span>` : '<span></span>'}
    </div>

    <main id="puzzle-main" class="puzzle-main">
      <div id="toasts" class="toasts" role="status" aria-live="polite"></div>
      <div id="sr-status" class="sr-only" aria-live="polite" aria-atomic="true"></div>
      <div id="creating" class="puzzle-creating" hidden>Rätsel wird erstellt …</div>
    </main>
    <div id="puzzle-below" class="puzzle-below"></div>
  </div>
  ${dialog('help-dialog', 'So wird gespielt', config.helpHtml)}
  ${dialog(
    'stats-dialog',
    '',
    `
      <div id="result-section" class="result-section" hidden>
        <p id="result-icon" class="puzzle-result-icon" aria-hidden="true">🎉</p>
        <h2 id="result-title" class="result-title">Gelöst!</h2>
        <p id="result-summary" class="puzzle-result-summary"></p>
        <p id="result-best" class="blitz-best-note" hidden>Neue Bestzeit!</p>
        <div class="result-actions">
          <button id="share-button" class="button" type="button">${ICON.share}<span>Teilen</span></button>
          <button id="next-button" class="button button-secondary" type="button"><span id="next-label"></span>${ICON.next}</button>
        </div>
      </div>
      <div class="dialog-tabs" role="tablist" aria-label="Ansicht">
        <button id="tab-stats" class="dialog-tab" type="button" role="tab" aria-selected="true" aria-controls="panel-stats">Statistik</button>
        <button id="tab-badges" class="dialog-tab" type="button" role="tab" aria-selected="false" aria-controls="panel-badges">Abzeichen <span id="badge-count" class="tab-count"></span></button>
      </div>
      <div id="panel-stats" role="tabpanel" aria-labelledby="tab-stats">
        <div class="stats-head"><h2 id="stats-title">Statistik</h2><span id="stats-mode" class="stats-mode"></span></div>
        <div id="stats-numbers" class="stats-numbers"></div>
        <h3>Bestzeiten</h3>
        <ol id="level-list" class="level-list"></ol>
        <p id="countdown" class="countdown" hidden></p>
      </div>
      <div id="panel-badges" role="tabpanel" aria-labelledby="tab-badges" hidden>
        <div class="badge-summary">
          <p><strong id="badge-summary-count">0</strong> von <span id="badge-summary-total">0</span> Abzeichen</p>
          <div class="meter" aria-hidden="true"><span id="badge-summary-bar"></span></div>
          <p class="badge-tiers"><span class="tier-dot tier-gold"></span><span id="badge-gold">0</span> Gold · <span class="tier-dot tier-silver"></span><span id="badge-silver">0</span> Silber · <span class="tier-dot tier-bronze"></span><span id="badge-bronze">0</span> Bronze</p>
        </div>
        <div id="badge-groups" class="badge-groups"></div>
      </div>
      <button id="stats-ranking" class="button button-secondary stats-ranking" type="button"><span aria-hidden="true">🏆</span> Rangliste</button>`,
  )}
  ${dialog(
    'ranking-dialog',
    'Rangliste',
    `
      <div class="dialog-tabs ranking-tabs" role="tablist" aria-label="Kategorie">
        ${boardTab('daily', 'Heute', true)}${boardTab('times', 'Zeiten', false)}${boardTab('solved', 'Gelöst', false)}
      </div>
      <div id="ranking-levels" class="dialog-tabs ranking-levels" role="tablist" aria-label="Stufe" hidden>
        ${LEVELS.map((key) => levelTab(key, LEVEL_NAME[key], key === 'medium')).join('')}
      </div>
      <p id="ranking-caption" class="ranking-caption"></p>
      <ol id="ranking-list" class="ranking-list" role="tabpanel"></ol>`,
  )}
  <div id="badge-popup" class="badge-popup" role="status" aria-live="polite" hidden>
    <div class="badge-popup-card">
      <span class="badge-popup-label">Neues Abzeichen!</span>
      <span id="badge-popup-icon" class="badge-popup-icon" aria-hidden="true"></span>
      <strong id="badge-popup-title" class="badge-popup-title"></strong>
      <span id="badge-popup-text" class="badge-popup-text"></span>
      <span id="badge-popup-tier" class="badge-popup-tier"></span>
    </div>
  </div>
  ${dialog(
    'settings-dialog',
    'Einstellungen',
    `${
      config.showErrors
        ? `<label class="setting"><span><strong>${config.showErrors.title}</strong><small>${config.showErrors.text} Gilt für dein Profil.</small></span><input id="show-errors" type="checkbox" role="switch"></label>`
        : ''
    }
      <label class="setting"><span><strong>Töne</strong><small>Klänge beim Spielen und bei Sieg. Gilt für dieses Gerät.</small></span><input id="sound-toggle" type="checkbox" role="switch"></label>
      <label class="setting"><span><strong>Hoher Kontrast</strong><small>Kräftigere Farben und Linien. Gilt für dieses Gerät.</small></span><input id="high-contrast" type="checkbox" role="switch"></label>
      <label class="setting"><span><strong>Design</strong><small>Gilt für dieses Gerät.</small></span>
        <select id="theme-select"><option value="system">Wie System</option><option value="light">Hell</option><option value="dark">Dunkel</option></select>
      </label>`,
  )}`;
}

export function createPuzzleShell(config) {
  const SECTION = config.section;
  document.title = config.name;
  document.body.insertAdjacentHTML('afterbegin', pageHtml(config));

  const els = {
    loadScreen: $('load-screen'),
    loadStatus: $('load-status'),
    loadActions: $('load-actions'),
    gameScreen: $('game-screen'),
    switchProfile: $('switch-profile'),
    main: $('puzzle-main'),
    below: $('puzzle-below'),
    creating: $('creating'),
    toasts: $('toasts'),
    srStatus: $('sr-status'),
    time: $('puzzle-time'),
    level: $('puzzle-level'),
    counter: config.counter ? $('puzzle-mistakes') : null,
    statsDialog: $('stats-dialog'),
    rankingDialog: $('ranking-dialog'),
    rankingList: $('ranking-list'),
    rankingLevels: $('ranking-levels'),
    settingsDialog: $('settings-dialog'),
    showErrors: config.showErrors ? $('show-errors') : null,
  };

  const state = {
    profile: null,
    profiles: [], // alle Profile, nur für die Rangliste
    today: berlinDayKey(),
    mode: 'daily', // 'daily' | 'easy' | 'medium' | 'hard'
    clockAt: 0,
    clockTimer: null,
    persistTimer: null,
    revision: 0, // zählt lokale Änderungen, damit ein veralteter Serverstand sie nicht überschreibt
    busy: false, // Sieg wird gefeiert
    creating: false,
    modeToken: 0,
    statsResult: null,
    countdownTimer: null,
    rankingBoard: 'daily',
    rankingLevel: 'medium',
    unseenBadges: new Set(),
  };

  const toast = createToaster(() => els.toasts);
  const sectionData = () => state.profile.data[SECTION];
  const currentGame = () => (state.mode === 'daily' ? sectionData().daily : sectionData().games[state.mode]);
  const modeTitle = (mode) => (mode === 'daily' ? 'Tagesrätsel' : LEVEL_NAME[mode]);
  const isFinished = (game) => (config.isFinished ? config.isFinished(game) : game.status === 'won');

  // ---------- Spiele bereitstellen ----------

  function ensureDaily() {
    const data = sectionData();
    if (!data.daily || data.daily.day !== state.today) data.daily = config.makeDaily(state.today);
  }

  function ensureLevel(level) {
    const data = sectionData();
    if (!data.games[level] || isFinished(data.games[level])) data.games[level] = config.makeLevel(level);
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
    const data = profile.data[SECTION];
    ensureDaily();
    // Abzeichen, die schon verdient waren, still mit dem heutigen Datum nachtragen.
    if (config.unlock(profile.data).length > 0) schedulePersist();

    els.loadScreen.hidden = true;
    els.gameScreen.hidden = false;
    fillAvatar(els.switchProfile.querySelector('.avatar'), profile.name);
    els.switchProfile.querySelector('.profile-chip-name').textContent = profile.name;
    els.switchProfile.setAttribute('aria-label', `${profile.name} – Profil wechseln`);
    document.title = `${config.name} – ${profile.name}`;

    // Erst das Tagesrätsel; ist es erledigt, das angefangene freie Rätsel (sonst „Mittel“).
    let mode = 'daily';
    if (data.daily.status !== 'playing') {
      mode = LEVELS.find((key) => data.games[key] && config.progress(data.games[key]) >= 1000) || 'medium';
    }
    setMode(mode);
    if (mode !== 'daily') toast('Tagesrätsel heute schon erledigt ✓', 2200);
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
    clearToasts();
    if (mode === 'daily') ensureDaily();
    else if (!sectionData().games[mode] || isFinished(sectionData().games[mode])) {
      // Das Erzeugen kann einen Moment dauern: erst „Rätsel wird erstellt …“ zeigen.
      state.creating = true;
      renderAll();
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (token !== state.modeToken) return;
      ensureLevel(mode);
      state.creating = false;
      schedulePersist();
    }
    config.onGameReady?.(currentGame());
    renderAll();
  }

  // Ein neues freies Rätsel der aktuellen Stufe.
  function startNewRound() {
    if (state.mode === 'daily') return;
    delete sectionData().games[state.mode];
    setMode(state.mode);
  }

  // ---------- Zeichnen ----------

  function renderInfo() {
    const game = state.profile && currentGame();
    if (!game) return;
    els.time.textContent = formatTime(game.time);
    if (els.counter) {
      els.counter.textContent = config.counter.value(game);
      els.counter.parentElement.classList.toggle('has-mistakes', Boolean(config.counter.warn?.(game)));
    }
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
    els.creating.hidden = !state.creating;
    renderInfo();
    if (state.profile && currentGame()) config.render();
  }

  // Ein Zug ist geschehen: speichern (verzögert) und neu zeichnen.
  function changed() {
    schedulePersist();
    renderAll();
  }

  // ---------- Sieg und Niederlage ----------

  // Das Spiel wurde gelöst (status ist schon 'won'): Statistik, Serie, Abzeichen, Feier, Ergebnis.
  async function win(game) {
    state.busy = true;
    tickClock();
    const { isBest } = recordSectionWin(sectionData(), game);
    if (game.day) state.profile.data.dayStreak = recordDailyWin(state.profile.data.dayStreak, game.day);
    const unlocked = config.unlock(state.profile.data);
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
    await showBadgePopups(unlocked, { onShow: (badge) => state.unseenBadges.add(badge.id) });
    state.busy = false;
    if (stillHere() && !document.querySelector('dialog[open]')) showStats({ result: { game, isBest } });
  }

  // Das Spiel wurde verloren (status ist schon 'lost'): Uhr stoppt, Stand wird gespeichert.
  function lose(game) {
    tickClock();
    persist();
    renderAll();
    playLose();
    if (config.lostText) toast(config.lostText, 2200);
  }

  // ---------- Statistik, Teilen ----------

  function shareText() {
    const { game } = state.statsResult;
    const label = LEVEL_NAME[game.difficulty].toLowerCase();
    const title = game.day ? `${config.name} #${puzzleNumber(game.day)} (${label})` : `${config.name} (${label})`;
    const extra = config.shareExtra ? config.shareExtra(game) : '';
    const url = `${location.origin}${location.pathname}`;
    return `${title}\n⏱ ${formatTime(game.time)}${extra}\n\n${url}`;
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
    const data = sectionData();
    const game = currentGame();
    const won = game.status === 'won';
    state.statsResult = won ? result || { game, isBest: false } : null;

    $('stats-mode').textContent = modeTitle(state.mode);
    const numbers = $('stats-numbers');
    if (state.mode === 'daily') {
      const daily = data.stats.daily;
      numbers.classList.add('is-three');
      numbers.replaceChildren(
        statBox(daily.won, 'Tage gelöst'),
        statBox(formatTime(daily.bestMs), 'Bestzeit'),
        statBox(formatTime(averageMs(daily)), 'Ø Zeit'),
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
      ...LEVELS.map((key) => {
        const stats = data.stats[key];
        const li = el('li');
        const name = el('strong', '', LEVEL_NAME[key]);
        name.append(el('small', '', ` · ${stats.won} gelöst`));
        li.append(name, el('span', 'level-time', formatTime(stats.bestMs)));
        li.append(el('small', '', stats.won ? `Ø ${formatTime(averageMs(stats))}` : 'noch nicht gelöst'), el('span', 'level-time-label', 'Bestzeit'));
        return li;
      }),
    );

    $('result-section').hidden = !won;
    $('countdown').hidden = !(won && state.mode === 'daily');
    stopCountdown();
    if (won) {
      const { game: finished, isBest } = state.statsResult;
      $('result-title').textContent = 'Gelöst!';
      const extra = config.summaryExtra ? config.summaryExtra(finished) : '';
      $('result-summary').textContent = `${modeTitle(state.mode)} · ${formatTime(finished.time)}${extra}`;
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
    renderBadgePanel(config.achievements(state.profile.data), config.badgeGroups, state.unseenBadges);
  }

  function selectStatsTab(tab) {
    showStatsTab(tab, state.unseenBadges, renderBadges);
  }

  // ---------- Rangliste ----------

  const RANKING_CAPTION = {
    daily: () => `Tagesrätsel #${puzzleNumber(state.today)}: schnellste Zeit zuerst, danach wer noch dran ist.`,
    times: () => 'Bestzeit pro Stufe.',
    solved: () => config.ranking.solvedCaption,
  };

  // Alle Profile; das eigene mit seinem aktuellen, evtl. noch nicht gespeicherten Stand.
  function rankingProfiles() {
    const list = state.profiles.map((p) => (state.profile && p.id === state.profile.id ? state.profile : p));
    if (state.profile && !list.includes(state.profile)) list.push(state.profile);
    return list;
  }

  function rankingRows(board, profiles) {
    if (board === 'daily') {
      const rows = dailyRanking(profiles, state.today, SECTION, config.progress);
      return rows.map((row) => {
        if (row.tier === 0) {
          return { ...row, place: rankOf(rows, row.id, (r) => `${r.tier}:${r.ms}`), value: formatTime(row.ms), sub: `gelöst${config.ranking.solvedExtra ? config.ranking.solvedExtra(row) : ''}` };
        }
        if (row.tier === 1) return { ...row, value: '…', sub: config.ranking.playing(row), empty: true };
        return { ...row, value: '–', sub: 'noch nicht gespielt', empty: true };
      });
    }
    if (board === 'times') {
      const rows = bestTimeRanking(profiles, SECTION, state.rankingLevel);
      return rows.map((row) => ({
        ...row,
        place: row.bestMs != null ? rankOf(rows, row.id, (r) => r.bestMs) : null,
        value: formatTime(row.bestMs),
        sub: row.won ? `${row.won} gelöst` : 'noch nicht gelöst',
        empty: row.bestMs == null,
      }));
    }
    const rows = solvedRanking(profiles, SECTION);
    return rows.map((row) => ({
      ...row,
      place: row.solved > 0 ? rankOf(rows, row.id, (r) => r.solved) : null,
      value: `${config.ranking.icon} ${row.solved}`,
      sub: config.ranking.unit(row.solved),
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
      config.onGameReady?.(currentGame());
      toast('Neues Tagesrätsel!', 2000);
      renderAll();
    }
  }

  // Übernimmt einen Stand vom Server (oder aus einem Konflikt) und zeichnet neu.
  function applyProfileUpdate(beforeId) {
    ensureDaily();
    if (state.mode !== 'daily' && !sectionData().games[state.mode]) ensureLevel(state.mode);
    // Ein anderes Rätsel als vorher: Auswahl und Ähnliches zurücksetzen.
    if (currentGame().id !== beforeId) config.onGameReady?.(currentGame());
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
      themeSelect: $('theme-select'),
      highContrast: $('high-contrast'),
      soundToggle: $('sound-toggle'),
    });
    const openSettings = () => {
      if (els.showErrors) els.showErrors.checked = sectionData().settings.showErrors !== false;
      openBaseSettings();
    };
    els.showErrors?.addEventListener('change', () => {
      sectionData().settings.showErrors = els.showErrors.checked;
      schedulePersist();
      renderAll();
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
        if (tab.dataset.mode !== state.mode) setMode(tab.dataset.mode);
      });
    }

    // Solange ein neues Abzeichen gezeigt wird, schließen Enter, Leertaste und Escape die Meldung.
    document.addEventListener(
      'keydown',
      (event) => {
        if (!isBadgePopupOpen()) return;
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!event.repeat) advanceBadgePopup();
        }
      },
      true,
    );

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

  bindEvents();

  return {
    state,
    els,
    toast,
    sectionData,
    currentGame,
    // Ein Zug ist nur möglich, wenn das Spiel läuft und nichts anderes gerade passiert.
    canPlay: () => Boolean(state.profile) && !state.busy && !state.creating && currentGame()?.status === 'playing' && !document.querySelector('dialog[open]') && !isBadgePopupOpen(),
    renderAll,
    changed,
    persist,
    schedulePersist,
    tickClock,
    win,
    lose,
    showStats,
    startNewRound,
    nextRound,
    start: loadAndStart,
  };
}
