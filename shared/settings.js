// Einstellungen, die für alle Spiele auf diesem Gerät gelten: Design, Kontrast, Töne.

import { isSoundEnabled, setSoundEnabled, playTap } from './sound.js';
import { openDialog } from './ui.js';

export const THEME_KEY = 'wordle-de:theme';
export const CONTRAST_KEY = 'wordle-de:contrast';

export function readSetting(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Privater Modus o. Ä.: Einstellung gilt dann nur bis zum Neuladen.
  }
}

export function syncThemeColor() {
  const theme = document.documentElement.dataset.theme;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const dark = theme === 'dark' || (!theme && meta.media.includes('dark'));
    meta.content = dark ? '#221921' : '#fff8f0';
  }
}

export function applyTheme(value) {
  if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value;
  else delete document.documentElement.dataset.theme;
  syncThemeColor();
}

// Verdrahtet den Einstellungs-Dialog. Gibt eine Funktion zurück, die ihn mit dem aktuellen Stand öffnet.
export function initSettings({ dialog, themeSelect, highContrast, soundToggle }) {
  soundToggle.addEventListener('change', () => {
    setSoundEnabled(soundToggle.checked);
    // Kurzer Klick als Probe, damit man sofort hört, ob die Töne an sind.
    if (soundToggle.checked) playTap();
  });
  highContrast.addEventListener('change', () => {
    if (highContrast.checked) document.documentElement.dataset.contrast = 'high';
    else delete document.documentElement.dataset.contrast;
    writeSetting(CONTRAST_KEY, highContrast.checked ? '1' : null);
  });
  themeSelect.addEventListener('change', () => {
    const value = themeSelect.value;
    applyTheme(value);
    writeSetting(THEME_KEY, value === 'system' ? null : value);
  });
  syncThemeColor();
  return function open() {
    soundToggle.checked = isSoundEnabled();
    highContrast.checked = document.documentElement.dataset.contrast === 'high';
    themeSelect.value = document.documentElement.dataset.theme || 'system';
    openDialog(dialog);
  };
}
