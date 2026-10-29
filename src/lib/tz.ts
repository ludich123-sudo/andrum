// Tidszonshjälp utan beroenden. All tid lagras i UTC och visas i studions tidszon.

export type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 1 = måndag … 7 = söndag
};

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    partsCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function getParts(date: Date, tz: string): Parts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    weekday: WEEKDAYS[out.weekday] ?? 1,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' för ett ögonblick i given tidszon. */
export function toDateKey(date: Date, tz: string): string {
  const p = getParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 'HH:MM' för ett ögonblick i given tidszon. */
export function toTimeKey(date: Date, tz: string): string {
  const p = getParts(date, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Lokal datum + tid i tidszonen → UTC-ögonblick. Hanterar sommartid. */
export function zonedToUtc(dateKey: string, timeKey: string, tz: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = timeKey.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, hh, mm);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = getParts(new Date(guess), tz);
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = target - asIfUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

export function addDaysKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Veckodag (1 = mån) för ett datum-nyckel. */
export function weekdayOfKey(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Måndagen i veckan för ett datum-nyckel. */
export function mondayOfKey(dateKey: string): string {
  return addDaysKey(dateKey, 1 - weekdayOfKey(dateKey));
}

export function minutesOfTimeKey(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ---------- Visning på svenska ----------

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions) {
  const key = tz + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

/** "tisdag 4 november" */
export function formatDay(date: Date, tz: string): string {
  return fmt(tz, { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

/** "tis 4 nov" */
export function formatDayShort(date: Date, tz: string): string {
  return fmt(tz, { weekday: 'short', day: 'numeric', month: 'short' }).format(date).replace(/\./g, '');
}

/** "18:00" */
export function formatTime(date: Date, tz: string): string {
  return toTimeKey(date, tz);
}

/** "tisdag 4 november kl. 18:00" */
export function formatDateTime(date: Date, tz: string): string {
  return `${formatDay(date, tz)} kl. ${formatTime(date, tz)}`;
}

/** "tisdagar" */
export function weekdayPlural(date: Date, tz: string): string {
  const day = fmt(tz, { weekday: 'long' }).format(date);
  return day.endsWith('dag') ? day + 'ar' : day;
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
