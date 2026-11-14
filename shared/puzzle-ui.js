// Anzeige-Bausteine für Rätselspiele: Abzeichen-Ansicht, Statistik-Reiter, Ranglisten-Zeilen.
// Erwartet im Dokument die Elemente der Statistik- und Rangliste-Dialoge (siehe sudoku/index.html).

import { $, el, fillAvatar } from './ui.js';
import { TIER_LABEL } from './badge-popup.js';

export const MEDALS = ['🥇', '🥈', '🥉'];

export function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Ein Abzeichen: erreicht mit Stufe und Datum, sonst mit Fortschrittsbalken. unseen: Kennungen mit „Neu“-Marke.
export function badgeItem(badge, unseen) {
  const li = el('li', badge.earned ? 'badge is-earned' : 'badge');
  li.dataset.tier = badge.tier;
  const medal = el('span', 'badge-medal', badge.icon);
  medal.setAttribute('aria-hidden', 'true');
  li.append(medal, el('span', 'badge-title', badge.title), el('span', 'badge-text', badge.text));
  if (badge.earned) {
    const date = badge.earnedAt ? formatDate(badge.earnedAt) : '';
    li.append(el('span', 'badge-date', date ? `${TIER_LABEL[badge.tier]} · ${date}` : TIER_LABEL[badge.tier]));
    if (unseen.has(badge.id)) li.append(el('span', 'badge-new', 'Neu'));
    li.append(el('span', 'sr-only', 'erreicht'));
  } else {
    const progress = el('div', 'badge-progress');
    if (badge.target > 1) {
      const meter = el('div', 'meter');
      meter.setAttribute('aria-hidden', 'true');
      const fill = el('span');
      fill.style.width = `${(badge.progress / badge.target) * 100}%`;
      meter.append(fill);
      progress.append(meter, el('small', '', `${badge.progress} / ${badge.target}`));
    } else {
      progress.append(el('small', '', 'Noch offen'));
    }
    li.append(progress, el('span', 'sr-only', `noch nicht erreicht, ${badge.progress} von ${badge.target}`));
  }
  return li;
}

// Abzeichen-Reiter: Übersicht nach Stufen und die Abzeichen nach Themen (groups: [{ title, ids }]).
export function renderBadgePanel(list, groups, unseen) {
  const earned = list.filter((a) => a.earned);
  const tierCount = (tier) => earned.filter((a) => a.tier === tier).length;
  $('badge-count').textContent = `${earned.length}/${list.length}`;
  $('badge-count').classList.toggle('has-new', unseen.size > 0);
  $('badge-summary-count').textContent = earned.length;
  $('badge-summary-total').textContent = list.length;
  $('badge-summary-bar').style.width = `${(earned.length / list.length) * 100}%`;
  $('badge-gold').textContent = tierCount('gold');
  $('badge-silver').textContent = tierCount('silver');
  $('badge-bronze').textContent = tierCount('bronze');
  $('badge-groups').replaceChildren(
    ...groups.map((group) => {
      const items = group.ids.map((id) => list.find((a) => a.id === id)).filter(Boolean);
      const section = el('section', 'badge-group');
      const heading = el('h3', '', group.title);
      heading.append(el('span', 'badge-group-count', `${items.filter((a) => a.earned).length}/${items.length}`));
      const grid = el('ul', 'badge-grid');
      grid.append(...items.map((badge) => badgeItem(badge, unseen)));
      section.append(heading, grid);
      return section;
    }),
  );
}

// Schaltet zwischen „Statistik“ und „Abzeichen“ um. Ergebnis: der gewählte Reiter.
export function showStatsTab(tab, unseen, renderBadges) {
  const badges = tab === 'badges';
  $('tab-stats').setAttribute('aria-selected', String(!badges));
  $('tab-badges').setAttribute('aria-selected', String(badges));
  $('panel-stats').hidden = badges;
  $('panel-badges').hidden = !badges;
  if (badges) {
    renderBadges();
    // Einmal angesehen, sind die neuen Abzeichen beim nächsten Mal nicht mehr „neu“.
    unseen.clear();
    $('badge-count').classList.remove('has-new');
  }
  return badges ? 'badges' : 'stats';
}

// Zeichnet die Zeilen einer Rangliste: Platz (Medaille), Avatar, Name mit Zeile darunter, Wert.
// rows: { id, name, place, value, sub, empty }. ownId: das eigene Profil wird hervorgehoben.
export function renderRankingRows(listEl, rows, ownId) {
  if (rows.length === 0) {
    listEl.replaceChildren(el('li', 'ranking-row is-empty', 'Noch keine Profile.'));
    return;
  }
  listEl.replaceChildren(
    ...rows.map((row) => {
      const li = el('li', 'ranking-row');
      li.classList.toggle('is-me', row.id === ownId);
      li.classList.toggle('is-empty', Boolean(row.empty));
      const place = el('span', 'ranking-place', row.place ? MEDALS[row.place - 1] || `${row.place}.` : '–');
      place.classList.toggle('is-medal', Boolean(row.place && row.place <= MEDALS.length));
      place.setAttribute('aria-label', row.place ? `Platz ${row.place}` : 'ohne Platz');
      const avatar = el('span', 'avatar');
      avatar.setAttribute('aria-hidden', 'true');
      fillAvatar(avatar, row.name);
      const who = el('span', 'ranking-who');
      who.append(el('span', 'ranking-name', row.name), el('span', 'ranking-sub', row.sub));
      li.append(place, avatar, who, el('span', 'ranking-value', row.value));
      return li;
    }),
  );
}

// Eine Zahl-Kachel für die Statistik (Wert groß, Beschriftung klein).
export function statBox(value, label) {
  const box = el('div');
  box.append(el('strong', '', value), el('span', '', label));
  return box;
}
