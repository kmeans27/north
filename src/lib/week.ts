/* src/lib/week.ts — the Sunday review, as data (04-ux.md §5).
 *
 * Pure: it takes the history, the anchor date and the settings, and returns the
 * week's score, the weekly metric lines, the pillar table and the seven day
 * cells. No Svelte, no clock, no browser API.
 *
 * Pace is informational only and never enters a score (04-ux.md §5):
 * `met / on pace / behind` is a reading of the week in progress, nothing more.
 */

import {
  COVERAGE_OK,
  coverage,
  dayScore,
  pillarScores,
  weekScore,
  type PeriodValues
} from './metrics/aggregate';
import { addDays, diffDays, startOfWeek, weekdayNarrow } from './metrics/dates';
import { weeklyValues } from './metrics/derived';
import { PILLARS, PILLAR_LABEL } from './metrics/registry';
import { scoreMetric } from './metrics/score';
import type { Day, Pillar, ResolvedMetric, Settings } from './metrics/types';

export const WEEK_LENGTH = 7;

/** A perfect score with float dust. */
const HIT = 100 - 1e-9;

/** `met` is the target reached; `on pace` is the current week's arithmetic. */
export type WeeklyStatus = 'met' | 'on pace' | 'behind' | 'none';

export interface WeeklyDots {
  filled: number;
  total: number;
}

export interface WeeklyLine {
  metric: ResolvedMetric;
  /** The week's value, or null when the week has no data for it. */
  value: number | null;
  target: number;
  /** A counter reads as dots: two filled of two. Other curves have none. */
  dots: WeeklyDots | null;
  status: WeeklyStatus;
  /** Whole units above target, for the quiet `+1` next to a met line. */
  extra: number;
}

export interface WeekDayCell {
  date: string;
  /** `M T W T F S S` (04-ux.md §5). */
  weekday: string;
  score: number | null;
  /** Ink density for the bar: score / 100, or null when there is no score. */
  fill: number | null;
  future: boolean;
  today: boolean;
}

export interface PillarRow {
  pillar: Pillar;
  label: string;
  score: number | null;
  previous: number | null;
  /** Rounded difference, so `81 → 74` reads `+7`, never `+7.4`. */
  delta: number | null;
}

export interface WeekModel {
  start: string;
  end: string;
  score: number | null;
  previousScore: number | null;
  /** `+6` / `−4` / 0, or null when either week has no score. */
  delta: number | null;
  weekly: WeeklyLine[];
  pillars: PillarRow[];
  days: WeekDayCell[];
  /** Days in this week at 70 % coverage: the week score's sample size. */
  loggedDays: number;
}

export interface WeekOptions {
  /** Any date inside the week to show. */
  anchor: string;
  /** Today's logical date. */
  today: string;
  /** History, oldest first. May extend before and after the week. */
  days: readonly Day[];
  metrics: readonly ResolvedMetric[];
  settings: Settings;
}

/** Whole days of the week that have happened, 0–7. Used only for pace. */
export function elapsedDays(start: string, end: string, today: string): number {
  if (today < start) return 0;
  const last = today > end ? end : today;
  return Math.max(0, Math.min(WEEK_LENGTH, diffDays(start, last) + 1));
}

/**
 * `met` / `on pace` / `behind` (04-ux.md §5). A counter is on pace when its
 * value has kept up with the elapsed share of the week. A rate such as the
 * weight trend has no pace to keep, so it is either met or behind.
 */
export function weeklyStatus(
  metric: ResolvedMetric,
  value: number | null,
  elapsed: number,
  settings: Settings
): WeeklyStatus {
  if (value === null) return 'none';
  const score = scoreMetric(metric, value, settings);
  if (score === null) return 'none';
  if (score >= HIT) return 'met';

  const target = metric.score.target;
  if (metric.score.curve !== 'counter' || !Number.isFinite(target) || target <= 0) return 'behind';

  const fraction = Math.max(0, Math.min(1, elapsed / WEEK_LENGTH));
  return value >= target * fraction ? 'on pace' : 'behind';
}

/** A period value as a plain number; booleans read as 1 / 0. */
function numeric(value: number | boolean | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === true) return 1;
  if (value === false) return 0;
  return null;
}

/** The three weekly metrics, in registry order, as the table shows them. */
export function weeklyLines(
  metrics: readonly ResolvedMetric[],
  settings: Settings,
  weekly: PeriodValues,
  elapsed: number
): WeeklyLine[] {
  return metrics
    .filter((metric) => metric.visible && metric.cadence === 'weekly')
    .map((metric) => {
      const value = numeric(weekly[metric.id]);
      const target = metric.score.target;
      const total = Math.max(1, Math.round(target));
      const dots =
        metric.score.curve === 'counter' && Number.isFinite(target)
          ? { filled: Math.min(total, Math.max(0, Math.round(value ?? 0))), total }
          : null;

      return {
        metric,
        value,
        target,
        dots,
        status: weeklyStatus(metric, value, elapsed, settings),
        extra: value !== null && value > target ? Math.round((value - target) * 100) / 100 : 0
      };
    });
}

function round(value: number): number {
  return Math.round(value);
}

/** The whole week: score, comparison, weekly lines, pillars and day cells. */
export function weekModel(options: WeekOptions): WeekModel {
  const { today, metrics, settings } = options;
  const days = [...options.days].sort((a, b) => a.date.localeCompare(b.date));

  const start = startOfWeek(options.anchor, settings.weekStartsOn);
  const end = addDays(start, WEEK_LENGTH - 1);
  const previousStart = addDays(start, -WEEK_LENGTH);
  const previousEnd = addDays(start, -1);

  const inWeek = days.filter((day) => day.date >= start && day.date <= end);
  const previousDays = days.filter((day) => day.date >= previousStart && day.date <= previousEnd);

  const weekly = weeklyValues({
    week: inWeek,
    history: days.filter((day) => day.date <= end)
  });
  const previousWeekly = weeklyValues({
    week: previousDays,
    history: days.filter((day) => day.date <= previousEnd)
  });

  const score = weekScore(inWeek, metrics, settings, weekly);
  const previousScore = weekScore(previousDays, metrics, settings, previousWeekly);

  const currentPillars = pillarScores(inWeek, metrics, settings, weekly);
  const previousPillars = pillarScores(previousDays, metrics, settings, previousWeekly);

  const byDate = new Map(days.map((day) => [day.date, day]));
  const cells: WeekDayCell[] = [];
  for (let offset = 0; offset < WEEK_LENGTH; offset++) {
    const date = addDays(start, offset);
    const day = byDate.get(date);
    const dayValue = day ? dayScore(day, metrics, settings) : null;
    cells.push({
      date,
      weekday: weekdayNarrow(date),
      score: dayValue,
      fill: dayValue === null ? null : Math.max(0, Math.min(1, dayValue / 100)),
      future: date > today,
      today: date === today
    });
  }

  return {
    start,
    end,
    score,
    previousScore,
    delta:
      score === null || previousScore === null ? null : round(score) - round(previousScore),
    weekly: weeklyLines(metrics, settings, weekly, elapsedDays(start, end, today)),
    pillars: PILLARS.map((pillar) => {
      const now = currentPillars[pillar];
      const before = previousPillars[pillar];
      return {
        pillar,
        label: PILLAR_LABEL[pillar],
        score: now,
        previous: before,
        delta: now === null || before === null ? null : round(now) - round(before)
      };
    }),
    days: cells,
    loggedDays: inWeek.filter((day) => coverage(day, metrics) >= COVERAGE_OK).length
  };
}
