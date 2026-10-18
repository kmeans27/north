/* src/lib/metrics/derived.ts — metrics computed on read, never stored
 * (02-metrics.md §5). Pure: any function that needs "now" takes it as an
 * argument. No Svelte, no browser API.
 */

import { addDays, diffDays, monthKey, weekKey } from './dates';
import { COVERAGE_OK, coverage, valueOf, type PeriodValues } from './aggregate';
import { scoreMetric } from './score';
import type { Day, MetricId, ResolvedMetric, Settings, Value } from './types';

/** Metrics that only ever arrive from a device (D9); a gap is never the user's fault. */
export const PURE_AUTO: readonly MetricId[] = [
  'sleep_hours',
  'sleep_consistency',
  'steps',
  'strength_sessions',
  'daylight_days',
  'weight_trend'
];

/** Days with 20+ minutes of daylight count toward `daylight_days` (02-metrics.md §1). */
export const DAYLIGHT_MINUTES = 20;
/** A weigh-in older than this makes `weight_trend` stale and unsuitable to score. */
export const WEIGH_IN_STALE_DAYS = 10;
/** EMA span for weight: α = 2 / (28 + 1) (02-metrics.md §5). */
const WEIGHT_ALPHA = 2 / 29;

function finite(value: Value): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `'HH:MM'` → minutes since midnight, or null when the string is unusable. */
export function minutesOfDay(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Population standard deviation. Defined for n = 0 and n = 1 (both 0). */
export function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/* ─── sleep_consistency ───────────────────────────────────────────────────── */

export interface SleepConsistency {
  /** SD of the sleep start, in minutes, or null when no night has a start time. */
  value: number | null;
  n: number;
  /** Fewer than 7 nights: the number is shown but flagged (03-scoring.md §8.4). */
  lowSample: boolean;
}

/** The sleep start time of a day: `extras.sleepStart`, else `extras.bedtime`. */
export function sleepStartMinutes(day: Day): number | null {
  return minutesOfDay(day.extras?.sleepStart) ?? minutesOfDay(day.extras?.bedtime);
}

/**
 * SD of sleep start over the last `window` logical days that have a sleep time
 * (02-metrics.md §5). Minutes since midnight; no circular wrap — bedtimes
 * cluster near one anchor time and are not scored across midnight.
 */
export function sleepConsistency(
  days: readonly Day[],
  window = 7
): SleepConsistency {
  const starts: number[] = [];
  for (let i = days.length - 1; i >= 0 && starts.length < window; i--) {
    const start = sleepStartMinutes(days[i]!);
    if (start !== null) starts.push(start);
  }
  if (starts.length === 0) return { value: null, n: 0, lowSample: true };
  return {
    value: standardDeviation(starts),
    n: starts.length,
    lowSample: starts.length < window
  };
}

/* ─── weight_trend ────────────────────────────────────────────────────────── */

export interface WeighIn {
  date: string;
  kg: number;
}

/** Weigh-ins, oldest first, from `extras.weightKg` (raw input, before the EMA). */
export function weighIns(days: readonly Day[]): WeighIn[] {
  const out: WeighIn[] = [];
  for (const day of days) {
    const kg = finite(day.extras?.weightKg ?? null);
    if (kg !== null) out.push({ date: day.date, kg });
  }
  return out;
}

export interface EmaPoint {
  date: string;
  ema: number;
}

/** Exponential moving average over weigh-ins with α = 2/(28+1). */
export function weightEma(days: readonly Day[]): EmaPoint[] {
  const points: EmaPoint[] = [];
  let ema: number | null = null;
  for (const { date, kg } of weighIns(days)) {
    ema = ema === null ? kg : WEIGHT_ALPHA * kg + (1 - WEIGHT_ALPHA) * ema;
    points.push({ date, ema });
  }
  return points;
}

/**
 * `(ema[last] − ema[last−14]) / ema[last−14] / 4 weeks × 100`
 * (02-metrics.md §5). Two identical points return `0`; fewer than two points,
 * or a zero reference, return `null`.
 *
 * @param points EMA points in date order; pass MORE than the current week when
 *               you have it: the reference is the newest point that is
 *               at least 14 days older than the last.
 */
export function weightSlopePctPerWeek(points: readonly EmaPoint[]): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1]!;
  const target = addDays(last.date, -14);

  // The newest point that is at least 14 days old; else the oldest we have.
  let reference = points[0]!;
  for (const point of points) {
    if (diffDays(point.date, target) >= 0) reference = point;
  }

  if (reference.ema === 0) return null;
  return round2(((last.ema - reference.ema) / reference.ema / 4) * 100);
}

/** Days since the last weigh-in; the metric is stale (and excluded) at 10+. */
export function weighInAgeDays(days: readonly Day[], today: string): number {
  const points = weighIns(days);
  const last = points[points.length - 1];
  if (!last) return Number.POSITIVE_INFINITY;
  return diffDays(last.date, today);
}

export function weightStale(days: readonly Day[], today: string): boolean {
  return weighInAgeDays(days, today) >= WEIGH_IN_STALE_DAYS;
}

/* ─── Weekly metric values ────────────────────────────────────────────────── */

/** Days in `week` where the day reports 20+ minutes of daylight. */
export function daylightDays(week: readonly Day[]): number {
  let count = 0;
  for (const day of week) {
    const minutes = finite(day.extras?.daylightMinutes ?? null);
    if (minutes !== null) {
      if (minutes >= DAYLIGHT_MINUTES) count++;
      continue;
    }
    const value = valueOf(day, 'daylight_days');
    if (value === true || (typeof value === 'number' && value >= 1)) count++;
  }
  return count;
}

/** Resistance sessions in the week: the sum of the days' `strength_sessions`. */
export function strengthSessions(week: readonly Day[]): number {
  let total = 0;
  for (const day of week) {
    const value = finite(valueOf(day, 'strength_sessions'));
    if (value !== null) total += value;
  }
  return total;
}

export interface WeeklyValueOptions {
  /** The days inside the target week. */
  week: readonly Day[];
  /** Days up to the end of the week, for the weight EMA. Defaults to `week`. */
  history?: readonly Day[];
}

/**
 * The weekly metrics' values for one week. Absent metrics stay absent, so they
 * drop out of the numerator *and* the denominator (03-scoring.md §3).
 */
export function weeklyValues({ week, history }: WeeklyValueOptions): PeriodValues {
  const out: PeriodValues = {};

  if (week.some((day) => valueOf(day, 'strength_sessions') !== null)) {
    out.strength_sessions = strengthSessions(week);
  }
  if (
    week.some(
      (day) =>
        valueOf(day, 'daylight_days') !== null || finite(day.extras?.daylightMinutes ?? null) !== null
    )
  ) {
    out.daylight_days = daylightDays(week);
  }

  // The slope reads the EMA over the run-up, so a stale series is left absent.
  const series = history ?? week;
  const lastDate = week[week.length - 1]?.date ?? series[series.length - 1]?.date;
  if (lastDate && !weightStale(series, lastDate)) {
    const slope = weightSlopePctPerWeek(weightEma(series));
    if (slope !== null) out.weight_trend = slope;
  }

  return out;
}

/** The monthly metrics (02-metrics.md §5): one figure for a whole month. */
export const MONTHLY_IDS: readonly MetricId[] = ['savings_rate', 'invested'];

/**
 * The monthly metrics' values for the month the history ends in. A monthly
 * metric is entered on whatever day of the month it happens to be
 * (03-scoring.md §3), so the newest value inside the month wins — and a new
 * month has no figure until one is entered, never last month's.
 */
export function monthlyValues(days: readonly Day[]): PeriodValues {
  const out: PeriodValues = {};
  const last = days[days.length - 1]?.date;
  if (!last) return out;
  const key = monthKey(last);

  /* Days are oldest first, so the first day outside the month ends the search. */
  for (let index = days.length - 1; index >= 0; index--) {
    const day = days[index];
    if (!day || monthKey(day.date) !== key) break;
    for (const id of MONTHLY_IDS) {
      if (out[id] !== undefined) continue;
      const value = valueOf(day, id);
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
        out[id] = value;
      }
    }
  }

  return out;
}

/* ─── Streaks (03-scoring.md §5) ──────────────────────────────────────────── */

const HIT = 100 - 1e-9;

/**
 * Consecutive logical days where the metric is present and scores 100.
 * A present day scoring 0, a `partial` day, or a gap of 2+ days breaks it.
 * A `rest_day` is neutral: it neither breaks nor extends (03-scoring.md §5).
 *
 * @param days the history ending at today, oldest first
 */
export function habitStreak(
  metricId: MetricId,
  days: readonly Day[],
  metrics: readonly ResolvedMetric[],
  settings: Settings
): number {
  const metric = metrics.find((m) => m.id === metricId);
  if (!metric) return 0;

  let streak = 0;
  let expected: string | null = null;

  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i]!;

    // A missing date in between is a gap of 2+ days and ends the streak.
    if (expected !== null && diffDays(day.date, expected) >= 2) break;

    if (day.restDay) {
      expected = addDays(day.date, -1);
      continue;
    }
    if (coverage(day, metrics) < COVERAGE_OK) break;

    const value = valueOf(day, metricId);
    if (value === null) break;
    const score = scoreMetric(metric, value, settings, { note: day.note });
    if (score === null || score < HIT) break;

    streak++;
    expected = addDays(day.date, -1);
  }

  return streak;
}

/** Consecutive logical days with coverage >= 0.70. `rest_day` is neutral. */
export function logStreak(
  days: readonly Day[],
  metrics: readonly ResolvedMetric[]
): number {
  let streak = 0;
  let expected: string | null = null;

  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i]!;
    if (expected !== null && diffDays(day.date, expected) >= 2) break;
    if (day.restDay) {
      expected = addDays(day.date, -1);
      continue;
    }
    if (coverage(day, metrics) < COVERAGE_OK) break;
    streak++;
    expected = addDays(day.date, -1);
  }

  return streak;
}

/* ─── Device gap (02-metrics.md §5, D9) ───────────────────────────────────── */

/**
 * The metrics a watch delivers *daily*, so a three-day hole is a real gap. The
 * weekly device metrics (gym, daylight, weight) cannot have a 3-day gap, and the
 * collector keeps its own copy in 07-automation.md (M6).
 */
const DAILY_DEVICE: readonly MetricId[] = ['sleep_hours', 'sleep_consistency', 'steps'];

/**
 * Whether the device delivered this metric's raw input on this day. A derived
 * metric stores nothing: its device input is the `extras` line (02-metrics.md §5).
 */
function deviceDelivered(day: Day, metricId: MetricId): boolean {
  if (metricId === 'sleep_consistency') return day.extras?.sleepStart !== undefined;
  if (metricId === 'weight_trend') return day.extras?.weightKg !== undefined;
  return valueOf(day, metricId) !== null;
}

/**
 * Consecutive days, counting back from `today`, with no value at all for a
 * pure-auto metric. Three or more raises the banner and marks the days partial.
 *
 * A gap is a device that *stopped*: a metric that has never arrived has nothing
 * to report, so a fresh install never sees the banner.
 */
export function deviceGapDays(
  metricId: MetricId,
  days: readonly Day[],
  today: string,
  limit = 90
): number {
  if (!days.some((day) => deviceDelivered(day, metricId))) return 0;

  const byDate = new Map(days.map((day) => [day.date, day]));
  let count = 0;
  let cursor = today;
  while (count < limit) {
    const day = byDate.get(cursor);
    if (day && deviceDelivered(day, metricId)) break;
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/** Every daily device metric whose gap has reached a given threshold. */
export function deviceGaps(
  days: readonly Day[],
  today: string,
  threshold = 3
): { metricId: MetricId; days: number }[] {
  const out: { metricId: MetricId; days: number }[] = [];
  for (const metricId of DAILY_DEVICE) {
    const gap = deviceGapDays(metricId, days, today);
    if (gap >= threshold) out.push({ metricId, days: gap });
  }
  return out;
}

/* ─── Hit rates (02-metrics.md §6, rule 4) ────────────────────────────────── */

export interface HitRate {
  metricId: MetricId;
  /** Days meeting the metric. */
  met: number;
  /** Days the metric was present and countable. */
  total: number;
  rate: number;
}

export function hitRate(
  metricId: MetricId,
  days: readonly Day[],
  metrics: readonly ResolvedMetric[],
  settings: Settings
): HitRate {
  const metric = metrics.find((m) => m.id === metricId);
  if (!metric) return { metricId, met: 0, total: 0, rate: 0 };

  let met = 0;
  let total = 0;
  for (const day of days) {
    if (day.restDay || coverage(day, metrics) < COVERAGE_OK) continue;
    const value = valueOf(day, metricId);
    if (value === null) continue;
    const score = scoreMetric(metric, value, settings, { note: day.note });
    if (score === null) continue;
    total++;
    if (score >= HIT) met++;
  }
  return { metricId, met, total, rate: total > 0 ? met / total : 0 };
}

/* ─── Period helpers ──────────────────────────────────────────────────────── */

/** Group days by their week key (ordering within a group is not guaranteed). */
export function byWeekKey(
  days: readonly Day[],
  weekStartsOn: 0 | 1 = 1
): Map<string, Day[]> {
  const groups = new Map<string, Day[]>();
  for (const day of days) {
    const key = weekKey(day.date, weekStartsOn);
    const group = groups.get(key);
    if (group) group.push(day);
    else groups.set(key, [day]);
  }
  return groups;
}
