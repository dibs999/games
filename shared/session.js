// Welches Profil gerade spielt: wird beim Wählen in der Startseite gemerkt und von jedem Spiel geladen.

import { fetchProfile, flushPending, hasPendingSave, pendingData, setActiveProfile } from './store.js';

const LAST_PROFILE_KEY = 'wordle-de:last-profile';
const META_PREFIX = 'wordle-de:profile-meta:';

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Privater Modus o. Ä.
  }
}

export function lastProfileId() {
  return read(LAST_PROFILE_KEY);
}

export function rememberProfile(id) {
  write(LAST_PROFILE_KEY, id);
}

// Name und Serverstand für den Fall, dass die Seite offline geöffnet wird, aber noch Spielstände vorgemerkt sind.
function readMeta(id) {
  try {
    return JSON.parse(read(META_PREFIX + id));
  } catch {
    return null;
  }
}

function adopt(profile) {
  setActiveProfile(profile);
  rememberProfile(profile.id);
  return profile;
}

// Lädt ein Profil für ein Spiel: erst Wartendes hochladen, dann frisch vom Server holen und
// noch nicht hochgeladene Runden dieses Geräts darüberlegen.
// Ergebnis: das Profil, oder null, wenn es nicht mehr existiert. Wirft, wenn es nicht erreichbar ist.
export async function loadProfile(id) {
  await flushPending(id).catch(() => null);
  let profile;
  try {
    profile = await fetchProfile(id);
  } catch (error) {
    // Offline: nur mit noch nicht hochgeladenen Runden weiterspielen, sonst fehlt der Stand.
    const meta = readMeta(id);
    const pending = hasPendingSave(id) ? pendingData(id) : null;
    if (!meta || !pending) throw error;
    return adopt({ id, name: meta.name, updatedAt: meta.updatedAt, data: pending });
  }
  if (!profile) return null;
  write(META_PREFIX + id, JSON.stringify({ name: profile.name, updatedAt: profile.updatedAt }));
  const pending = pendingData(id);
  if (pending) profile.data = pending;
  return adopt(profile);
}
