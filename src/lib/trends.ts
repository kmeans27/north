/* src/lib/trends.ts — the Trends screen, as data (04-ux.md §6).
 *
 * One row per metric, grouped by pillar, over a 30- or 90-day window, plus the
 * five insight rules and a 90-day consistency grid per pillar. Pure: no Svelte,
 * no clock, no browser API.
 *
 * Weekly and monthly metrics are plotted per period, not per day: their value
 * is a rate over a week or a month, and pretending it is a daily value would be
 * a lie (03-scoring.md §3).
 */

import {
  pillarDayScore,
  valueOf,
  type PeriodValues
} from './metrics/aggregate';
import { addDays, startOfWeek, weekdayIndex } from './metrics/dates';
import { byWeekKey, hitRate, sleepConsistency, weeklyValues } from './metrics/derived';
import { PILLARS, PILLAR_LABEL } from './metrics/registry';
import { scoreMetric } from './metrics/score';
import { buildInsights, type Insight } from './insights/rules';
import type { Day, Pillar, ResolvedMetric, Settings } from './metrics/types';

/** The toggle's two windows (04-ux.md §6). */
export const WINDOWS = [30, 90] as const;
export type TrendWindow = (typeof WINDOWS)[number];
/** The hit-rate always reads 30 days, whatever the chart shows. */
export const HIT_RATE_DAYS = 30;
/** The consistency grid always reads 90 days. */
export const CONSISTENCY_DAYS = 90;

const HIT = 100 - 1e-9;

export interface TrendPoint {
  date: string;
  /** Null means "no value": the line breaks, it never interpolates. */
  value: number | null;
}

export type TrendUnit = 'days' | 'weeks' | 'months';

export interface TrendRate {
  met: number;
  total: number;
  rate: number;
  /** `5 of 7 days` — the noun follows the metric's cadence. */
  unit: TrendUnit;
}

export interface TrendDomain {
  /** The bottom of the scale: zeroAt or 0, never auto-zoomed (05-design.md §5). */
  min: number;
  max: number;
  /** The target hairline, or null when the metric has no meaningful target. */
  target: number | null;
  /** `range` metrics are the ones where a lower value is the good side. */
  lowerIsBetter: boolean;
}

export interface TrendRow {
  metric: ResolvedMetric;
  /** The window's points, oldest first, gaps as null. */
  series: TrendPoint[];
  /** The newest point with a value: what the row header shows before selection. */
  latest: TrendPoint | null;
  rate: TrendRate;
  domain: TrendDomain;
}

export interface PillarGroup {
  pillar: Pillar;
  label: string;
  rows: TrendRow[];
  /** 90 daily pillar scores, oldest first; null where the day has no data. */
  consistency: (number | null)[];
  /** Cells to skip before the first day, so columns are weekdays. */
  offset: number;
}

export interface TrendsModel {
  window: TrendWindow;
  start: string;
  end: string;
  groups: PillarGroup[];
  insights: Insight[];
}

export interface TrendsOptions {
  /** History ending at today, oldest first. */
  days: readonly Day[];
  today: string;
  window: TrendWindow;
  metrics: readonly ResolvedMetric[];
  settings: Settings;
}

/** A period value as a plain number; booleans read as 1 / 0. */
function numeric(value: number | boolean | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === true) return 1;
  if (value === false) return 0;
  return null;
}

interface WeekBucket {
  start: string;
  end: string;
  days: Day[];
  values: PeriodValues;
}

/** Every complete week in the history, oldest first, with its weekly values. */
function weekBuckets(history: readonly Day[], settings: Settings): WeekBucket[] {
  const groups = byWeekKey(history, settings.weekStartsOn);
  return [...groups.values()]
    .sort((a, b) => (a[0]!.date < b[0]!.date ? -1 : 1))
    .map((days) => {
      const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
      const start = startOfWeek(sorted[0]!.date, settings.weekStartsOn);
      const end = addDays(start, 6);
      return {
        start,
        end,
        days: sorted,
        values: weeklyValues({
          week: sorted,
          history: history.filter((day) => day.date <= end)
        })
      };
    });
}

interface MonthBucket {
  end: string;
  days: Day[];
}

/** Every month in the history, oldest first, with the month's last date. */
function monthBuckets(history: readonly Day[]): MonthBucket[] {
  const groups = new Map<string, Day[]>();
  for (const day of history) {
    const key = day.date.slice(0, 7);
    const bucket = groups.get(key);
    if (bucket) bucket.push(day);
    else groups.set(key, [day]);
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, days]) => {
      const [year, month] = key.split('-').map(Number) as [number, number];
      const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
      return { end: addDays(next, -1), days };
    });
}

/** The newest stored value inside a month, or null. */
function monthValue(metric: ResolvedMetric, bucket: MonthBucket): number | null {
  for (let i = bucket.days.length - 1; i >= 0; i--) {
    const raw = valueOf(bucket.days[i]!, metric.id);
    if (typeof raw === 'string') continue;
    const value = numeric(raw ?? undefined);
    if (value !== null) return value;
  }
  return null;
}

/**
 * A metric's series inside the window. Daily metrics get one point per day;
 * weekly and monthly metrics get one point per period, placed at the period's
 * last date (clamped to today).
 */
function seriesFor(
  metric: ResolvedMetric,
  history: readonly Day[],
  windowDays: readonly Day[],
  weeks: readonly WeekBucket[],
  months: readonly MonthBucket[],
  today: string
): TrendPoint[] {
  const start = windowDays[0]?.date ?? today;

  if (metric.cadence === 'daily') {
    return windowDays.map((day) => {
      const stored = valueOf(day, metric.id);
      if (typeof stored === 'number' && Number.isFinite(stored)) {
        return { date: day.date, value: stored };
      }
      if (typeof stored === 'boolean') return { date: day.date, value: stored ? 1 : 0 };
      // A derived metric stores nothing: recompute its value on read.
      if (metric.id === 'sleep_consistency') {
        const upto = history.filter((candidate) => candidate.date <= day.date);
        return { date: day.date, value: sleepConsistency(upto).value };
      }
      return { date: day.date, value: null };
    });
  }

  if (metric.cadence === 'weekly') {
    const points: TrendPoint[] = [];
    for (const bucket of weeks) {
      const date = bucket.end > today ? today : bucket.end;
      if (date < start) continue;
      points.push({ date, value: numeric(bucket.values[metric.id]) });
    }
    return points;
  }

  const points: TrendPoint[] = [];
  for (const bucket of months) {
    const date = bucket.end > today ? today : bucket.end;
    if (date < start) continue;
    points.push({ date, value: monthValue(metric, bucket) });
  }
  return points;
}

/** The fixed value scale (05-design.md §5: starts at zeroAt or 0). */
export function valueDomain(metric: ResolvedMetric, series: readonly TrendPoint[]): TrendDomain {
  const numbers = series
    .map((point) => point.value)
    .filter((value): value is number => value !== null);

  let min = 0;
  let target: number | null = null;
  switch (metric.score.curve) {
    case 'ramp':
      min = metric.score.zeroAt ?? 0;
      target = metric.score.target;
      break;
    case 'counter':
      target = metric.score.target;
      break;
    case 'range':
      target = metric.score.good ?? metric.score.target;
      break;
    case 'trend':
      target = 0;
      min = Math.min(0, ...numbers);
      break;
    case 'step':
      target = 1;
      break;
  }

  let max = Math.max(target ?? 0, ...numbers);
  if (!Number.isFinite(max) || max <= min) max = min + 1;
  return { min, max, target, lowerIsBetter: metric.score.curve === 'range' };
}

/** The 30-day hit-rate, with the noun the metric's cadence asks for. */
export function trendRate(
  metric: ResolvedMetric,
  series: readonly TrendPoint[],
  history: readonly Day[],
  metrics: readonly ResolvedMetric[],
  settings: Settings
): TrendRate {
  if (metric.cadence === 'daily') {
    return { ...hitRate(metric.id, history.slice(-HIT_RATE_DAYS), metrics, settings), unit: 'days' };
  }

  const last = history[history.length - 1]?.date;
  const cutoff = last ? addDays(last, -(HIT_RATE_DAYS - 1)) : '';
  let met = 0;
  let total = 0;
  for (const point of series) {
    if (point.value === null || point.date < cutoff) continue;
    // A toggle is plotted as 1/0; scoring needs the boolean back.
    const value = metric.widget === 'toggle' ? point.value > 0 : point.value;
    const score = scoreMetric(metric, value, settings);
    if (score === null) continue;
    total++;
    if (score >= HIT) met++;
  }

  return {
    met,
    total,
    rate: total > 0 ? met / total : 0,
    unit: metric.cadence === 'weekly' ? 'weeks' : 'months'
  };
}

export function trendsModel(options: TrendsOptions): TrendsModel {
  const { today, metrics, settings, window } = options;
  const history = [...options.days]
    .filter((day) => day.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const windowDays = history.slice(-window);
  const consistencyDays = history.slice(-CONSISTENCY_DAYS);
  const weeks = weekBuckets(history, settings);
  const months = monthBuckets(history);

  const groups = PILLARS.map((pillar) => ({
    pillar,
    label: PILLAR_LABEL[pillar],
    rows: metrics
      .filter((metric) => metric.visible && metric.pillar === pillar)
      .map((metric) => {
        const series = seriesFor(metric, history, windowDays, weeks, months, today);
        const present = series.filter((point) => point.value !== null);
        return {
          metric,
          series,
          latest: present[present.length - 1] ?? null,
          rate: trendRate(metric, series, history, metrics, settings),
          domain: valueDomain(metric, series)
        };
      }),
    consistency: consistencyDays.map((day) => pillarDayScore(day, pillar, metrics, settings)),
    offset: consistencyDays[0]
      ? (weekdayIndex(consistencyDays[0].date) - settings.weekStartsOn + 7) % 7
      : 0
  }));

  return {
    window,
    start: windowDays[0]?.date ?? today,
    end: today,
    groups,
    insights: buildInsights({ days: history, metrics, settings })
  };
}

/** The point a click at `fraction` (0–1) of the chart's width selects. */
export function nearestIndex(series: readonly TrendPoint[], fraction: number): number | null {
  if (series.length === 0) return null;
  const clamped = Math.max(0, Math.min(1, fraction));
  return Math.round(clamped * (series.length - 1));
}

/**
 * The next point with a value in a direction, for the arrow keys. Stays put at
 * the edge rather than wrapping, so a held key cannot fly across the chart.
 */
export function stepSelection(
  series: readonly TrendPoint[],
  from: string | null,
  direction: 1 | -1
): string | null {
  if (series.length === 0) return null;

  const first = series.findIndex((point) => point.value !== null);
  if (first === -1) return null;

  if (from === null) {
    for (let i = direction === 1 ? 0 : series.length - 1; i >= 0 && i < series.length; i += direction) {
      const point = series[i]!;
      if (point.value !== null) return point.date;
    }
    return null;
  }

  const current = series.findIndex((point) => point.date === from);
  if (current === -1) return series[first]!.date;

  for (let i = current + direction; i >= 0 && i < series.length; i += direction) {
    const point = series[i]!;
    if (point.value !== null) return point.date;
  }
  return from;
}

export function pointAt(series: readonly TrendPoint[], date: string | null): TrendPoint | null {
  if (!date) return null;
  return series.find((point) => point.date === date) ?? null;
}
