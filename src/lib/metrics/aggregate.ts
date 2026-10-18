/* src/lib/metrics/aggregate.ts — coverage and the three score levels
 * (03-scoring.md §2–§3).
 *
 * One principle: "a metric only enters the denominator when it has a value."
 * Pure functions only. No Svelte, no browser API, no clock.
 *
 * Doc conflict, resolved in favour of 02-metrics.md (canonical, §5):
 *   03-scoring.md §2 gives the coverage denominator as 0.79 and labels it "sum
 *   of the metrics where countsTowardCoverage === true". That sum is actually
 *   0.64; 0.79 is the sum of *all* daily weights. 02-metrics.md §5 defines
 *   coverage as the present coverage-weight over the total coverage-weight, so
 *   the denominator here is the computed coverage mass (0.64 by default).
 */

import type { Day, MetricId, Pillar, ResolvedMetric, Settings, Value } from './types';
import { metricMasses } from './resolve';
import { clamp, scoreMetric } from './score';

/** 03-scoring.md §2: >= 0.70 counts in averages, streaks and insights. */
export const COVERAGE_OK = 0.7;
/** 03-scoring.md §2 / 04-ux.md §9: below 0.25 the day has no score. */
export const COVERAGE_MIN = 0.25;

/** 03-scoring.md §7: a rest day keeps only these four. */
export const REST_DAY_KEEP: readonly MetricId[] = ['sleep_hours', 'protein', 'greens', 'read'];

/**
 * Explicit per-metric values for weekly and monthly metrics; absent means "no
 * data". Numeric for counters and ramps, boolean for toggles such as `invested`.
 */
export type PeriodValues = Partial<Record<MetricId, number | boolean>>;

/** True when a period value can be scored: a finite number or a boolean. */
function hasValue(value: number | boolean | undefined): value is number | boolean {
  if (typeof value === 'boolean') return true;
  return typeof value === 'number' && Number.isFinite(value);
}

/* ─── Presence (03-scoring.md §2) ─────────────────────────────────────────── */

/** The raw value of a metric on a day, or `null` when unset. */
export function valueOf(day: Day, id: MetricId): Value {
  const entry = day.values[id];
  if (!entry) return null;
  return entry.v ?? null;
}

/** Present means "not null". `0`, `false` and `''` are all present (D3). */
export function isPresent(day: Day, id: MetricId): boolean {
  return valueOf(day, id) !== null;
}

/* ─── Coverage ────────────────────────────────────────────────────────────── */

/**
 * Σ weight of the present metrics that count toward coverage, over the coverage
 * mass. Always in `[0, 1]`.
 */
export function coverage(day: Day, metrics: readonly ResolvedMetric[]): number {
  const mass = metricMasses(metrics).coverage;
  if (mass <= 0) return 0;
  let present = 0;
  for (const metric of metrics) {
    if (!metric.countsTowardCoverage || metric.cadence !== 'daily') continue;
    if (isPresent(day, metric.id)) present += metric.weight;
  }
  return clamp(present / mass, 0, 1);
}

export type CoverageBand = 'ok' | 'partial' | 'insufficient';

export function coverageBand(coverageValue: number): CoverageBand {
  if (coverageValue >= COVERAGE_OK) return 'ok';
  if (coverageValue >= COVERAGE_MIN) return 'partial';
  return 'insufficient';
}

/* ─── Day score (03-scoring.md §3) ────────────────────────────────────────── */

/** The daily metrics that may enter a day's score: rest days keep only four. */
function dailyPool(day: Day, metrics: readonly ResolvedMetric[]): ResolvedMetric[] {
  const keep = day.restDay ? new Set<MetricId>(REST_DAY_KEEP) : null;
  return metrics.filter(
    (metric) => metric.cadence === 'daily' && (!keep || keep.has(metric.id))
  );
}

export interface DayPresence {
  /** Daily metrics with a value on this day; `0` and `false` count. */
  present: number;
  /** Daily metrics the day could hold, after the rest-day restriction. */
  total: number;
  /** Σ weight of the present daily metrics: the day score's denominator. */
  weight: number;
}

/** "Logged 6 of 8 today" (04-ux.md §10) and the monotonicity invariant (§8.5). */
export function dayPresence(
  day: Day,
  metrics: readonly ResolvedMetric[]
): DayPresence {
  const pool = dailyPool(day, metrics);
  let present = 0;
  let weight = 0;
  for (const metric of pool) {
    if (!isPresent(day, metric.id)) continue;
    present++;
    weight += metric.weight;
  }
  return { present, total: pool.length, weight };
}

/**
 * The composite for one day, or `null` when coverage is below 25 %.
 * Weekly and monthly metrics never enter the daily score (D5).
 */
export function dayScore(
  day: Day,
  metrics: readonly ResolvedMetric[],
  settings: Settings
): number | null {
  if (coverage(day, metrics) < COVERAGE_MIN) return null;

  let numerator = 0;
  let denominator = 0;
  for (const metric of dailyPool(day, metrics)) {
    const value = valueOf(day, metric.id);
    if (value === null) continue;

    const score = scoreMetric(metric, value, settings, { note: day.note });
    if (score === null) continue;

    numerator += metric.weight * score;
    denominator += metric.weight;
  }

  if (denominator <= 0) return null;
  return numerator / denominator;
}

/* ─── Week and month (03-scoring.md §3) ───────────────────────────────────── */

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/** The day scores that may enter a week/month average: coverage >= 0.70. */
function qualifyingScores(
  days: readonly Day[],
  metrics: readonly ResolvedMetric[],
  settings: Settings
): number[] {
  const scores: number[] = [];
  for (const day of days) {
    if (coverage(day, metrics) < COVERAGE_OK) continue;
    const score = dayScore(day, metrics, settings);
    if (score !== null) scores.push(score);
  }
  return scores;
}

/**
 * Weekly metrics are rate metrics: they are evaluated as "per week inside the
 * period" with the same curve. For a single week that is the trivial case; for a
 * month the caller supplies each intersecting week's value and this averages
 * them per metric, over the weeks that have data.
 */
function weeklyPart(
  metrics: readonly ResolvedMetric[],
  settings: Settings,
  values: PeriodValues
): { part: number; denominator: number } {
  let part = 0;
  let denominator = 0;
  for (const metric of metrics) {
    if (metric.cadence !== 'weekly') continue;
    const value = values[metric.id];
    if (!hasValue(value)) continue;
    const score = scoreMetric(metric, value, settings);
    if (score === null) continue;
    part += metric.weight * score;
    denominator += metric.weight;
  }
  return { part, denominator };
}

function monthlyPart(
  metrics: readonly ResolvedMetric[],
  settings: Settings,
  values: PeriodValues
): { part: number; denominator: number } {
  let part = 0;
  let denominator = 0;
  for (const metric of metrics) {
    if (metric.cadence !== 'monthly') continue;
    const value = values[metric.id];
    if (!hasValue(value)) continue;
    const score = scoreMetric(metric, value, settings);
    if (score === null) continue;
    part += metric.weight * score;
    denominator += metric.weight;
  }
  return { part, denominator };
}

/**
 * `weekScore(week)`: the mean day score block, plus this week's weekly metrics.
 * @param days   the logical days of the week
 * @param weekly this week's weekly-metric values (see derived.weeklyValues)
 */
export function weekScore(
  days: readonly Day[],
  metrics: readonly ResolvedMetric[],
  settings: Settings,
  weekly: PeriodValues = {}
): number | null {
  const masses = metricMasses(metrics);
  const scores = qualifyingScores(days, metrics, settings);
  const dailyPart = scores.length > 0 ? mean(scores) * masses.daily : 0;
  const week = weeklyPart(metrics, settings, weekly);

  const denominator = (scores.length > 0 ? masses.daily : 0) + week.denominator;
  if (denominator <= 0) return null;
  return (dailyPart + week.part) / denominator;
}

/**
 * `monthScore(month)`: same as weekScore, but weekly metrics are averaged per
 * week across the weeks intersecting the month, and monthly metrics are added.
 * @param weeklyByWeek per-week weekly values, keyed by `weekKey`
 * @param monthly      the month's monthly-metric values
 */
export function monthScore(
  days: readonly Day[],
  metrics: readonly ResolvedMetric[],
  settings: Settings,
  weeklyByWeek: Record<string, PeriodValues> = {},
  monthly: PeriodValues = {}
): number | null {
  const masses = metricMasses(metrics);
  const scores = qualifyingScores(days, metrics, settings);
  const dailyPart = scores.length > 0 ? mean(scores) * masses.daily : 0;

  // Average each weekly metric across the weeks that have a value for it.
  const averaged: PeriodValues = {};
  for (const metric of metrics) {
    if (metric.cadence !== 'weekly') continue;
    const perWeek: number[] = [];
    for (const values of Object.values(weeklyByWeek)) {
      const value = values[metric.id];
      if (typeof value === 'number' && Number.isFinite(value)) perWeek.push(value);
    }
    if (perWeek.length > 0) averaged[metric.id] = mean(perWeek);
  }

  const week = weeklyPart(metrics, settings, averaged);
  const month = monthlyPart(metrics, settings, monthly);

  const denominator =
    (scores.length > 0 ? masses.daily : 0) + week.denominator + month.denominator;
  if (denominator <= 0) return null;
  return (dailyPart + week.part + month.part) / denominator;
}

/* ─── Pillar scores (02-metrics.md §4: diagnostic, never weighted twice) ──── */

/**
 * Score per pillar over a window. Each metric's window score is the mean of its
 * present daily scores; the pillar score is the weighted mean of those, with the
 * weights normalised *within the pillar* so pillar weights are never multiplied
 * by metric weights.
 */
export function pillarScores(
  days: readonly Day[],
  metrics: readonly ResolvedMetric[],
  settings: Settings,
  weekly: PeriodValues = {}
): Record<Pillar, number | null> {
  const result: Record<Pillar, number | null> = {
    body: null,
    mind: null,
    attention: null,
    capital: null
  };

  for (const pillar of Object.keys(result) as Pillar[]) {
    let numerator = 0;
    let denominator = 0;

    for (const metric of metrics) {
      if (metric.pillar !== pillar) continue;

      let score: number | null = null;
      if (metric.cadence === 'daily') {
        const present: number[] = [];
        for (const day of days) {
          const value = valueOf(day, metric.id);
          if (value === null) continue;
          const valueScore = scoreMetric(metric, value, settings, { note: day.note });
          if (valueScore !== null) present.push(valueScore);
        }
        if (present.length > 0) score = mean(present);
      } else {
        const value = weekly[metric.id];
        if (hasValue(value)) score = scoreMetric(metric, value, settings);
      }

      if (score === null) continue;
      numerator += metric.weight * score;
      denominator += metric.weight;
    }

    result[pillar] = denominator > 0 ? numerator / denominator : null;
  }

  return result;
}

export interface MetricWindowScore {
  metric: ResolvedMetric;
  score: number;
  /** Number of days (daily) or periods (weekly/monthly) that carried data. */
  n: number;
}

/** Every metric with data in the window, with its window mean and sample size. */
export function metricWindowScores(
  days: readonly Day[],
  metrics: readonly ResolvedMetric[],
  settings: Settings,
  weekly: PeriodValues = {}
): MetricWindowScore[] {
  const out: MetricWindowScore[] = [];
  for (const metric of metrics) {
    if (metric.cadence === 'daily') {
      const present: number[] = [];
      for (const day of days) {
        const value = valueOf(day, metric.id);
        if (value === null) continue;
        const score = scoreMetric(metric, value, settings, { note: day.note });
        if (score !== null) present.push(score);
      }
      if (present.length > 0) out.push({ metric, score: mean(present), n: present.length });
    } else {
      const value = weekly[metric.id];
      if (hasValue(value)) {
        const score = scoreMetric(metric, value, settings);
        if (score !== null) out.push({ metric, score, n: 1 });
      }
    }
  }
  return out;
}

/**
 * One pillar's score on one day: the weighted mean of the daily metrics present
 * in that pillar, normalised within the pillar. Feeds the 90-day consistency
 * grid on Trends (04-ux.md §6); it is diagnostic, never part of a composite.
 */
export function pillarDayScore(
  day: Day,
  pillar: Pillar,
  metrics: readonly ResolvedMetric[],
  settings: Settings
): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const metric of metrics) {
    if (metric.pillar !== pillar || metric.cadence !== 'daily') continue;
    const value = valueOf(day, metric.id);
    if (value === null) continue;
    const score = scoreMetric(metric, value, settings, { note: day.note });
    if (score === null) continue;
    numerator += metric.weight * score;
    denominator += metric.weight;
  }
  return denominator > 0 ? numerator / denominator : null;
}

/** The lowest-scoring metric inside a pillar — the lever a weak pillar points at. */
export function weakestMetricInPillar(
  days: readonly Day[],
  pillar: Pillar,
  metrics: readonly ResolvedMetric[],
  settings: Settings,
  weekly: PeriodValues = {}
): MetricWindowScore | null {
  const candidates = metricWindowScores(days, metrics, settings, weekly).filter(
    (entry) => entry.metric.pillar === pillar
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((worst, entry) => (entry.score < worst.score ? entry : worst));
}
