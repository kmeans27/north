/* src/lib/dashboard.ts — the home screen's shape, as data (docs/V2.md §6).
 *
 * The v2 home screen is a dashboard, not a list: the hero carries the day's
 * composite, and every panel is one pillar of life with its own chart. This
 * module is pure — it takes the day, the history and the settings and returns
 * the panels, the charts and the counts. Nothing here invents a value: every
 * figure comes from the registry or from `aggregate.ts`.
 */

import {
  COVERAGE_OK,
  coverage,
  pillarDayScore,
  pillarScores,
  valueOf,
  type PeriodValues
} from './metrics/aggregate';
import { addDays, startOfWeek } from './metrics/dates';
import { weeklyValues, sleepConsistency } from './metrics/derived';
import { PILLARS, PILLAR_LABEL } from './metrics/registry';
import type { Day, MetricId, Pillar, ResolvedMetric, Settings, Value } from './metrics/types';
import { controlFor, rowValue, type RowControl, type RowValue } from './today';
/** Days drawn in the hero's area and in a panel header's sparkline. */
export const SPARK_DAYS = 30;
/** Days drawn in a panel row's bar chart. */
export const PANEL_DAYS = 14;
/** Weeks drawn for a weekly metric. */
export const WEEK_BARS = 6;
/** The window a panel's headline figure is read over. */
export const PANEL_WINDOW = 28;

export type ChartKind = 'none' | 'bars';

export interface ChartSpec {
  kind: ChartKind;
  /** Raw units, oldest first. `null` is a day with no data — a gap, never a zero. */
  points: (number | null)[];
  /** The target, drawn as a hairline the bars want to reach. */
  target: number | null;
  /** `true` when the metric scores a *low* value as good, so the bars mirror. */
  lowerIsBetter: boolean;
  /** The metric's unit and precision, so a chart can speak for itself. */
  unit: string;
  decimals: number;
  /** Right-hand caption: `14 nights`, `6 weeks`. */
  caption: string;
}

export interface PanelMetric {
  metric: ResolvedMetric;
  /** What is stored on the viewed day. */
  value: RowValue;
  /** What the row prints: the stored value, else the derived or weekly one. */
  shown: Value;
  /** The inline control, for a metric you log by hand. No chart then. */
  control: RowControl | null;
  chart: ChartSpec;
}

export interface PillarPanel {
  pillar: Pillar;
  label: string;
  /** The panel's headline figure: the pillar's mean over the window. */
  score: number | null;
  /** The window's daily pillar scores, oldest first; `null` is a day with no score. */
  spark: (number | null)[];
  /** Whether the pillar holds any daily metric at all (capital does not). */
  daily: boolean;
  /** Days in the window at >= 70 % coverage: how much the figure can be trusted. */
  n: number;
  metrics: PanelMetric[];
}

export interface DashboardOptions {
  day: Day | null;
  /** History ending at the viewed day, oldest first. */
  days: readonly Day[];
  metrics: readonly ResolvedMetric[];
  settings: Settings;
  /** This week's weekly-metric values, from `derived.weeklyValues`. */
  weekly?: PeriodValues;
}

export interface DashboardModel {
  /** Registry order. The page decides the display order. */
  panels: PillarPanel[];
  /** Manual metrics with nothing logged yet, in registry order. */
  open: MetricId[];
  logged: number;
  total: number;
}

/* ─── Which metrics carry a chart ─────────────────────────────────────────── */

/** The widgets a row logs in one tap. `number` is typed, not tapped, so it is out. */
const CELL_CONTROLS: readonly RowControl[] = ['triState', 'choice', 'segmented', 'bins'];

/**
 * The inline control a panel row offers, or `null` for a value-and-chart row.
 * Only a *daily* metric: a weekly counter logs into a day, which would read as
 * "sessions today" under a label that says `/wk`.
 */
export function inlineControl(metric: ResolvedMetric): RowControl | null {
  if (!metric.visible || metric.cadence !== 'daily') return null;
  const control = controlFor(metric.widget);
  return control !== null && CELL_CONTROLS.includes(control) ? control : null;
}

/** The metrics one logs by hand on any given day — the nine taps. */
export function handLogged(metrics: readonly ResolvedMetric[]): ResolvedMetric[] {
  return metrics.filter((metric) => metric.source === 'manual' && inlineControl(metric) !== null);
}

const NO_CHART: ChartSpec = {
  kind: 'none',
  points: [],
  target: null,
  lowerIsBetter: false,
  unit: '',
  decimals: 0,
  caption: ''
};

/**
 * Whether the metric scores a low value as good. Read off the curve rather than
 * hardcoded per metric (02-metrics.md §3): a `range` scores `good` at the bottom
 * and `bad` at the top, and a `trend` wants a fall unless the goal is to bulk.
 */
export function lowerIsBetter(metric: ResolvedMetric): boolean {
  const spec = metric.score;
  if (spec.curve === 'range') return true;
  if (spec.curve === 'trend') return spec.mode !== 'bulk';
  return false;
}

/** A finite number, or `null` for "no data" — a gap is never a zero (D3). */
function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** One raw value per day, oldest first, over the last `count` days. */
function dailySeries(metric: ResolvedMetric, days: readonly Day[], count: number): (number | null)[] {
  if (metric.source === 'derived') return derivedDaily(metric.id, days).slice(-count);
  return days.slice(-count).map((day) => finite(valueOf(day, metric.id)));
}

/**
 * A metric computed on read, one point per day. Only sleep regularity is a
 * daily one: its seven-night window is re-run for each day so the shape is the
 * history of the figure, not a stored value that never existed.
 */
function derivedDaily(id: MetricId, days: readonly Day[]): (number | null)[] {
  if (id !== 'sleep_consistency') return [];
  return days.map((_, index) => sleepConsistency(days.slice(0, index + 1)).value);
}

/** One value per week, oldest first, for the last `WEEK_BARS` weeks. */
function weeklySeries(id: MetricId, days: readonly Day[], settings: Settings): (number | null)[] {
  const last = days[days.length - 1]?.date;
  if (!last) return [];
  const thisWeek = startOfWeek(last, settings.weekStartsOn);
  const out: (number | null)[] = [];

  for (let back = WEEK_BARS - 1; back >= 0; back--) {
    const from = addDays(thisWeek, -7 * back);
    const to = addDays(from, 6);
    const week = days.filter((day) => day.date >= from && day.date <= to);
    out.push(finite(weeklyValues({ week, history: days })[id]));
  }

  return out;
}

/**
 * The chart a panel row carries. A metric you log by hand shows its control
 * instead — the control *is* its readout, so a chart would only repeat it. A
 * monthly value has too few points to draw a shape from, so it stays a figure.
 */
export function chartFor(metric: ResolvedMetric, options: DashboardOptions): ChartSpec {
  if (!metric.visible) return NO_CHART;
  if (inlineControl(metric) !== null) return NO_CHART;
  if (metric.cadence === 'monthly') return NO_CHART;
  if (metric.widget !== 'number' && metric.widget !== 'counter') return NO_CHART;
  /* A trend is a signed slope: a bar chart from a zero baseline cannot draw it,
     and the figure is the whole story. */
  if (metric.score.curve === 'trend') return NO_CHART;

  const lower = lowerIsBetter(metric);
  /* A target of zero is the baseline itself: a hairline there says nothing. */
  const raw = metric.score.target;
  const target = Number.isFinite(raw) && raw !== 0 ? raw : null;
  const base = { target, lowerIsBetter: lower, unit: metric.unit, decimals: metric.decimals ?? 0 };

  if (metric.cadence === 'weekly') {
    return {
      ...base,
      kind: 'bars',
      points: weeklySeries(metric.id, options.days, options.settings),
      caption: `${WEEK_BARS} weeks`
    };
  }

  const noun = metric.unit === 'k' ? 'days' : metric.unit === 'h' ? 'nights' : 'days';
  return {
    ...base,
    kind: 'bars',
    points: dailySeries(metric, options.days, PANEL_DAYS),
    caption: `${PANEL_DAYS} ${noun}`
  };
}

/* ─── The panels ──────────────────────────────────────────────────────────── */

/** Days in the window at >= 70 % coverage: `n` for the panel header. */
function trust(days: readonly Day[], metrics: readonly ResolvedMetric[]): number {
  return days.filter((day) => coverage(day, metrics) >= COVERAGE_OK).length;
}

/**
 * What a row prints. The stored value wins; a metric that is only ever computed
 * on read falls back to its own derivation, and a weekly or monthly value to the
 * period figure. Never invented: a day with nothing stays `null`.
 */
export function shownValue(metric: ResolvedMetric, options: DashboardOptions): Value {
  if (options.day) {
    const stored = valueOf(options.day, metric.id);
    if (stored !== null) return stored;
  }
  if (metric.source === 'derived' && metric.cadence === 'daily') {
    return derivedDaily(metric.id, options.days).at(-1) ?? null;
  }
  const period = (options.weekly ?? {})[metric.id];
  return typeof period === 'number' || typeof period === 'boolean' ? period : null;
}

/** One pillar's panel, for the viewed day. */
export function panelFor(pillar: Pillar, options: DashboardOptions): PillarPanel {
  const window = options.days.slice(-PANEL_WINDOW);
  const members = options.metrics.filter((metric) => metric.visible && metric.pillar === pillar);

  const spark = options.days
    .slice(-SPARK_DAYS)
    .map((day) => pillarDayScore(day, pillar, options.metrics, options.settings));

  const score = pillarScores(window, options.metrics, options.settings, options.weekly ?? {})[pillar];

  return {
    pillar,
    label: PILLAR_LABEL[pillar],
    score,
    spark,
    /* Coverage only exists for daily metrics: a monthly pillar has no daily
       figure to be confident about. */
    daily: members.some((metric) => metric.cadence === 'daily'),
    n: trust(window, members),
    metrics: members.map((metric) => {
      const control = inlineControl(metric);
      return {
        metric,
        value: rowValue(options.day, metric, options.settings),
        shown: control === null ? shownValue(metric, options) : rowValue(options.day, metric, options.settings).value,
        control,
        chart: chartFor(metric, options)
      };
    })
  };
}

/** The whole dashboard, in registry order. */
export function dashboard(options: DashboardOptions): DashboardModel {
  const panels = PILLARS.map((pillar) => panelFor(pillar, options));

  const manual = handLogged(options.metrics).filter((metric) => metric.cadence === 'daily');
  const view: Day = options.day ?? { date: '', tz: '', values: {} };
  const done = manual.filter((metric) => valueOf(view, metric.id) !== null);

  return {
    panels,
    open: manual.filter((metric) => !done.includes(metric)).map((metric) => metric.id),
    logged: done.length,
    total: manual.length
  };
}

/**
 * The order the panels are read in: the part of life that needs attention first.
 * Read on the 28-day figure so it moves week to week, not tap to tap — and the
 * page freezes it per visit anyway, so nothing shifts while you log.
 */
export function panelOrder(options: DashboardOptions): Pillar[] {
  const scores = pillarScores(
    options.days.slice(-PANEL_WINDOW),
    options.metrics,
    options.settings,
    options.weekly ?? {}
  );

  /* Compared rounded, so the order matches the figures on the screen: two
     pillars that both read 100 must not swap over a floating-point remainder. */
  const key = (pillar: Pillar): number | null => {
    const score = scores[pillar];
    return score === null ? null : Math.round(score);
  };

  return [...PILLARS].sort((a, b) => {
    const left = key(a);
    const right = key(b);
    if (left === null && right === null) return PILLARS.indexOf(a) - PILLARS.indexOf(b);
    if (left === null) return 1;
    if (right === null) return -1;
    if (left === right) return PILLARS.indexOf(a) - PILLARS.indexOf(b);
    return left - right;
  });
}
