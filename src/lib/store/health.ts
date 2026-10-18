/* src/lib/store/health.ts — the hand path for Apple Health (docs/V2.1.md §6).
 *
 * The contract is `north.health.v1`, one JSON file, and it is deliberately the
 * same file a future iOS app would write. Nothing here talks to a server: the
 * file is chosen in the browser, parsed, previewed and written to IndexedDB.
 *
 * Three rules it keeps, and the tests hold it to them:
 *   - **A missing day stays a gap.** The importer writes the days the file
 *     mentions and never fills another one, so a silent interpolation can never
 *     flatter the history.
 *   - **A manual value always wins.** Anything a human typed carries `locked`
 *     and is reported back as kept, not overwritten.
 *   - **Device metrics only.** Sleep, steps, gym sessions, daylight and weight —
 *     exactly the registry's `autoField` inputs. Nothing you tap by hand.
 *
 * Everything pure lives here; `session.svelte.ts` is the only writer.
 */

import type { Day, DayValue, MetricId, Value } from '../metrics/types';

export const HEALTH_FORMAT = 'north.health.v1';

export interface HealthDay {
  date: string;
  sleepHours?: number;
  sleepStart?: string;
  steps?: number;
  strengthSessions?: number;
  daylightMinutes?: number;
  weightKg?: number;
}

export interface HealthFile {
  format: string;
  generated: string | null;
  source: string | null;
  /** Oldest first, after parsing. */
  days: HealthDay[];
}

export type HealthFieldName = keyof Omit<HealthDay, 'date'>;

/**
 * One thing the file knows how to set. `value` is a metric row you can also tap
 * in the app; `extra` is a raw device input that the derived metrics read (the
 * registry's `extras`), so it is never a metric id.
 */
export interface HealthSlot {
  kind: 'value' | 'extra';
  /** The metric id, or the `extras` key. */
  key: string;
  field: HealthFieldName;
  label: string;
  /** The narrowest range that is still physically possible; outside is refused. */
  min: number;
  max: number;
  integer?: boolean;
}

/** Field → where it lands. Order is the order the preview lists. */
export const HEALTH_SLOTS: readonly HealthSlot[] = [
  { kind: 'value', key: 'sleep_hours', field: 'sleepHours', label: 'Sleep', min: 0, max: 24 },
  { kind: 'extra', key: 'sleepStart', field: 'sleepStart', label: 'Sleep start', min: 0, max: 0 },
  { kind: 'value', key: 'steps', field: 'steps', label: 'Steps', min: 0, max: 200000, integer: true },
  {
    kind: 'value',
    key: 'strength_sessions',
    field: 'strengthSessions',
    label: 'Gym sessions',
    min: 0,
    max: 10,
    integer: true
  },
  {
    kind: 'extra',
    key: 'daylightMinutes',
    field: 'daylightMinutes',
    label: 'Daylight',
    min: 0,
    max: 1440
  },
  { kind: 'extra', key: 'weightKg', field: 'weightKg', label: 'Weight', min: 20, max: 400 }
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

const pad = (n: string): string => n.padStart(2, '0');

/** `'23:12'` (or a full `'23:12:00'`) → `'23:12'`; anything else is null. */
export function healthClock(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = CLOCK.exec(value.trim());
  if (!match) return null;
  return `${pad(match[1]!)}:${match[2]}`;
}

/** Parse and validate a `north.health.v1` file. Throws a readable error. */
export function parseHealthFile(text: string): HealthFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON');
  }
  if (!isRecord(parsed)) throw new Error('Health file is not an object');
  if (parsed.format !== HEALTH_FORMAT) {
    throw new Error(`Not a ${HEALTH_FORMAT} file (found ${String(parsed.format ?? 'nothing')})`);
  }
  if (!Array.isArray(parsed.days)) throw new Error('Health file has no days array');

  const seen = new Set<string>();
  const days = parsed.days.map((value, index) => readDay(value, index, seen));
  days.sort((a, b) => a.date.localeCompare(b.date));

  return {
    format: HEALTH_FORMAT,
    generated: typeof parsed.generated === 'string' ? parsed.generated : null,
    source: typeof parsed.source === 'string' ? parsed.source : null,
    days
  };
}

function readDay(value: unknown, index: number, seen: Set<string>): HealthDay {
  if (!isRecord(value)) throw new Error(`Day ${index + 1} is not an object`);
  const date = value.date;
  if (typeof date !== 'string' || !DATE.test(date)) {
    throw new Error(`Day ${index + 1} has an invalid date`);
  }
  if (seen.has(date)) throw new Error(`${date} appears twice`);
  seen.add(date);

  const day: HealthDay = { date };
  let filled = 0;

  for (const slot of HEALTH_SLOTS) {
    const raw = value[slot.field];
    if (raw === undefined || raw === null) continue;

    if (slot.field === 'sleepStart') {
      const clock = healthClock(raw);
      if (!clock) throw new Error(`${date}: "${String(raw)}" is not a time of day`);
      day.sleepStart = clock;
      filled++;
      continue;
    }

    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      throw new Error(`${date}: ${slot.label} is not a number`);
    }
    if (raw < slot.min || raw > slot.max) {
      throw new Error(`${date}: ${slot.label} is out of range`);
    }
    if (slot.integer && !Number.isInteger(raw)) {
      throw new Error(`${date}: ${slot.label} must be a whole number`);
    }
    day[slot.field] = slot.integer ? raw : Math.round(raw * 100) / 100;
    filled++;
  }

  if (filled === 0) throw new Error(`${date} carries no health values`);
  return day;
}

/** Everything the file wants to set, oldest first. */
export function healthFields(file: HealthFile): HealthField[] {
  const out: HealthField[] = [];
  for (const day of file.days) {
    for (const slot of HEALTH_SLOTS) {
      const value = day[slot.field];
      if (value === undefined) continue;
      out.push({ date: day.date, slot, value: value as Value });
    }
  }
  return out;
}

export interface HealthField {
  date: string;
  slot: HealthSlot;
  value: Value;
}

export interface HealthPlan {
  /** Fields this device does not have, or has differently: these will be written. */
  writes: HealthField[];
  /** Fields a human typed by hand: reported back, never touched. */
  kept: HealthField[];
  /** Fields that already read exactly this: nothing to do. */
  same: number;
  /** How many days the file carries. */
  days: number;
  /** The span the file covers, `null` for an empty file. */
  from: string | null;
  to: string | null;
}

/** The stored entry for a field, or null. */
function storedValue(day: Day | undefined, slot: HealthSlot): Value {
  if (!day) return null;
  if (slot.kind === 'value') return day.values[slot.key as MetricId]?.v ?? null;
  return day.extras?.[slot.key] ?? null;
}

function isLocked(day: Day | undefined, slot: HealthSlot): boolean {
  return slot.kind === 'value' && day?.values[slot.key as MetricId]?.locked === true;
}

/**
 * What an import would do, read against the days already on this device. Pure,
 * so the Settings screen can show the whole plan before a byte is written.
 */
export function planHealthImport(file: HealthFile, existing: readonly Day[]): HealthPlan {
  const byDate = new Map(existing.map((day) => [day.date, day]));
  const writes: HealthField[] = [];
  const kept: HealthField[] = [];
  let same = 0;

  for (const field of healthFields(file)) {
    const day = byDate.get(field.date);
    /* Same first: a value that already reads exactly this is not "kept", it is
       nothing to do, whichever way it got there. */
    if (storedValue(day, field.slot) === field.value) {
      same++;
      continue;
    }
    if (isLocked(day, field.slot)) {
      kept.push(field);
      continue;
    }
    writes.push(field);
  }

  return {
    writes,
    kept,
    same,
    days: file.days.length,
    from: file.days[0]?.date ?? null,
    to: file.days.at(-1)?.date ?? null
  };
}

/** A day document with just this field applied, as a plain (storable) object. */
function withField(day: Day | undefined, field: HealthField): Day {
  const next: Day = {
    date: field.date,
    tz: day?.tz ?? '',
    values: { ...(day?.values ?? {}) }
  };
  if (day?.note) next.note = day.note;
  if (day?.restDay === true) next.restDay = true;
  if (day?.extras) next.extras = { ...day.extras };

  if (field.slot.kind === 'value') {
    /* `import` is honest about how it got here: not a tap, and not this device's
       own sync — a file. It carries no `locked`, so a later sync may refresh it. */
    const entry: DayValue = { v: field.value, src: 'import', t: 0 };
    const previous = day?.values[field.slot.key as MetricId];
    if (previous?.overridden === true) entry.overridden = true;
    next.values[field.slot.key as MetricId] = entry;
  } else {
    next.extras = next.extras ?? {};
    next.extras[field.slot.key] = field.value as number | string;
  }

  return next;
}

export interface HealthMerge {
  /** The days to store: every day the import changes, and nothing else. */
  days: Day[];
  plan: HealthPlan;
}

/**
 * The days as they would be after the import. Only changed days are returned, so
 * storing them cannot delete a day the file does not mention — a missing day
 * stays a gap.
 */
export function mergeHealth(file: HealthFile, existing: readonly Day[]): HealthMerge {
  const plan = planHealthImport(file, existing);
  const byDate = new Map(existing.map((day) => [day.date, day]));
  const touched = new Map<string, Day>();

  for (const field of plan.writes) {
    const base = touched.get(field.date) ?? byDate.get(field.date);
    touched.set(field.date, withField(base, field));
  }

  const days = [...touched.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { days, plan };
}
