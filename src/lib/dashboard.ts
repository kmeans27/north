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
import { addDays, startOfWeek, weekKey } from './metrics/dates';
import { monthlyValues, sleepConsistency, weeklyValues } from './metrics/derived';
import { PILLARS, PILLAR_LABEL } from './metrics/registry';
import { scoreMetric } from './metrics/score';
import type { Day, MetricId, Pillar, ResolvedMetric, Settings, Value } from './metrics/types';
import { formatValue } from './format';
import { controlFor, rowValue, scoreTone, type RowControl, type RowValue } from './today';
/** Days drawn in the hero's area and in a panel header's sparkline. */
export const SPARK_DAYS = 30;
/** Days drawn in a panel row's bar chart. */
export const PANEL_DAYS = 14;
/** Weeks drawn for a weekly metric. */
export const WEEK_BARS = 6;
/** The window a panel's headline figure is read over. */
export const PANEL_WINDOW = 28;

/** Columns in the board's tile grid (`docs/V2.1.md` §3). */
export const BOARD_COLUMNS = 12;

/**
 * The board, as rows of `[metric, span]`.
 *
 * This table *is* the design (docs/V2.1.md §3): the span is a metric's weight
 * made visible — sleep (0.10) and deep blocks (0.13) are the width of three
 * compact tiles, `learned` (0.09) has to hold its note field, and the monthly
 * figures sit two-up. It is written out rather than computed so a change to it
 * is a deliberate act, and `dashboard.test.ts` holds two lines: every row adds
 * up to `BOARD_COLUMNS`, and every metric has exactly one tile.
 */
export const BOARD: Readonly<Record<Pillar, readonly (readonly (readonly [MetricId, number])[])[]>> = {
  body: [
    [
      ['sleep_hours', 4],
      ['protein', 3],
      ['greens', 3],
      ['sleep_consistency', 2]
    ],
    [
      ['steps', 2],
      ['strength_sessions', 2],
      ['daylight_days', 2],
      ['weight_trend', 2],
      ['creatine', 2],
      ['alcohol', 2]
    ]
  ],
  mind: [[['deep_blocks', 4], ['learned', 5], ['read', 3]]],
  attention: [[['phone_total', 3], ['social_min', 3], ['distraction_min', 3], ['adult', 3]]],
  capital: [[['savings_rate', 6], ['invested', 6]]]
};

/**
 * The tone a tile's score figure takes. Same reading as a bar: nothing to say
 * (60–89) is the category hue, 90+ is the accent, and a low day is `warn`.
 * There is no red figure — red arrives only after three low days, in the hero.
 */
export type TileTone = 'accent' | 'pillar' | 'warn';

export function tileTone(score: number | null): TileTone | null {
  if (score === null) return null;
  if (score >= 90) return 'accent';
  if (score >= 60) return 'pillar';
  return 'warn';
}

/** A tile as the board places it: the metric and the columns it takes. */
export interface TileLayout {
  id: MetricId;
  span: number;
}


export type ChartKind = 'none' | 'bars';

/**
 * How a single bar is coloured: the day it stands for, judged by its own score.
 * `pillar` means "fine, nothing to say" and draws the tile's category hue — the
 * bands 90+ (`accent`) and 40–59 (`warn`) are the ones worth spotting
 * (03-scoring.md §4). There is no red bar: three low days is the only red in the
 * system, and a bar chart is not where shame belongs (D22).
 */
export type BarTone = 'accent' | 'pillar' | 'warn';

export interface ChartSpec {
  kind: ChartKind;
  /** Raw units, oldest first. `null` is a day with no data — a gap, never a zero. */
  points: (number | null)[];
  /** One tone per point, aligned with `points`; `null` where there is no value. */
  tones: (BarTone | null)[];
  /** The target, drawn as a hairline the bars want to reach. */
  target: number | null;
  /**
   * The value at which the metric scores zero: a `range`'s `bad`, a `ramp` or
   * `counter`'s `stretch`. The chart never zooms out past it, so one wild day
   * cannot flatten the other thirteen.
   */
  ceiling: number | null;
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
  /**
   * The score of `shown` — the tile's badge. It is deliberately *not* the day's
   * stored score: a weekly metric shows the week's figure, so it must carry the
   * week's score, or the badge and the figure contradict each other.
   */
  score: number | null;
  /** What the control shows: the month's figure for a monthly metric, else the day's. */
  controlValue: Value;
  /** The inline control, for a metric you log by hand. No chart then. */
  control: RowControl | null;
  chart: ChartSpec;
  /** The metric's own score, one point per day, oldest first — the tile's line. */
  trend: (number | null)[];
  /** Columns this metric's tile takes in `BOARD` (docs/V2.1.md §3). */
  span: number;
  /** The target in words, or `null` when the metric has no scale to state. */
  goal: string | null;
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
  /** The same metrics, laid out as the board's rows (docs/V2.1.md §3). */
  rows: PanelMetric[][];
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

/**
 * The inline control a panel row offers, or `null` for a value-and-chart row.
 *
 * - A **daily** test with cells is one tap, so the control *is* its readout.
 * - A **daily** number is typed, not tapped: it shows the figure and a chart.
 * - A **weekly** metric logs into a day, which would read as "sessions today"
 *   under a label that says `/wk`: it shows the figure and a chart.
 * - A **monthly** metric has no chart and no other way in — `/log` never shows
 *   it — so the dashboard is where the month's figure is entered.
 */
export function inlineControl(metric: ResolvedMetric): RowControl | null {
  if (!metric.visible) return null;
  const control = controlFor(metric.widget);
  if (control === null) return null;

  if (metric.cadence === 'daily') return control === 'number' ? null : control;
  if (metric.cadence === 'monthly') return control;
  return null;
}

/** The metric rows one taps by hand on any given day — the nine. */
export function handLogged(metrics: readonly ResolvedMetric[]): ResolvedMetric[] {
  return metrics.filter(
    (metric) =>
      metric.cadence === 'daily' &&
      metric.source === 'manual' &&
      inlineControl(metric) !== null
  );
}

const NO_CHART: ChartSpec = {
  kind: 'none',
  points: [],
  tones: [],
  target: null,
  ceiling: null,
  lowerIsBetter: false,
  unit: '',
  decimals: 0,
  caption: ''
};

/**
 * The value at which the metric scores nothing (`types.ts` — `bad` for a
 * `range`, `stretch` for a `ramp` or `counter`). A chart scales itself to the
 * window but stops here, so the y-axis stays inside the metric's own range and
 * a single outlier day cannot flatten the rest. `stretch` is display framing by
 * design, which is exactly what a bar chart is.
 */
export function chartCeiling(metric: ResolvedMetric): number | null {
  const spec = metric.score;
  if (spec.curve === 'range') return finite(spec.bad);
  if (spec.curve === 'ramp' || spec.curve === 'counter') {
    return finite(spec.stretch) ?? finite(spec.target);
  }
  return finite(spec.target);
}

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
  const base = {
    target,
    ceiling: chartCeiling(metric),
    lowerIsBetter: lower,
    unit: metric.unit,
    decimals: metric.decimals ?? 0
  };

  if (metric.cadence === 'weekly') {
    const points = weeklySeries(metric.id, options.days, options.settings);
    return {
      ...base,
      kind: 'bars',
      points,
      tones: barTones(metric, points, options.settings),
      caption: `${WEEK_BARS} weeks`
    };
  }

  const noun = metric.unit === 'k' ? 'days' : metric.unit === 'h' ? 'nights' : 'days';
  const points = dailySeries(metric, options.days, PANEL_DAYS);
  return {
    ...base,
    kind: 'bars',
    points,
    tones: barTones(metric, points, options.settings),
    caption: `${PANEL_DAYS} ${noun}`
  };
}

/**
 * The colour of each bar: the raw value scored, then read through the canonical
 * band tone. `ink` (60–89 — fine, unremarkable) becomes the tile's category hue,
 * so a chart reads as its pillar with the good days and the slipping days
 * standing out. A day with no value keeps no tone: it is a gap.
 */
function barTones(
  metric: ResolvedMetric,
  points: readonly (number | null)[],
  settings: Settings
): (BarTone | null)[] {
  return points.map((point) => {
    if (point === null) return null;
    const score = scoreMetric(metric, point, settings);
    if (score === null) return null;
    /* `ink` is a pillar's own hue and `bad` is not a bar: red is the hero's
       three-low-days signal, not a fortnight's worth of judgement (D22). */
    const tone = scoreTone(score, []);
    if (tone === 'accent') return 'accent';
    if (tone === 'warn' || tone === 'bad') return 'warn';
    return 'pillar';
  });
}

/* ─── The panels ──────────────────────────────────────────────────────────── */

/** Days in the window at >= 70 % coverage: `n` for the panel header. */
function trust(days: readonly Day[], metrics: readonly ResolvedMetric[]): number {
  return days.filter((day) => coverage(day, metrics) >= COVERAGE_OK).length;
}

/**
 * The metric's own score, one point per day over the last `count` days — the
 * line a tile draws when no value chart fits or would only repeat the figure.
 *
 * A weekly metric is scored against the week each day sits in (so the line steps
 * once a week, exactly as the metric does), and a monthly metric gets no line at
 * all: one figure a month has no shape. Never stored, always derived on read.
 */
export function metricDailyScores(
  metric: ResolvedMetric,
  options: DashboardOptions,
  count = SPARK_DAYS
): (number | null)[] {
  if (!metric.visible) return [];
  /* A monthly figure repeats; a sparkline of a constant is decoration. */
  if (metric.cadence === 'monthly') return [];

  const days = options.days.slice(-count);
  const { settings } = options;

  if (metric.cadence === 'weekly') {
    /* One value per week, so the week is scored once and reused for its days. */
    const weeks = new Map<string, number | null>();
    return days.map((day) => {
      const key = weekKey(day.date, settings.weekStartsOn);
      if (!weeks.has(key)) {
        const from = startOfWeek(day.date, settings.weekStartsOn);
        const to = addDays(from, 6);
        const week = options.days.filter((candidate) => candidate.date >= from && candidate.date <= to);
        const value = weeklyValues({ week, history: options.days })[metric.id] ?? null;
        weeks.set(key, scoreMetric(metric, value, settings));
      }
      return weeks.get(key) ?? null;
    });
  }

  if (metric.source === 'derived' && metric.cadence === 'daily') {
    return derivedDaily(metric.id, options.days)
      .slice(-count)
      .map((value) => scoreMetric(metric, value, settings));
  }

  return days.map((day) =>
    scoreMetric(metric, valueOf(day, metric.id), settings, { note: day.note ?? null })
  );
}

/**
 * The tile's context line: where the metric is trying to get to, in words and in
 * its own unit. Never a goal of its own invention — every number here is the
 * registry's target, and a metric with no scale (a tick) gets no line at all.
 */
export function goalText(metric: ResolvedMetric): string | null {
  if (metric.bins?.length) return `ideal ${metric.bins[0]!.label}`;
  const spec = metric.score;
  if (spec.curve === 'step') return null;
  if (spec.curve === 'trend') {
    const mode = spec.mode ?? 'maintain';
    return mode === 'cut' ? 'cutting' : mode === 'bulk' ? 'bulking' : 'maintaining';
  }
  if (spec.curve === 'range') {
    return `under ${formatValue(spec.good ?? spec.target, metric.unit, metric.decimals)}`;
  }
  return `target ${formatValue(spec.target, metric.unit, metric.decimals)}`;
}

/**
 * The unit that rides beside a tile's label, or `''`.
 *
 * A bare cell label cannot carry the unit (`4` beside `×32 g`), a typed number
 * prints its own (`8.2 h`), a bin labels itself (`≤ 2h`), and a label that
 * already names the unit keeps it — `Daylight days` plus `days` would read
 * twice, which is what the board did before this rule (docs/V2.1.md §3).
 */
export function tileUnit(metric: ResolvedMetric): string {
  if (!metric.unit || metric.bins?.length || metric.widget === 'number') return '';
  const needle = metric.unit.replace(/[/×]/g, '').trim().toLowerCase();
  const words = ` ${metric.label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  return words.includes(` ${needle} `) ? '' : metric.unit;
}

/**
 * One row of the board, with the hidden metrics taken out and their columns
 * shared among the rest — otherwise hiding a metric in Settings would leave a
 * hole in the grid. Slack always goes to the widest tile first, then round-robin,
 * so the result is deterministic.
 */
export function fillRow(
  specs: readonly (readonly [MetricId, number])[],
  present: ReadonlySet<MetricId>
): TileLayout[] {
  const row: TileLayout[] = specs
    .filter(([id]) => present.has(id))
    .map(([id, span]) => ({ id, span }));
  if (row.length === 0) return row;

  const order = row
    .map((_, index) => index)
    .sort((a, b) => (row[b]!.span - row[a]!.span) || (a - b));

  let slack = BOARD_COLUMNS - row.reduce((total, tile) => total + tile.span, 0);
  for (let step = 0; slack > 0; step++, slack--) {
    row[order[step % order.length]!]!.span += 1;
  }
  return row;
}

/**
 * What a row prints.
 *
 * A period metric prints the period, not the day: `Gym sessions /wk` is the
 * *week's* count, whatever the device wrote onto today, and a monthly figure is
 * the month's, whatever day it was entered on (`aggregate.ts` reads the period,
 * not the day). Everything else prints the day's own value, falling back to a
 * value computed on read. Never invented: nothing logged stays `null`.
 */export function shownValue(metric: ResolvedMetric, options: DashboardOptions): Value {
  const stored = options.day ? valueOf(options.day, metric.id) : null;
  const period = periods(options)[metric.id];
  const hasPeriod = typeof period === 'number' || typeof period === 'boolean';

  if (metric.source === 'derived' && metric.cadence === 'daily') {
    return derivedDaily(metric.id, options.days).at(-1) ?? stored;
  }
  if (metric.cadence === 'weekly' && hasPeriod) return period;
  if (metric.cadence === 'monthly' && hasPeriod) return period;
  return stored;
}

/**
 * The period values the aggregate functions read: this week's weekly metrics,
 * plus this month's monthly ones (`pillarScores` reads both from one map).
 *
 * The week is normally supplied by the caller (the screen already knows which
 * days it is showing). Computing it here when it is missing means a weekly tile
 * can never lose its figure when a caller forgets to pass the week.
 */
function periods(options: DashboardOptions): PeriodValues {
  return { ...(options.weekly ?? weekValues(options)), ...monthlyValues(options.days) };
}

/** The week the viewed day sits in, as `derived.weeklyValues` reads it. */
function weekValues(options: DashboardOptions): PeriodValues {
  const last = options.day?.date ?? options.days.at(-1)?.date;
  if (!last) return {};
  const from = startOfWeek(last, options.settings.weekStartsOn);
  const to = addDays(from, 6);
  const week = options.days.filter((day) => day.date >= from && day.date <= to);
  return weeklyValues({ week, history: options.days });
}

/** One pillar's panel, for the viewed day. */
export function panelFor(pillar: Pillar, options: DashboardOptions): PillarPanel {
  const window = options.days.slice(-PANEL_WINDOW);
  const members = options.metrics.filter((metric) => metric.visible && metric.pillar === pillar);

  const spark = options.days
    .slice(-SPARK_DAYS)
    .map((day) => pillarDayScore(day, pillar, options.metrics, options.settings));

  const score = pillarScores(window, options.metrics, options.settings, periods(options))[pillar];

  const present = new Set(members.map((metric) => metric.id));
  const rows = BOARD[pillar]
    .map((specs) => fillRow(specs, present))
    .filter((row) => row.length > 0)
    .map((row) =>
      row.flatMap((tile) => {
        const metric = members.find((candidate) => candidate.id === tile.id);
        return metric ? [tileFor(metric, tile.span, options)] : [];
      })
    );

  return {
    pillar,
    label: PILLAR_LABEL[pillar],
    score,
    spark,
    /* Coverage only exists for daily metrics: a monthly pillar has no daily
       figure to be confident about. */
    daily: members.some((metric) => metric.cadence === 'daily'),
    n: trust(window, members),
    metrics: rows.flat(),
    rows
  };
}

/** Everything one tile needs, for one metric. */
function tileFor(metric: ResolvedMetric, span: number, options: DashboardOptions): PanelMetric {
  const value = rowValue(options.day, metric, options.settings);
  const shown = shownValue(metric, options);
  return {
    metric,
    value,
    shown,
    score: scoreMetric(metric, shown, options.settings, { note: options.day?.note ?? null }),
    /* A monthly metric is one figure for the whole month and can be written on
       any day of it, so its cells show the month's value, not just this day's. */
    controlValue: metric.cadence === 'monthly' ? shown : value.value,
    control: inlineControl(metric),
    chart: chartFor(metric, options),
    trend: metricDailyScores(metric, options),
    span,
    goal: goalText(metric)
  };
}

/** The whole dashboard, in registry order. */
export function dashboard(options: DashboardOptions): DashboardModel {
  const panels = PILLARS.map((pillar) => panelFor(pillar, options));

  const manual = handLogged(options.metrics);
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
    periods(options)
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
