// Kalendertage für die Tagesrätsel aller Spiele (gemeinsam, damit alle zur selben Zeit wechseln).

const EPOCH_UTC = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;

// Kalendertag in Deutschland als "JJJJ-MM-TT", damit alle um Mitternacht (MEZ/MESZ) ein neues Rätsel bekommen.
export function berlinDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function dayKeyToUtc(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function dayNumber(dayKey) {
  return Math.round((dayKeyToUtc(dayKey) - EPOCH_UTC) / DAY_MS);
}

export function shiftDayKey(dayKey, days) {
  return new Date(dayKeyToUtc(dayKey) + days * DAY_MS).toISOString().slice(0, 10);
}

export function puzzleNumber(dayKey) {
  return dayNumber(dayKey) + 1;
}

// Wochentag eines Kalendertags: 0 = Montag … 6 = Sonntag.
export function weekday(dayKey) {
  return (new Date(dayKeyToUtc(dayKey)).getUTCDay() + 6) % 7;
}

// Sekunden bis Mitternacht deutscher Zeit.
export function secondsUntilBerlinMidnight(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return Math.max(0, 86_400 - (get('hour') * 3600 + get('minute') * 60 + get('second')));
}
