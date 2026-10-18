/* src/lib/sample.ts — one finished day, and the 120 days behind it.
 *
 * This is NOT the demo seed. Demo mode (`docs/V2.md`) is an honest simulation:
 * it has rest days, sparse days and gaps, the way a real year does. The sample
 * is the opposite — `docs/V2.1.md` §4: a *completed* day, used by `/preview` so
 * the design can be judged at its best and so a screenshot has something on it.
 *
 * It tells one story on purpose: a weak start and a strong finish. A flat line
 * of perfect days is a spreadsheet; a climb is a dashboard. The improvement is
 * linear across the whole run, so the hero's 30-day window still shows a rise.
 *
 * Rules it keeps, since they are the app's rules:
 *   - every value is a raw registry input in the registry's own unit
 *   - derived metrics are *not* stored (`sleep_consistency`, `weight_trend`)
 *   - nothing is scored here; `aggregate.ts` scores it on read
 *   - pure and deterministic: same seed, byte-identical output, no clock, no
 *     `Math.random()`
 *   - it lives in memory only. `/preview` never writes to the store.
 */

import type { Day, DayValue, MetricId, Value } from './metrics/types';
import { addDays, localMidnightEpoch, weekdayIndex } from './metrics/dates';
import { mulberry32, pick, pickBin } from './random';

/** Its own seed family, so the sample and the demo never look alike. */
export const SAMPLE_SEED = 20261022;
export const SAMPLE_DAYS = 120;
export const SAMPLE_TZ = 'Europe/Berlin';

/** The run starts at 35 % of the way to the target and finishes on it. */
export const SAMPLE_START_QUALITY = 0.35;

export interface SampleOptions {
  /** Last logical date in the run, inclusive. Required — never read the clock. */
  end: string;
  days?: number;
  seed?: number;
}

/** The eleven metrics a human taps (02-metrics.md §4) — the ones stored as manual. */
const MANUAL: ReadonlySet<MetricId> = new Set<MetricId>([
  'protein', 'creatine', 'greens', 'alcohol', 'deep_blocks', 'learned', 'read',
  'phone_total', 'social_min', 'savings_rate', 'invested'
]);

/** One line per day: the note is what makes `learned` score 100 (03-scoring.md §1.6). */
const NOTES = [
  'Cache invalidation is a naming problem before it is a timing problem.',
  'A confidence interval is a statement about the procedure, not the parameter.',
  'Rust lifetimes describe the borrow, not the value.',
  'Calibration beats eloquence in a forecast.',
  'Shrinkage is what regularisation is doing under the hood.',
  'p-values answer "how surprising", never "how large".',
  'The prior is a choice you can be wrong about in public.',
  'A hash map trades memory for constant lookup.',
  'Partial application is not currying, and it matters.',
  'Most "focus" problems are really interruption-surface problems.'
] as const;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

/** `minutes since midnight` → `'HH:MM'`. Rounded, since a fractional minute is not a clock. */
function hhmm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * A finished run of days: all 19 metrics on every day, no rest days and no
 * partials, rising from a mediocre start to a strong finish.
 *
 * @returns oldest → newest, one `Day` per calendar date, no gaps.
 */
export function generateSampleDays(options: SampleOptions): Day[] {
  const count = options.days ?? SAMPLE_DAYS;
  const rng = mulberry32(options.seed ?? SAMPLE_SEED);
  const start = addDays(options.end, -(count - 1));

  /* Weight: a real cut early, then maintenance. Weigh-ins on Mondays only, as a
     scale in the bathroom gives them (derived.ts reads the 28-day EMA slope). */
  const weights: number[] = [];
  for (let i = 0; i < count; i++) {
    const drift = 83.2 - 2.4 * (i / (count - 1));
    weights.push(drift + (rng() - 0.5) * 0.4);
  }

  const days: Day[] = [];

  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    const dow = weekdayIndex(date);
    const weekend = dow === 0 || dow === 6;
    const midnight = localMidnightEpoch(date);
    const manualT = midnight + 21.5 * 3_600_000;
    const autoT = midnight + 6 * 3_600_000;

    /* How far along the run this day is: 0.35 → 1.0. Every quality draw below
       leans on it, which is what makes the area chart climb. */
    const progress = SAMPLE_START_QUALITY + (1 - SAMPLE_START_QUALITY) * (i / (count - 1));
    /** A probability that improves across the run. */
    const likely = (weak: number, strong: number): boolean => rng() < weak + (strong - weak) * progress;
    /** A binned draw: the `progress` bonus pushes the value into a better bin. */
    const better = (bonus: number): number => rng() + bonus * progress;

    const values: Partial<Record<MetricId, DayValue>> = {};
    const setValue = (id: MetricId, v: Value, t: number): void => {
      values[id] = MANUAL.has(id)
        ? { v, src: 'manual', t: manualT, locked: true }
        : { v, src: 'auto', t };
    };

    /* ── Body ─────────────────────────────────────────────────────────── */

    const sleep = roundTo(
      clamp(6.35 + 1.5 * progress + (weekend ? 0.25 : 0) + (rng() - 0.5) * 0.7, 6.2, 8.4),
      0.1
    );
    setValue('sleep_hours', sleep, autoT);

    /* Kept inside the day: `sleep_consistency` is the SD of the sleep start in
       minutes since midnight and is never scored across midnight. It tightens as
       the bedtime settles, which is the whole point of the metric — but it never
       goes to zero, since a week of identical bedtimes is not a week of sleep. */
    const spread = Math.max(16, 56 - 34 * progress);
    const bedtime = clamp(
      22 * 60 + 38 + 26 * progress + Math.round((rng() - 0.5) * spread),
      22 * 60 + 10,
      23 * 60 + 25
    );

    setValue('protein', pickBin(better(0.3), [2, 3, 4], [0.3, 0.72]), manualT);
    setValue('creatine', likely(0.5, 0.93), manualT);
    setValue('greens', pickBin(better(0.32), [3, 4, 5], [0.34, 0.62]), manualT);
    setValue('alcohol', likely(0.48, 0.88), manualT);

    setValue('steps', roundTo(4700 + 3400 * progress + rng() * 4300, 100), autoT);

    /* Mon and Thu, as an appointment rather than a mood. */
    setValue(
      'strength_sessions',
      (dow === 1 || dow === 4) && likely(0.35, 0.92) ? 1 : 0,
      autoT
    );
    setValue('daylight_days', likely(0.45, 0.9) ? 1 : 0, autoT);

    /* ── Mind ─────────────────────────────────────────────────────────── */

    setValue('deep_blocks', pickBin(better(0.3), [1, 2, 3.5], [0.3, 0.58]), manualT);
    setValue('learned', likely(0.55, 0.97), manualT);
    setValue('read', likely(0.5, 0.94), manualT);

    /* ── Attention ────────────────────────────────────────────────────── */

    setValue('phone_total', pickBin(better(0.42), [4.5, 3.5, 2.5, 1.5], [0.22, 0.45, 0.72]), manualT);
    setValue('social_min', pickBin(better(0.42), [150, 90, 45, 15], [0.22, 0.45, 0.72]), manualT);
    setValue(
      'distraction_min',
      Math.max(0, roundTo(146 - 66 * progress + (rng() - 0.5) * 80, 5)),
      autoT
    );
    setValue('adult', likely(0.6, 0.96), autoT);

    /* ── Capital: once a month, on the 1st ────────────────────────────── */

    if (date.endsWith('-01')) {
      setValue('savings_rate', Math.round(11 + 15 * progress + rng() * 4), manualT);
      setValue('invested', likely(0.55, 0.95), manualT);
    }

    /* ── The rest of the day's own record ─────────────────────────────── */

    const extras: Record<string, number | string> = { sleepStart: hhmm(bedtime) };
    if (dow === 1) extras.weightKg = Math.round(weights[i]! * 10) / 10;

    const day: Day = { date, tz: SAMPLE_TZ, values, extras };
    if (values.learned?.v === true) day.note = pick(rng, NOTES);
    days.push(day);
  }

  return days;
}
