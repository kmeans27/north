/* src/lib/today.ts — the Today screen's shape, as data (04-ux.md §2).
 *
 * Pure: it takes the day, the history and the settings, and returns the row
 * order, the controls and the score header. The order is a snapshot, since
 * "nothing re-orders while you are tapping" (D18) — the page freezes it on mount.
 */

import {
  COVERAGE_OK,
  coverage,
  dayPresence,
  dayScore,
  isPresent,
  pillarScores,
  valueOf,
  weakestMetricInPillar,
  type PeriodValues
} from './metrics/aggregate';
import { addDays, diffDays } from './metrics/dates';
import { logStreak } from './metrics/derived';
import { formatValue } from './format';
import { MIN_N } from './insights/rules';
import { PILLARS, PILLAR_LABEL } from './metrics/registry';
import { scoreMetric } from './metrics/score';
import type { Day, MetricId, Pillar, ResolvedMetric, Settings, Value, Widget } from './metrics/types';

/** The control a widget renders as (04-ux.md §3). */
export type RowControl = 'triState' | 'choice' | 'segmented' | 'bins' | 'number';

export function controlFor(widget: Widget): RowControl | null {
  switch (widget) {
    case 'toggle':
      return 'triState';
    case 'counter':
      return 'choice';
    case 'segmented':
      return 'segmented';
    case 'bins':
      return 'bins';
    case 'number':
      return 'number';
    case 'note':
      return null;
  }
}

/** Rows shown before the `+ n more` expander on a 390 × 844 screen (04-ux.md §2). */
export const TODAY_ROW_LIMIT = 6;
/** Window for the score header's second figure. */
export const SEVEN_DAY = 7;
/** Window for the score header's sparkline. */
export const SPARKLINE_DAYS = 30;
/** Longest run of `+n` cells a keyboard number key can reach (04-ux.md §4). */
export const MAX_OPTIONS = 7;

/** A past day can be read or corrected for 30 days; older is read-only (04-ux.md §1). */
export const EDIT_WINDOW_DAYS = 30;

/**
 * Whether the viewed day accepts writes. The 30-day window is inclusive: a day
 * exactly 30 days old can still be corrected.
 */
export function canEditDay(date: string | null, today: string): boolean {
  if (!date || !today) return true;
  const age = diffDays(date, today);
  return age >= 0 && age <= EDIT_WINDOW_DAYS;
}

export interface TodayOptions {
  day: Day | null;
  /** History ending at the viewed day, oldest first. */
  days: readonly Day[];
  metrics: readonly ResolvedMetric[];
  settings: Settings;
  /** This week's weekly-metric values, from derived.weeklyValues. */
  weekly?: PeriodValues;
  /** Values computed on read rather than stored: sleep consistency, weigh-ins. */
  derived?: PeriodValues;
  limit?: number;
}

export interface OrderedRows {
  /** Unlogged manual metrics, registry order (group 1). */
  needsYou: MetricId[];
  /** Logged manual metrics, dimmed (group 2). */
  logged: MetricId[];
  /** Weekly metrics with data that have not reached their target yet (group 3). */
  weekly: MetricId[];
  /** needsYou ⧺ logged ⧺ weekly — the tap order that never re-orders (D18). */
  order: MetricId[];
  /** The first `limit` of `order`; the rest sit behind the expander. */
  visible: MetricId[];
  hidden: MetricId[];
  /** The automatic strip: visible non-manual metrics that have data. */
  auto: MetricId[];
  /** `9 items` in the section header. */
  needsYouCount: number;
}

const isDaily = (metric: ResolvedMetric): boolean => metric.cadence === 'daily';
const isManual = (metric: ResolvedMetric): boolean =>
  metric.source === 'manual' && controlFor(metric.widget) !== null;

/** A period value that can be read: a finite number or a boolean. */
function hasPeriodValue(value: number | boolean | undefined): value is number | boolean {
  if (typeof value === 'boolean') return true;
  return typeof value === 'number' && Number.isFinite(value);
}

/** A weekly metric is "not yet met" when it has data below a perfect score. */
function weeklyNotMet(
  metrics: readonly ResolvedMetric[],
  settings: Settings,
  weekly: PeriodValues
): MetricId[] {
  return metrics
    .filter((metric) => metric.cadence === 'weekly' && metric.visible)
    .filter((metric) => {
      const value = weekly[metric.id];
      if (!hasPeriodValue(value)) return false;
      const score = scoreMetric(metric, value, settings);
      return score !== null && score < 100;
    })
    .map((metric) => metric.id);
}

/**
 * The row order for the viewed day (04-ux.md §2). Called once per mount: the
 * page keeps the resulting order even as values change under it.
 */
export function todayOrder(options: TodayOptions): OrderedRows {
  const { day, metrics, settings, weekly = {}, derived = {} } = options;
  const limit = options.limit ?? TODAY_ROW_LIMIT;
  const view: Day = day ?? { date: '', tz: 'UTC', values: {} };

  const needsYou: MetricId[] = [];
  const logged: MetricId[] = [];
  for (const metric of metrics) {
    if (!metric.visible || !isDaily(metric) || !isManual(metric)) continue;
    if (isPresent(view, metric.id)) logged.push(metric.id);
    else needsYou.push(metric.id);
  }

  const weeklyRows = weeklyNotMet(metrics, settings, weekly);
  const order = [...needsYou, ...logged, ...weeklyRows];

  const auto = metrics
    .filter((metric) => metric.visible && !isManual(metric))
    .filter((metric) =>
      isDaily(metric)
        ? isPresent(view, metric.id) || hasPeriodValue(derived[metric.id])
        : hasPeriodValue(weekly[metric.id]) || hasPeriodValue(derived[metric.id])
    )
    .map((metric) => metric.id);

  return {
    needsYou,
    logged,
    weekly: weeklyRows,
    order,
    visible: order.slice(0, limit),
    hidden: order.slice(limit),
    auto,
    needsYouCount: order.length
  };
}

/* ─── Score header (04-ux.md §2, 05-design.md §4) ─────────────────────────── */

export interface ScoreHeaderModel {
  /** Today's composite, or null below 25 % coverage (03-scoring.md §2). */
  day: number | null;
  /** The previous logical day's composite, for the live announcement. */
  previous: number | null;
  /** Mean of the qualifying day scores over the last 7 logical days. */
  sevenDay: number | null;
  /** Consecutive logged days (03-scoring.md §5). */
  streak: number;
  /** Up to 30 daily scores, oldest first; null marks a day with no score. */
  sparkline: (number | null)[];
  /**
   * The viewed day and the two before it, oldest first. `null` is a day with no
   * score, so the red gate can tell "three days low" from "two days low".
   */
  recent: (number | null)[];
  /** Coverage of the viewed day, for the "not enough logged" line. */
  coverage: number;
  logged: number;
  total: number;
}

/** A day enters the 7-day average only at 70 % coverage (03-scoring.md §2, D8). */
function averagingScore(
  day: Day,
  metrics: readonly ResolvedMetric[],
  settings: Settings
): number | null {
  return coverage(day, metrics) >= COVERAGE_OK ? dayScore(day, metrics, settings) : null;
}

export function scoreHeader(options: TodayOptions): ScoreHeaderModel {
  const { day, days, metrics, settings } = options;
  const view: Day = day ?? { date: '', tz: 'UTC', values: {} };

  const scores: (number | null)[] = [];
  for (const candidate of days.slice(-SPARKLINE_DAYS)) {
    scores.push(averagingScore(candidate, metrics, settings));
  }

  // The 7-day figure reads the same window, so it can never disagree with the chart.
  const recent = scores.slice(-SEVEN_DAY).filter((score): score is number => score !== null);
  const sevenDay =
    recent.length > 0 ? recent.reduce((total, score) => total + score, 0) / recent.length : null;

  // The day immediately before the viewed one, wherever it sits in history.
  let previous: number | null = null;
  for (const candidate of days) {
    if (candidate.date >= view.date) break;
    previous = averagingScore(candidate, metrics, settings);
  }

  const presence = dayPresence(view, metrics);

  return {
    day: dayScore(view, metrics, settings),
    previous,
    sevenDay,
    streak: logStreak(days, metrics),
    sparkline: scores,
    recent: recentDays(view, days, metrics, settings),
    coverage: coverage(view, metrics),
    logged: presence.present,
    total: presence.total
  };
}

/** The viewed day and the two before it, by calendar date; `null` = no score. */
function recentDays(
  view: Day,
  days: readonly Day[],
  metrics: readonly ResolvedMetric[],
  settings: Settings
): (number | null)[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const out: (number | null)[] = [];
  if (!view.date) return out;
  for (let offset = 2; offset >= 0; offset--) {
    const candidate = byDate.get(addDays(view.date, -offset));
    out.push(candidate ? dayScore(candidate, metrics, settings) : null);
  }
  return out;
}

export type ScoreTone = 'accent' | 'ink' | 'warn' | 'bad';

/**
 * The colour a composite may use (03-scoring.md §4). The word is the signal;
 * this is decoration.
 *
 * `recent` is the viewed day and the two before it, oldest first. Red arrives
 * only after three consecutive days below 40 — a single bad day is `--warn`
 * (D22: shame is a bad feedback signal).
 */
export function scoreTone(score: number, recent: readonly (number | null)[]): ScoreTone {
  if (score >= 90) return 'accent';
  if (score >= 60) return 'ink';
  if (score >= 40) return 'warn';
  const lastThree = recent.slice(-3);
  const threeLow =
    lastThree.length === 3 && lastThree.every((day) => day !== null && day < 40);
  return threeLow ? 'bad' : 'warn';
}

/** The `aria-live` line (04-ux.md §12). No colour, no directionless arrows. */
export function scoreAnnouncement(header: ScoreHeaderModel): string {
  if (header.day === null) {
    return header.logged === 0
      ? 'Nothing logged yet today.'
      : `Logged ${header.logged} of ${header.total} today.`;
  }
  const today = Math.round(header.day);
  if (header.previous === null) return `Today ${today}.`;
  const before = Math.round(header.previous);
  if (before === today) return `Today ${today}, level with yesterday.`;
  return `Today ${today}, ${header.day > header.previous ? 'up' : 'down'} from ${before}.`;
}

/* ─── Row values ──────────────────────────────────────────────────────────── */

export interface RowValue {
  value: Value;
  /** Present means "not null": `0` and `false` are logged (D3). */
  logged: boolean;
  score: number | null;
  /** A human edited an auto value; the source dot stays honest (03-scoring.md §7). */
  overridden: boolean;
}

export function rowValue(day: Day | null, metric: ResolvedMetric, settings: Settings): RowValue {
  if (!day) return { value: null, logged: false, score: null, overridden: false };
  const entry = day.values[metric.id];
  const value = entry ? (entry.v ?? null) : null;
  return {
    value,
    logged: valueOf(day, metric.id) !== null,
    score: scoreMetric(metric, value, settings, { note: day.note }),
    overridden: entry?.overridden === true
  };
}

/**
 * The value an `AutoCell` shows: what is stored first, then what was computed on
 * read, then the period value. Strings never reach a strip of figures.
 */
export function autoValue(options: TodayOptions, id: MetricId): number | boolean | null {
  const { day, weekly = {}, derived = {} } = options;
  const stored = day ? valueOf(day, id) : null;
  if (typeof stored === 'number' || typeof stored === 'boolean') return stored;
  const computed = derived[id];
  if (hasPeriodValue(computed)) return computed;
  const period = weekly[id];
  if (hasPeriodValue(period)) return period;
  return null;
}

/** One cell of a row: the glyph, the value it writes, and its spoken name. */
export interface RowOption {
  label: string;
  value: Value;
  /** Spoken label when the visible glyph is a symbol (`·`, `✓`, `✗`). */
  spoken?: string;
}

/** The three states of a toggle, in the order the digit keys reach them. */
export const TRI_STATE: readonly RowOption[] = [
  { label: '·', value: null, spoken: 'unset' },
  { label: '✓', value: true, spoken: 'yes' },
  { label: '✗', value: false, spoken: 'no' }
];

/** Options for a choice row, segmented control, bin row or toggle, as absolute values. */
export function optionsOf(metric: ResolvedMetric): RowOption[] {
  if (metric.widget === 'toggle') {
    return [...TRI_STATE];
  }
  if (metric.widget === 'segmented') {
    // 0 1 2 3+ — `3+` stores 3.5 (04-ux.md §3).
    return [
      { label: '0', value: 0 },
      { label: '1', value: 1 },
      { label: '2', value: 2 },
      { label: '3+', value: 3.5 }
    ];
  }
  if (metric.bins && metric.bins.length > 0) {
    return metric.bins.map((bin) => ({ label: bin.label, value: bin.value }));
  }
  /* A typed number has no cells at all. Building one per step up to the target
     (`0…7000` for steps) would hand `displayValue` a phantom cell label — `4000`
     instead of `4 k` — and would let a digit key write a stray count. */
  if (metric.widget !== 'counter') {
    return [];
  }
  // A counter's meaningful range is 0..target: overshoot never earns more (D7).
  const count = Math.max(1, Math.round(metric.score.target));
  return Array.from({ length: count + 1 }, (_, value) => ({ label: String(value), value }));
}

/**
 * A value as a word: the spoken label of the matching cell (so a toggle reads
 * `yes`/`no`, a bin reads `≤ 2h`, `3+` stays `3+`), else the plain figure.
 */
export function displayValue(metric: ResolvedMetric, value: Value): string {
  if (value === null) return 'unset';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  const option = optionsOf(metric).find((candidate) => candidate.value === value);
  if (option) return option.spoken ?? option.label;
  return formatValue(value, metric.unit, metric.decimals);
}

/** `3.5 h above target` — the stretch framing, shown as text and never as score. */
export function aboveTarget(metric: ResolvedMetric, value: Value): string | null {
  if (typeof value !== 'number') return null;
  const target = metric.score.target;
  if (!Number.isFinite(target) || value <= target) return null;
  const over = value - target;
  const decimals = metric.decimals ?? (Number.isInteger(over) ? 0 : 1);
  const unit = metric.unit ? ` ${metric.unit}` : '';
  return `${over.toFixed(decimals)}${unit} above target`;
}

/* ─── Weakest link (02-metrics.md §6, rule 1) ─────────────────────────────── */

/** Rule 1 reads the last 28 days. */
export const WEAKEST_WINDOW = 28;

export interface WeakestLink {
  pillar: Pillar;
  pillarLabel: string;
  score: number;
  metricId: MetricId;
  label: string;
  lever: string;
  /** Days in the window with coverage >= 70 %: the rule's `n`. */
  n: number;
}

/**
 * The lowest-scoring pillar with enough history, and the lever inside it.
 * Same window, same gate and same `n` as the insight rule (02-metrics.md §6),
 * but shaped for the Today strip: "Attention · 58 — social …".
 */
export function weakestLink(options: TodayOptions): WeakestLink | null {
  const window = options.days.slice(-WEAKEST_WINDOW);
  const n = window.filter((day) => coverage(day, options.metrics) >= COVERAGE_OK).length;
  if (n < MIN_N.weakest) return null;

  const weekly = options.weekly ?? {};
  const scores = pillarScores(window, options.metrics, options.settings, weekly);
  const entries = PILLARS.map((pillar) => [pillar, scores[pillar]] as const).filter(
    (entry): entry is readonly [Pillar, number] => entry[1] !== null
  );
  if (entries.length === 0) return null;

  const [pillar, score] = entries.reduce((worst, entry) => (entry[1] < worst[1] ? entry : worst));
  const weakest = weakestMetricInPillar(window, pillar, options.metrics, options.settings, weekly);
  if (!weakest) return null;

  return {
    pillar,
    pillarLabel: PILLAR_LABEL[pillar],
    score,
    metricId: weakest.metric.id,
    label: weakest.metric.label,
    lever: weakest.metric.lever,
    n
  };
}

