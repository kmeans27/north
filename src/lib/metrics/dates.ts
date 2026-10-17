/* src/lib/metrics/dates.ts
   Date maths with no dependency (03-scoring.md §6: "no date library").
   Calendar dates are plain `YYYY-MM-DD` strings with no timezone; every
   calculation below is DST-free and testable across year boundaries. */

/** A calendar date with no time or timezone: the unit every write is keyed by. */
export interface CalendarDate {
  year: number;
  month: number; // 1–12
  day: number;   // 1–31
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse `YYYY-MM-DD` into its parts. Throws on malformed input. */
export function parseISODate(iso: string): CalendarDate {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid date: ${iso}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date: ${iso}`);
  }
  return { year, month, day };
}

/** Format a local `Date` as `YYYY-MM-DD` using its local calendar fields. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/**
 * Add (or subtract) whole days to a calendar date.
 * Pure calendar arithmetic: no DST, no timezone, no library.
 */
export function addDays(iso: string, days: number): string {
  const { year, month, day } = parseISODate(iso);
  const t = Date.UTC(year, month - 1, day) + days * 86_400_000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Weekday index for a calendar date: 0 = Sunday … 6 = Saturday. */
export function weekdayIndex(iso: string): number {
  const { year, month, day } = parseISODate(iso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** `YYYY-MM` for a calendar date. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Milliseconds at local midnight for a calendar date, for deterministic timestamps. */
export function localMidnightEpoch(iso: string): number {
  const { year, month, day } = parseISODate(iso);
  return new Date(year, month - 1, day).getTime();
}

/* ─── Logical date (03-scoring.md §6) ─────────────────────────────────────── */

/**
 * The date a write belongs to. Before the cutoff hour, the day you just lived
 * is still the current logical date (D15: logging at 00:30 belongs to yesterday).
 *
 * @param now        the instant to classify
 * @param cutoffHour 0–23, defaults to settings.dayCutoffHour (4)
 * @param tz         IANA zone; defaults to the runtime's zone
 */
export function logicalDate(now: Date, cutoffHour = 4, tz?: string): string {
  const zone = tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Missing ${type} in formatted date`);
    return Number(part.value);
  };

  const iso = `${get('year')}-${pad(get('month'))}-${pad(get('day'))}`;
  return get('hour') < cutoffHour ? addDays(iso, -1) : iso;
}

/* ─── Week and month keys (03-scoring.md §6) ──────────────────────────────── */

/** ISO-8601 week number of the week containing `iso` (Monday-based, 1–53). */
export function isoWeekNumber(iso: string): number {
  const { year, month, day } = parseISODate(iso);
  const date = new Date(Date.UTC(year, month - 1, day));

  // ISO weeks are anchored on the Thursday: the week containing Jan 1 belongs
  // to the year that owns its Thursday.
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(date.getTime());
  thursday.setUTCDate(thursday.getUTCDate() - mondayOffset + 3);

  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstOffset = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstOffset + 3);

  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/**
 * `YYYY-Www` for the week containing `iso`, shifted so the week starts on
 * `weekStartsOn` (0 = Sunday, 1 = Monday). Computed from the ISO week of the
 * week's Thursday, per 03-scoring.md §6.
 */
export function weekKey(iso: string, weekStartsOn: 0 | 1 = 1): string {
  const weekday = weekdayIndex(iso);
  const startOffset = (weekday - weekStartsOn + 7) % 7;
  const thursday = addDays(iso, -startOffset + 3);
  const { year } = parseISODate(thursday);
  return `${year}-W${pad(isoWeekNumber(thursday))}`;
}

/** `YYYY-MM` for a calendar date. */
export function monthKey(iso: string): string {
  parseISODate(iso);
  return iso.slice(0, 7);
}

/* ─── Formatting and parsing ──────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long' });
const SHORT_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short'
});

function utcDate(iso: string): Date {
  const { year, month, day } = parseISODate(iso);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Format a calendar date in English, with no timezone drift.
 * - `long`:   Thursday, 17 October
 * - `medium`: 17 October
 * - `short`:  17 Oct
 */
export function formatDate(iso: string, style: 'long' | 'medium' | 'short' = 'long'): string {
  const date = utcDate(iso);
  if (style === 'long') return `${WEEKDAY.format(date)}, ${DAY_MONTH.format(date)}`;
  if (style === 'medium') return DAY_MONTH.format(date);
  return SHORT_DATE.format(date);
}

/** Validate a `?d=` value. Returns the canonical date or null when malformed. */
export function parseDate(input: string | null | undefined): string | null {
  if (!input || !ISO_RE.test(input)) return null;
  try {
    parseISODate(input);
    return input;
  } catch {
    return null;
  }
}

/** Whole days from `from` to `to` (positive when `to` is later). DST-free. */
export function diffDays(from: string, to: string): number {
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / DAY_MS);
}

/** The first day of the week containing `iso`, honouring `weekStartsOn`. */
export function startOfWeek(iso: string, weekStartsOn: 0 | 1 = 1): string {
  const offset = (weekdayIndex(iso) - weekStartsOn + 7) % 7;
  return addDays(iso, -offset);
}

const MONTH_LONG = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long' });

/**
 * A date range in English: `8–14 October` inside one month, `28 Sep – 4 Oct`
 * across two. Used by the Record insight card (02-metrics.md §6).
 */
export function formatDateRange(start: string, end: string): string {
  const a = utcDate(start);
  const b = utcDate(end);
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTH_LONG.format(b)}`;
  }
  return `${SHORT_DATE.format(a)} – ${SHORT_DATE.format(b)}`;
}
