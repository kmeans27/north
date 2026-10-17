/* src/lib/insights/rules.ts — the five deterministic rules (02-metrics.md §6).
 *
 * Rules, not a model: "Nothing is generated, summarised, or phrased by a model"
 * (D26). Every card carries its sample size, no card renders below its stated
 * `n`, and nothing claims causation.
 *
 * Pure. Any function that needs "today" receives it as an argument.
 */

import { formatDateRange, startOfWeek } from '../metrics/dates';
import {
  COVERAGE_OK,
  coverage,
  dayScore,
  pillarScores,
  weakestMetricInPillar,
  weekScore,
  type PeriodValues
} from '../metrics/aggregate';
import { byWeekKey, hitRate, weeklyValues } from '../metrics/derived';
import { PILLAR_LABEL } from '../metrics/registry';
import { scoreMetric } from '../metrics/score';
import type { Day, MetricId, Pillar, ResolvedMetric, Settings } from '../metrics/types';

/* ─── Thresholds, all stated so tests can pin the boundaries ──────────────── */

/** "insights appear after 14 logged days" — the single card before that. */
export const HISTORY_GATE = 14;
export const MAX_CARDS = 5;

/** Each rule's stated minimum sample size: no card renders below it. */
export const MIN_N = {
  weakest: 14,
  momentum: 7,
  /** Rule 3 needs >= 7 days in *each* bucket (02-metrics.md §6). */
  bucket: 7,
  slipping: 7,
  record: 7
} as const;

export const MOMENTUM_DELTA = 4;
export const SLIPPING_RATE = 0.7;
export const ASSOCIATION_RELATIVE = 0.1;
export const ASSOCIATION_ABSOLUTE = 8;
/** Rule 1 and 5 use the 28-day window; rule 4 uses 30 days (02-metrics.md §6). */
const WINDOW_LONG = 28;
const WINDOW_HABIT = 30;

export type InsightRule = 1 | 2 | 3 | 4 | 5;

export interface Insight {
  /** 0 is the "not enough history" state, not one of the five rules. */
  rule: 0 | InsightRule;
  title: string;
  body: string;
  /** Sample size. Always rendered; never invented. */
  n: number;
  pillar?: Pillar;
}

export interface InsightInput {
  /** History ending at today, oldest first. */
  days: readonly Day[];
  metrics: readonly ResolvedMetric[];
  settings: Settings;
  /**
   * Dates excluded as unreliable (a device gap of 3+ days, D9). Treated as
   * `partial`: shown, but never counted in a rule.
   */
  excluded?: ReadonlySet<string>;
}

/* ─── Shared helpers ──────────────────────────────────────────────────────── */

const PILLARS: readonly Pillar[] = ['body', 'mind', 'attention', 'capital'];

function usableDays(input: InsightInput, days: readonly Day[]): Day[] {
  return days.filter(
    (day) => coverage(day, input.metrics) >= COVERAGE_OK && !input.excluded?.has(day.date)
  );
}

function weeklyFor(days: readonly Day[], history: readonly Day[]): PeriodValues {
  return weeklyValues({ week: days, history });
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/* ─── Rule 1 — weakest link ───────────────────────────────────────────────── */

function ruleWeakestLink(input: InsightInput): Insight | null {
  const window = input.days.slice(-WINDOW_LONG);
  const n = usableDays(input, window).length;
  if (n < MIN_N.weakest) return null;

  const weekly = weeklyFor(window, input.days);
  const scores = pillarScores(window, input.metrics, input.settings, weekly);
  const entries = PILLARS.map((pillar) => [pillar, scores[pillar]] as const).filter(
    (entry): entry is readonly [Pillar, number] => entry[1] !== null
  );
  if (entries.length === 0) return null;

  const [pillar, score] = entries.reduce((worst, entry) =>
    entry[1] < worst[1] ? entry : worst
  );
  const lever = weakestMetricInPillar(window, pillar, input.metrics, input.settings, weekly)?.metric
    .lever;

  return {
    rule: 1,
    title: 'Weakest link',
    body: `Weakest link: ${PILLAR_LABEL[pillar]} · ${round(score)}${lever ? ` — ${lever}` : ''}`,
    n,
    pillar
  };
}

/* ─── Rule 2 — momentum ───────────────────────────────────────────────────── */

function ruleMomentum(input: InsightInput): Insight[] {
  const recent = input.days.slice(-7);
  const prior = input.days.slice(-14, -7);
  if (recent.length === 0 || prior.length === 0) return [];

  const n = usableDays(input, [...prior, ...recent]).length;
  if (n < MIN_N.momentum) return [];

  const recentScores = pillarScores(recent, input.metrics, input.settings, weeklyFor(recent, input.days));
  const priorScores = pillarScores(prior, input.metrics, input.settings, weeklyFor(prior, input.days));

  const deltas = PILLARS.map((pillar) => {
    const now = recentScores[pillar];
    const before = priorScores[pillar];
    if (now === null || before === null) return null;
    return { pillar, delta: now - before };
  })
    .filter((entry): entry is { pillar: Pillar; delta: number } => entry !== null)
    .filter((entry) => Math.abs(entry.delta) >= MOMENTUM_DELTA)
    .sort((a, b) =>
      Math.abs(b.delta) - Math.abs(a.delta) || PILLARS.indexOf(a.pillar) - PILLARS.indexOf(b.pillar)
    )
    .slice(0, 2);

  return deltas.map(({ pillar, delta }) => ({
    rule: 2 as const,
    title: 'Momentum',
    body: `${PILLAR_LABEL[pillar]} is ${delta > 0 ? 'up' : 'down'} ${round(Math.abs(delta))} points on last week`,
    n,
    pillar
  }));
}

/* ─── Rule 3 — lagged association ─────────────────────────────────────────── */

interface Driver {
  id: MetricId;
  /** Does the day *before* the outcome day fall in the "good" bucket? */
  good: (value: number | boolean) => boolean;
  goodLabel: string;
  badLabel: string;
}

const DRIVERS: readonly Driver[] = [
  {
    id: 'sleep_hours',
    good: (v) => Number(v) >= 7,
    goodLabel: '7 h+ of sleep',
    badLabel: 'under 7 h'
  },
  {
    id: 'alcohol',
    good: (v) => v === true,
    goodLabel: 'a day without alcohol',
    badLabel: 'a day with alcohol'
  },
  {
    id: 'phone_total',
    good: (v) => Number(v) <= 2.5,
    goodLabel: '2.5 h or less of phone',
    badLabel: 'over 2.5 h of phone'
  },
  {
    id: 'social_min',
    good: (v) => Number(v) <= 30,
    goodLabel: '30 min or less of social',
    badLabel: 'over 30 min of social'
  },
  {
    id: 'strength_sessions',
    good: (v) => Number(v) >= 1,
    goodLabel: 'a gym day',
    badLabel: 'no gym'
  }
];

interface Outcome {
  id: MetricId | 'day_score';
  label: string;
  decimals: number;
}

const OUTCOMES: readonly Outcome[] = [
  { id: 'deep_blocks', label: 'deep blocks', decimals: 1 },
  { id: 'day_score', label: 'points', decimals: 0 }
];

interface Association {
  driver: Driver;
  outcome: Outcome;
  goodMean: number;
  badMean: number;
  goodN: number;
  badN: number;
  n: number;
}

function outcomeValue(
  day: Day,
  outcome: Outcome,
  input: InsightInput
): number | null {
  if (outcome.id === 'day_score') return dayScore(day, input.metrics, input.settings);
  const metric = input.metrics.find((m) => m.id === outcome.id);
  if (!metric) return null;
  const entry = day.values[metric.id];
  const value = entry ? (entry.v ?? null) : null;
  if (value === null) return null;
  return scoreMetric(metric, value, input.settings, { note: day.note }) === null
    ? null
    : Number(value);
}

function associations(input: InsightInput): Association[] {
  const usable = usableDays(input, input.days);
  const usableSet = new Set(usable.map((day) => day.date));
  const found: Association[] = [];

  for (const driver of DRIVERS) {
    const driverMetric = input.metrics.find((m) => m.id === driver.id);
    if (!driverMetric) continue;

    for (const outcome of OUTCOMES) {
      const good: number[] = [];
      const bad: number[] = [];

      // Day D's outcome against day D−1's driver: a lagged association.
      for (let i = 1; i < input.days.length; i++) {
        const day = input.days[i]!;
        const previous = input.days[i - 1]!;
        if (!usableSet.has(day.date) || !usableSet.has(previous.date)) continue;

        const entry = previous.values[driver.id];
        const driverValue = entry ? (entry.v ?? null) : null;
        if (driverValue === null || typeof driverValue === 'string') continue;

        const value = outcomeValue(day, outcome, input);
        if (value === null || !Number.isFinite(value)) continue;

        if (driver.good(driverValue as number | boolean)) good.push(value);
        else bad.push(value);
      }

      if (good.length < MIN_N.bucket || bad.length < MIN_N.bucket) continue;

      const mean = (list: number[]): number => list.reduce((a, b) => a + b, 0) / list.length;
      const goodMean = mean(good);
      const badMean = mean(bad);
      const absolute = Math.abs(goodMean - badMean);
      const relative = absolute / Math.max(Math.abs(goodMean), Math.abs(badMean), 1e-9);
      if (relative < ASSOCIATION_RELATIVE && absolute < ASSOCIATION_ABSOLUTE) continue;

      found.push({
        driver,
        outcome,
        goodMean,
        badMean,
        goodN: good.length,
        badN: bad.length,
        n: good.length + bad.length
      });
    }
  }

  // Strongest first; a stable tie-break keeps the output deterministic.
  return found.sort(
    (a, b) =>
      Math.abs(b.goodMean - b.badMean) - Math.abs(a.goodMean - a.badMean) ||
      DRIVERS.indexOf(a.driver) - DRIVERS.indexOf(b.driver) ||
      OUTCOMES.indexOf(a.outcome) - OUTCOMES.indexOf(b.outcome)
  );
}

function ruleAssociation(input: InsightInput): Insight | null {
  const best = associations(input)[0];
  if (!best) return null;

  const { driver, outcome } = best;
  const goodValue = round(best.goodMean, outcome.decimals);
  const badValue = round(best.badMean, outcome.decimals);
  return {
    rule: 3,
    title: 'Pattern in your own history',
    body:
      `On days after ${driver.goodLabel} you average ${goodValue} ${outcome.label}; ` +
      `after ${driver.badLabel}, ${badValue}. (n = ${best.n} days. Correlation, not causation.)`,
    n: best.n
  };
}

/* ─── Rule 4 — slipping habit ─────────────────────────────────────────────── */

/** Binary habits (03-scoring.md §5) plus the two nutrition counters. */
const HABITS: readonly MetricId[] = ['creatine', 'alcohol', 'read', 'learned', 'greens', 'protein'];

function ruleSlipping(input: InsightInput): Insight | null {
  const window = input.days.slice(-WINDOW_HABIT);
  const candidates = HABITS.map((id) => hitRate(id, window, input.metrics, input.settings))
    .filter((rate) => rate.total >= MIN_N.slipping && rate.rate < SLIPPING_RATE)
    .sort((a, b) => a.rate - b.rate || HABITS.indexOf(a.metricId) - HABITS.indexOf(b.metricId));

  const worst = candidates[0];
  if (!worst) return null;

  const metric = input.metrics.find((m) => m.id === worst.metricId);
  if (!metric) return null;

  return {
    rule: 4,
    title: 'Slipping habit',
    body: `${metric.label} met ${worst.met} of ${worst.total} days. The lever: ${metric.lever}`,
    n: worst.total,
    pillar: metric.pillar
  };
}

/* ─── Rule 5 — record ─────────────────────────────────────────────────────── */

function ruleRecord(input: InsightInput): Insight | null {
  const weeks = [...byWeekKey(input.days, input.settings.weekStartsOn).entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1
  );
  if (weeks.length < 2) return null;

  const scored = weeks
    .map(([key, days]) => {
      const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
      const weekly = weeklyValues({ week: sorted, history: input.days });
      const score = weekScore(sorted, input.metrics, input.settings, weekly);
      return score === null ? null : { key, days: sorted, score };
    })
    .filter((entry): entry is { key: string; days: Day[]; score: number } => entry !== null);

  if (scored.length < 2) return null;

  const best = scored.reduce((top, entry) => (entry.score > top.score ? entry : top));
  // "a new best": only worth saying when the best week is the most recent one.
  if (best.key !== scored[scored.length - 1]!.key) return null;

  const n = usableDays(input, best.days).length;
  if (n < MIN_N.record) return null;

  const start = startOfWeek(best.days[0]!.date, input.settings.weekStartsOn);
  const end = best.days[best.days.length - 1]!.date;

  return {
    rule: 5,
    title: 'Record',
    body: `Best week so far: ${formatDateRange(start, end)} · ${round(best.score)}`,
    n
  };
}

/* ─── Assembly ────────────────────────────────────────────────────────────── */

/**
 * Up to five cards, ordered by importance (rule order). Below 14 logged days
 * the engine returns exactly one card, as specified.
 */
export function buildInsights(input: InsightInput): Insight[] {
  const loggedDays = usableDays(input, input.days).length;
  if (loggedDays < HISTORY_GATE) {
    return [
      {
        rule: 0,
        title: 'Insights',
        body: `Not enough history yet — insights appear after ${HISTORY_GATE} logged days.`,
        n: loggedDays
      }
    ];
  }

  const cards: Insight[] = [];
  const weakest = ruleWeakestLink(input);
  if (weakest) cards.push(weakest);
  cards.push(...ruleMomentum(input));
  const association = ruleAssociation(input);
  if (association) cards.push(association);
  const slipping = ruleSlipping(input);
  if (slipping) cards.push(slipping);
  const record = ruleRecord(input);
  if (record) cards.push(record);

  return cards.slice(0, MAX_CARDS);
}
