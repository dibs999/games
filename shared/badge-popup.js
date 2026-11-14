// Große Meldung „Neues Abzeichen!“ mit Klang und Konfetti in der Farbe der Stufe (für alle Spiele).
// Erwartet im Dokument das Element #badge-popup (siehe die HTML-Seiten der Spiele).

import { playBadge } from './sound.js';
import { burstConfetti } from './fx.js';
import { $ } from './ui.js';

export const TIER_LABEL = { bronze: 'Bronze', silver: 'Silber', gold: 'Gold' };
const TIER_CONFETTI = {
  bronze: ['#c27a3b', '#e0a46b', '#8a4f22', '#f3c99d'],
  silver: ['#9aa4ae', '#d7dde2', '#ffffff', '#6f7c88'],
  gold: ['#e3a90c', '#ffd23f', '#fff3b0', '#c98a00'],
};
const BADGE_POPUP_MS = 3600;

let current = null;

// Zeigt neue Abzeichen nacheinander. Schließt sich von selbst, per Klick oder mit Enter, Leertaste, Escape.
// Ergebnis: Promise, das endet, wenn alle gezeigt wurden. onShow(badge) wird je Abzeichen aufgerufen.
export function showBadgePopups(list, { onShow = null } = {}) {
  const popupEl = $('badge-popup');
  if (!list.length || !popupEl) return Promise.resolve();
  return new Promise((resolve) => {
    const popup = { queue: [...list], timer: null, next: null };
    popup.next = () => {
      clearTimeout(popup.timer);
      const badge = popup.queue.shift();
      if (!badge) {
        popupEl.hidden = true;
        if (current === popup) current = null;
        resolve();
        return;
      }
      popupEl.dataset.tier = badge.tier;
      $('badge-popup-icon').textContent = badge.icon;
      $('badge-popup-title').textContent = badge.title;
      $('badge-popup-text').textContent = badge.text;
      $('badge-popup-tier').textContent = TIER_LABEL[badge.tier];
      popupEl.hidden = false;
      // Animation für jedes Abzeichen neu starten.
      for (const node of [popupEl.firstElementChild, $('badge-popup-icon')]) {
        node.style.animation = 'none';
        void node.offsetWidth;
        node.style.animation = '';
      }
      onShow?.(badge);
      playBadge(badge.tier);
      burstConfetti({
        kind: 'burst',
        count: badge.tier === 'gold' ? 110 : 70,
        origin: { x: 0.5, y: 0.4 },
        colors: TIER_CONFETTI[badge.tier],
        power: 12,
      });
      popup.timer = setTimeout(popup.next, BADGE_POPUP_MS);
    };
    current = popup;
    popup.next();
  });
}

export function isBadgePopupOpen() {
  return current !== null;
}

export function advanceBadgePopup() {
  current?.next();
}

export function dismissBadgePopups() {
  if (!current) return;
  current.queue.length = 0;
  current.next();
}

// Antippen schließt die Meldung (einmal pro Seite aufrufen).
export function initBadgePopup() {
  $('badge-popup')?.addEventListener('click', advanceBadgePopup);
}
