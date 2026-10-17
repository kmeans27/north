/* src/lib/metrics/dates.ts
   Date maths with no dependency (03-scoring.md §6: "no date library").

   M0 needs only calendar helpers for the demo seed. logicalDate, weekKey,
   monthKey, formatDate and parseDate land in M1 together with the full test
   table from 03-scoring.md §8.4. */

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
