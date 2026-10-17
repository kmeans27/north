/* tests/unit/helpers.ts — fixtures shared by the M2 suites. Not a test file. */

import { resolveMetrics } from '../../src/lib/metrics/resolve';
import { mergeSettings } from '../../src/lib/store/settings';
import type {
  Day,
  DayValue,
  MetricId,
  Settings,
  Value
} from '../../src/lib/metrics/types';

/** Real defaults, from the app's own merge — never a hand-written stub. */
export function settings(overrides: Partial<Settings> = {}): Settings {
  return mergeSettings(overrides);
}

export const METRICS = resolveMetrics(settings());

export function val(value: Value, src: DayValue['src'] = 'manual'): DayValue {
  return { v: value, src, t: 0, ...(src === 'manual' ? { locked: true } : {}) };
}

/** A day from a `{ metricId: value }` map, all values written manually. */
export function day(
  date: string,
  values: Partial<Record<MetricId, Value>>,
  rest: Partial<Day> = {}
): Day {
  const entries: Partial<Record<MetricId, DayValue>> = {};
  for (const [id, value] of Object.entries(values) as [MetricId, Value][]) {
    entries[id] = val(value);
  }
  return { date, tz: 'UTC', values: entries, ...rest };
}

/** Values that score 100 on every daily metric, so a day can be 100 exactly. */
export const PERFECT_DAILY: Partial<Record<MetricId, Value>> = {
  sleep_hours: 7.5,
  sleep_consistency: 30,
  protein: 4,
  creatine: true,
  greens: 5,
  alcohol: true,
  steps: 7000,
  deep_blocks: 2,
  learned: true,
  read: true,
  phone_total: 2.5,
  social_min: 30,
  distraction_min: 90,
  adult: true
};

/** A day scoring exactly 100 with full coverage. `note` satisfies `learned`. */
export function perfectDay(date: string, overrides: Partial<Record<MetricId, Value>> = {}): Day {
  return day(date, { ...PERFECT_DAILY, ...overrides }, { note: 'A written line.' });
}

/** `n` consecutive dates starting at `start`, as a helper for windows. */
export function dates(start: string, n: number): string[] {
  const out: string[] = [];
  let cursor = start;
  for (let i = 0; i < n; i++) {
    out.push(cursor);
    const [y, m, d] = cursor.split('-').map(Number) as [number, number, number];
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    cursor = next.toISOString().slice(0, 10);
  }
  return out;
}
