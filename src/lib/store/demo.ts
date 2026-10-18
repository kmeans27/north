/* src/lib/store/demo.ts — deterministic 120-day demo seed (06-architecture.md §8).
 *
 * Same inputs → byte-identical output. No `Date.now()`, no `Math.random()`: every
 * draw comes from a seeded PRNG, so screenshots and Playwright layout tests are
 * reproducible. Demo data lives in memory only and is never persisted.
 *
 * The seed emits *raw inputs*, exactly as a real device would:
 *   - day.values: metrics that are logged or ingested directly
 *   - extras.sleepStart: feeds the derived `sleep_consistency`
 *   - extras.weightKg:   feeds the derived `weight_trend`
 * Derived metrics are computed on read (02-metrics.md §5).
 */

import type { Day, DayValue, MetricId, Value } from '../metrics/types';
import { addDays, localMidnightEpoch, monthOf, toISODate, weekdayIndex } from '../metrics/dates';

export const DEMO_SEED = 20261017;
export const DEMO_DAYS = 120;
export const DEMO_TZ = 'Europe/Berlin';

/** Test-only override so the seed never reads the clock in a unit test. */
export interface DemoOptions {
  /** Last logical date produced, inclusive. Defaults to the local today. */
  end: string;
  days?: number;
  seed?: number;
}

/** mulberry32 — 32-bit, fast, deterministic, no dependency. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MANUAL: ReadonlySet<MetricId> = new Set<MetricId>([
  'protein', 'creatine', 'greens', 'alcohol', 'deep_blocks', 'learned', 'read',
  'phone_total', 'social_min', 'savings_rate', 'invested'
]);

const NOTES = [
  'Bayes vs frequentist: the prior is a choice, not a fact.',
  'Why a confidence interval is not a probability of the truth.',
  'Rust borrow checker: the lifetime is the scope of the loan.',
  'Calibration beats eloquence in a forecast.',
  'How a hash table trades memory for constant lookup.',
  'The bias-variance tradeoff, seen as shrinkage.',
  'Why p-values do not measure effect size.',
  'Marginal means after adjusting for a covariate.'
] as const;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  const item = list[Math.floor(rng() * list.length)];
  // list is never empty at any call site
  return item as T;
}

/** One already-drawn [0, 1) number → the bin whose ascending cut it falls under. */
function pickBin(draw: number, values: readonly number[], cuts: readonly number[]): number {
  for (let i = 0; i < cuts.length; i++) {
    if (draw < cuts[i]!) return values[i]!;
  }
  return values[values.length - 1]!;
}

function hhmm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Days in the month containing `iso`, from the calendar alone. */
function daysInMonth(iso: string): number {
  const [y, m] = iso.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Generate the demo history. Pure and deterministic for a given (end, days, seed).
 * @returns oldest → newest, one `Day` per calendar date, no gaps.
 */
export function generateDemoDays(options?: Partial<DemoOptions>): Day[] {
  const end = options?.end ?? toISODate(new Date());
  const count = options?.days ?? DEMO_DAYS;
  const seed = options?.seed ?? DEMO_SEED;

  const rng = mulberry32(seed);
  const start = addDays(end, -(count - 1));

  // Synthetic body weight: −0.4 %/week drift plus daily water noise.
  const weights: number[] = [];
  for (let i = 0; i < count; i++) {
    const drift = 82.4 * (1 - 0.004 * (i / 7));
    weights.push(drift + (rng() - 0.5) * 0.6);
  }

  const days: Day[] = [];
  let prevSleep = 7.2;

  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    const dow = weekdayIndex(date);
    const isMonday = dow === 1;
    const isFridayOrSaturday = dow === 5 || dow === 6;
    const isWeekend = dow === 0 || dow === 6;
    const midnight = localMidnightEpoch(date);
    const manualT = midnight + 21.5 * 3_600_000;
    const autoT = midnight + 6 * 3_600_000;

    const values: Partial<Record<MetricId, DayValue>> = {};
    const setValue = (id: MetricId, v: Value, t: number): void => {
      const manual = MANUAL.has(id);
      values[id] = manual
        ? { v, src: 'manual', t: manualT, locked: true }
        : { v, src: 'auto', t };
    };

    /* ── Body ─────────────────────────────────────────────────────────── */

    let sleep = 7.15 + (rng() - 0.5) * 0.9;
    if (isMonday) sleep -= 0.55;
    if (isWeekend) sleep += 0.35;
    if (rng() < 0.06) sleep -= 1.3; // an occasional short night
    sleep = Math.round(clamp(sleep, 5.0, 8.5) * 10) / 10;
    setValue('sleep_hours', sleep, autoT);
    prevSleep = sleep;

    // Bedtime drifts with the length of the night: the wake-up is fixed. Kept
    // inside its own day: sleep_consistency is the SD of the sleep start in
    // minutes since midnight and is never scored across midnight, so a seeded
    // 00:35 would read as a wild outlier rather than as a short night.
    const bedtime = clamp(
      23 * 60 + 10 + Math.round((rng() - 0.5) * 50) - Math.round((sleep - 7) * 30),
      21 * 60 + 45,
      23 * 60 + 55
    );

    const proteinDraw = rng();
    setValue(
      'protein',
      proteinDraw < 0.66 ? 4 : proteinDraw < 0.8 ? 3 : proteinDraw < 0.9 ? 5 : proteinDraw < 0.97 ? 2 : 1,
      manualT
    );
    setValue('creatine', rng() < 0.86, manualT);

    const greensDraw = rng();
    setValue(
      'greens',
      greensDraw < 0.58 ? 5 : greensDraw < 0.72 ? 4 : greensDraw < 0.84 ? 6 : greensDraw < 0.92 ? 3 : greensDraw < 0.97 ? 2 : 1,
      manualT
    );
    setValue('alcohol', rng() < 0.88, manualT);

    setValue('steps', roundTo((isWeekend ? 3800 : 4600) + rng() * 7000, 100), autoT);

    // Mon/Thu adherence is 80 %: a session started on that date, else zero.
    const isGymDay = isMonday || dow === 4;
    setValue('strength_sessions', isGymDay && rng() < 0.8 ? 1 : 0, autoT);

    const daylight = rng() < (isWeekend ? 0.72 : 0.6) ? 1 : 0;
    setValue('daylight_days', daylight, autoT);

    /* ── Mind ─────────────────────────────────────────────────────────── */

    // Deep blocks follow the previous night's sleep — the correlation the
    // insight engine is meant to find.
    const blocks = clamp(Math.round((prevSleep - 6) * 1.15 + (rng() - 0.5) * 1.1), 0, 4);
    setValue('deep_blocks', blocks, manualT);

    const learnedDraw = rng();
    if (learnedDraw < 0.72) {
      setValue('learned', true, manualT);
    } else if (learnedDraw < 0.84) {
      setValue('learned', false, manualT);
    }
    // else: left unlogged — the tri-state rule (03-scoring.md §2)

    const readDraw = rng();
    if (readDraw < 0.62) setValue('read', true, manualT);
    else if (readDraw < 0.77) setValue('read', false, manualT);

    /* ── Attention ────────────────────────────────────────────────────── */

    const phoneDraw = rng();
    const phoneCuts = isFridayOrSaturday
      ? [0.08, 0.28, 0.6, 0.85]
      : [0.25, 0.55, 0.8, 0.93];
    setValue('phone_total', pickBin(phoneDraw, [1.5, 2.5, 3.5, 4.5, 6], phoneCuts), manualT);

    const socialDraw = rng();
    const socialCuts = isFridayOrSaturday
      ? [0.15, 0.4, 0.7]
      : [0.4, 0.7, 0.9];
    setValue('social_min', pickBin(socialDraw, [15, 45, 90, 150], socialCuts), manualT);

    setValue(
      'distraction_min',
      Math.max(0, roundTo((isWeekend ? 35 : 65) + rng() * 110, 5)),
      autoT
    );
    setValue('adult', rng() < 0.93, autoT);

    /* ── Capital: once a month, on the 1st ────────────────────────────── */

    if (date.endsWith('-01')) {
      setValue('savings_rate', 10 + Math.round(rng() * 18), manualT);
      setValue('invested', rng() < 0.84, manualT);
    }

    /* ── Extras that feed derived metrics ─────────────────────────────── */

    const extras: Record<string, number | string> = { sleepStart: hhmm(bedtime) };
    if (isMonday) extras.weightKg = Math.round(weights[i]! * 10) / 10;

    /* ── Shape the day: one rest day and three partials per month ─────── */

    const isRestDay = rng() < 1 / 30;
    const isPartial = !isRestDay && rng() < 3 / 30;

    if (isRestDay) {
      // 03-scoring.md §7: a rest day keeps only sleep, nutrition and reading.
      const keep: MetricId[] = ['sleep_hours', 'protein', 'greens', 'read'];
      for (const id of Object.keys(values) as MetricId[]) {
        if (!keep.includes(id)) delete values[id];
      }
    } else if (isPartial) {
      // Sparse logging: coverage lands between 25 % and 69 %.
      const keep: MetricId[] = ['deep_blocks', 'protein', 'read', 'learned'];
      for (const id of Object.keys(values) as MetricId[]) {
        if (!keep.includes(id)) delete values[id];
      }
    }

    const day: Day = { date, tz: DEMO_TZ, values };
    if (extras.sleepStart) day.extras = extras;
    if (isRestDay) day.restDay = true;
    if (values.learned?.v === true && rng() < 0.92) {
      day.note = pick(rng, NOTES);
    }

    days.push(day);
  }

  return days;
}

/** FNV-1a over a stable projection of the seed, for the determinism proof. */
export function demoFingerprint(days: Day[]): string {
  let hash = 0x811c9dc5;
  for (const day of days) {
    const line = `${day.date}|${day.restDay ? 'r' : ''}|${day.note ?? ''}|` +
      Object.keys(day.values).sort().map((k) => `${k}=${String(day.values[k as MetricId]?.v)}`).join(',') +
      `|${String(day.extras?.sleepStart ?? '')}|${String(day.extras?.weightKg ?? '')}`;
    for (let i = 0; i < line.length; i++) {
      hash ^= line.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

/** Month keys touched by the seed, oldest first. */
export function demoMonths(days: Day[]): string[] {
  return [...new Set(days.map((d) => monthOf(d.date)))];
}

/** Number of days in the demo month of `iso` (used by the seed script). */
export function monthLength(iso: string): number {
  return daysInMonth(iso);
}
