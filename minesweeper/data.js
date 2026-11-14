// Minensucher-Daten im Profil (Abschnitt "minesweeper"): laufende Bretter, Statistik, Abzeichen.
//
// Ein Spiel speichert das Brett (Minen als Text, Startfeld) und den Stand (aufgedeckt, Flaggen).
// mistakes zählt Fehlversuche: jedes Mal, wenn man nach einem Treffer neu beginnt.

import { createSection, achievementStatus, unlockFrom, totalSolved } from '../shared/puzzle-stats.js';
import { DIFFICULTIES, DIFFICULTY_KEYS, neighbors, countsOf, mineCount, initialView, openedCount, openFrom } from './logic.js';

// ---------- Spiel ----------

export function newGame({ w, h, mines, start, difficulty }, id) {
  const view = initialView(mines, w, h, start);
  return { id, difficulty, w, h, mines, start, base: openedCount(view), view, boom: null, time: 0, mistakes: 0, status: 'playing' };
}

export function randomGameId() {
  return Math.floor(Math.random() * 2 ** 40).toString(36);
}

const safeTotal = (game) => game.w * game.h - mineCount(game.mines);

export const flagCount = (game) => [...game.view].filter((ch) => ch === 'f').length;
export const minesLeft = (game) => mineCount(game.mines) - flagCount(game);

// Deckt ein Feld auf. Ein aufgedecktes Feld mit Zahl deckt seine Nachbarn auf, wenn genauso viele Flaggen
// daneben stehen (wie viele Minen angrenzen). Trifft man eine Mine, ist das Spiel verloren.
// Ergebnis: false, wenn nichts passiert ist.
export function openCell(game, i) {
  if (game.status !== 'playing') return false;
  const { w, h, mines } = game;
  const view = [...game.view];
  const targets = [];
  if (view[i] === 'u') targets.push(i);
  else if (view[i] === 'o') {
    const around = neighbors(i, w, h);
    const count = countsOf(mines, w, h)[i];
    if (count === 0 || around.filter((n) => view[n] === 'f').length !== count) return false;
    for (const n of around) if (view[n] === 'u') targets.push(n);
    if (targets.length === 0) return false;
  } else return false;

  let boom = null;
  for (const n of targets) {
    if (mines[n] === '1') {
      boom ??= n;
      view[n] = 'o';
    } else openFrom(view, mines, w, h, n);
  }
  game.view = view.join('');
  if (boom != null) {
    game.status = 'lost';
    game.boom = boom;
  } else if (openedCount(game.view) === safeTotal(game)) {
    game.status = 'won';
  }
  return true;
}

export function toggleFlag(game, i) {
  if (game.status !== 'playing') return false;
  const ch = game.view[i];
  if (ch !== 'u' && ch !== 'f') return false;
  game.view = game.view.slice(0, i) + (ch === 'u' ? 'f' : 'u') + game.view.slice(i + 1);
  return true;
}

// Nach einem Treffer dasselbe Brett nochmal versuchen (zählt als Fehlversuch, die Zeit beginnt neu).
export function retry(game) {
  if (game.status !== 'lost') return false;
  game.view = initialView(game.mines, game.w, game.h, game.start);
  game.boom = null;
  game.status = 'playing';
  game.time = 0;
  game.mistakes += 1;
  return true;
}

// Wie weit ein Spiel ist: gelöst vor allem, sonst die Zahl der zusätzlich aufgedeckten Felder (und die Zeit).
export function gameProgress(game) {
  if (!game) return -1;
  if (game.status === 'won') return 1_000_000;
  if (game.status === 'lost') return 500_000;
  return Math.max(0, openedCount(game.view) - game.base) * 1000 + Math.min(999, Math.floor(game.time / 1000));
}

function normalizeGame(game, daily) {
  if (!game || typeof game !== 'object') return null;
  const spec = DIFFICULTIES[game.difficulty];
  if (!spec || game.w !== spec.w || game.h !== spec.h) return null;
  if (daily && typeof game.day !== 'string') return null;
  const total = spec.w * spec.h;
  if (typeof game.mines !== 'string' || game.mines.length !== total || !/^[01]+$/.test(game.mines) || mineCount(game.mines) !== spec.mines) return null;
  if (typeof game.view !== 'string' || game.view.length !== total || !/^[uof]+$/.test(game.view)) return null;
  if (!Number.isInteger(game.start) || game.start < 0 || game.start >= total || game.mines[game.start] === '1') return null;
  const status = ['won', 'lost'].includes(game.status) ? game.status : 'playing';
  for (let i = 0; i < total; i++) {
    // Eine aufgedeckte Mine gibt es nur nach einem Treffer, eine Flagge nur auf verdeckten Feldern.
    if (game.view[i] === 'o' && game.mines[i] === '1' && status !== 'lost') return null;
  }
  const boom = Number.isInteger(game.boom) && game.boom >= 0 && game.boom < total && game.mines[game.boom] === '1' ? game.boom : null;
  return {
    ...game,
    id: String(game.id ?? ''),
    base: Math.max(0, Math.round(Number(game.base)) || openedCount(initialView(game.mines, spec.w, spec.h, game.start))),
    boom: status === 'lost' ? boom : null,
    time: Number(game.time) > 0 ? Math.round(Number(game.time)) : 0,
    mistakes: Number(game.mistakes) > 0 ? Math.round(Number(game.mistakes)) : 0,
    status,
  };
}

export const section = createSection({ normalizeGame, progress: gameProgress });
export const emptyMinesweeperData = section.empty;
export const normalizeMinesweeperData = section.normalize;
export const mergeMinesweeperData = section.merge;
export const reuseUnchangedMinesweeper = section.reuse;

// ---------- Abzeichen ----------

const solved = (d) => totalSolved(d.minesweeper.stats);

export const MINESWEEPER_ACHIEVEMENTS = [
  { id: 'mine-first', tier: 'bronze', icon: '🚩', title: 'Erstes Feld geräumt', text: 'Ein Minenfeld geräumt.', target: 1, value: solved },
  { id: 'mine-10', tier: 'bronze', icon: '💣', title: 'Minenräumer', text: '10 Minenfelder geräumt.', target: 10, value: solved },
  { id: 'mine-50', tier: 'silver', icon: '🧯', title: 'Kampfmittelprofi', text: '50 Minenfelder geräumt.', target: 50, value: solved },
  { id: 'mine-200', tier: 'gold', icon: '🏆', title: 'Minenmeister', text: '200 Minenfelder geräumt.', target: 200, value: solved },
  { id: 'mine-medium', tier: 'bronze', icon: '🔎', title: 'Mit Fingerspitzengefühl', text: 'Ein mittleres Minenfeld geräumt.', target: 1, value: (d) => d.minesweeper.stats.medium.won },
  { id: 'mine-hard', tier: 'silver', icon: '☢️', title: 'Nerven aus Stahl', text: 'Ein schweres Minenfeld geräumt.', target: 1, value: (d) => d.minesweeper.stats.hard.won },
  { id: 'mine-hard-10', tier: 'gold', icon: '🔥', title: 'Entschärfungsexperte', text: '10 schwere Minenfelder geräumt.', target: 10, value: (d) => d.minesweeper.stats.hard.won },
  { id: 'mine-flawless', tier: 'silver', icon: '💯', title: 'Ohne Knall', text: 'Ein mittleres oder schweres Minenfeld ohne Fehlversuch geräumt.', target: 1, value: (d) => d.minesweeper.flawless },
  { id: 'mine-daily-10', tier: 'silver', icon: '📅', title: 'Täglich im Einsatz', text: '10 Tagesrätsel des Minensuchers gelöst.', target: 10, value: (d) => d.minesweeper.stats.daily.won },
  { id: 'mine-fast', tier: 'silver', icon: '⚡', title: 'Blitzentschärfer', text: 'Ein leichtes Minenfeld in unter 45 Sekunden geräumt.', target: 1, value: (d) => (d.minesweeper.stats.easy.bestMs != null && d.minesweeper.stats.easy.bestMs <= 45_000 ? 1 : 0) },
];

export const BADGE_GROUPS = [
  { title: 'Geräumte Felder', ids: ['mine-first', 'mine-10', 'mine-50', 'mine-200'] },
  { title: 'Stufen', ids: ['mine-medium', 'mine-hard', 'mine-hard-10'] },
  { title: 'Können und Treue', ids: ['mine-flawless', 'mine-fast', 'mine-daily-10'] },
];

export const minesweeperAchievements = (data) => achievementStatus(MINESWEEPER_ACHIEVEMENTS, data, 'minesweeper');
export const unlockMinesweeperAchievements = (data, now) => unlockFrom(MINESWEEPER_ACHIEVEMENTS, data, 'minesweeper', now);

export { DIFFICULTY_KEYS };
