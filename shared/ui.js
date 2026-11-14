// Kleine Helfer für die Oberfläche, die alle Spiele brauchen.

export const $ = (id) => document.getElementById(id);

export function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const AVATAR_COLOR_COUNT = 6;

function nameHash(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return hash;
}

// Jeder Name bekommt eine feste Farbe aus der Palette und eine leichte, verspielte Drehung.
export function fillAvatar(node, name) {
  const hash = nameHash(name);
  node.textContent = Array.from(name)[0] || '?';
  node.style.setProperty('--avatar', `var(--avatar-${(hash % AVATAR_COLOR_COUNT) + 1})`);
  node.style.setProperty('--r', `${(hash % 11) - 5}deg`);
}

export function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

export function closeAllDialogs() {
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
}

// Meldungen erscheinen im offenen Dialog, sonst im Standardbereich der Seite (defaultHost()).
export function createToaster(defaultHost) {
  return function toast(message, duration = 1500) {
    const host = document.querySelector('dialog[open] .toasts') || defaultHost();
    const node = el('div', 'toast', message);
    host.prepend(node);
    if (duration > 0) {
      setTimeout(() => {
        node.classList.add('is-hiding');
        setTimeout(() => node.remove(), 350);
      }, duration);
    }
    return node;
  };
}

export function clearToasts() {
  for (const host of document.querySelectorAll('.toasts')) host.replaceChildren();
}

// Dialoge schließen: Antippen des abgedunkelten Hintergrunds, Schließen-Knöpfe, Meldungen aufräumen.
export function bindDialogs() {
  for (const dialog of document.querySelectorAll('dialog')) {
    // Nur schließen, wenn der Klick auf dem Hintergrund begonnen hat (nicht beim Markieren von Text).
    let pressedOnBackdrop = false;
    dialog.addEventListener('pointerdown', (event) => {
      pressedOnBackdrop = event.target === dialog;
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog && pressedOnBackdrop) dialog.close();
      pressedOnBackdrop = false;
    });
    for (const close of dialog.querySelectorAll('[data-close]')) {
      close.addEventListener('click', () => dialog.close());
    }
    dialog.addEventListener('close', () => dialog.querySelector('.toasts')?.replaceChildren());
  }
}

// Ergebnis teilen: auf dem Handy über das Teilen-Menü, sonst in die Zwischenablage.
export async function shareResult(text, toast, fallbackHost) {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('In die Zwischenablage kopiert');
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    fallbackHost.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    toast(ok ? 'In die Zwischenablage kopiert' : 'Kopieren nicht möglich');
  }
}
