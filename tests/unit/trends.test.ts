/* tests/unit/trends.test.ts — the Trends screen's pure model (M4).
 *
 * 04-ux.md §6: one row per metric over a 30- or 90-day window, the hit-rate
 * always 30 days, weekly and monthly metrics plotted per period, a fixed value
 * scale that never auto-zooms, and point selection for the keyboard.
 */

import { describe, expect, it } from 'vitest';
import { resolveMetrics } from '../../src/lib/metrics/resolve';
import { day, dates, perfectDay, settings } from './helpers';
import {
  nearestIndex,
  pointAt,
  stepSelection,
  trendRate,
  trendsModel,
  valueDomain,
  type TrendPoint
} from '../../src/lib/trends';
import type { MetricId, ResolvedMetric } from '../../src/lib/metrics/types';

const cfg = settings();
const METRICS = resolveMetrics(cfg);
const metric = (id: MetricId): ResolvedMetric => METRICS.find((m) => m.id === id)!;

/** A series from raw values, dated consecutively from `start`. */
function series(values: (number | null)[], start = '2026-10-01'): TrendPoint[] {
  const days = dates(start, values.length);
  return values.map((value, index) => ({ date: days[index]!, value }));
}

describe('valueDomain — a fixed scale that never auto-zooms (05-design.md §5)', () => {
  it('starts a ramp at its zeroAt', () => {
    expect(valueDomain(metric('sleep_hours'), [])).toEqual({
      min: 5.5,
      max: 7.5,
      target: 7.5,
      lowerIsBetter: false
    });
  });

  it('starts a counter at zero', () => {
    expect(valueDomain(metric('greens'), [])).toEqual({
      min: 0,
      max: 5,
      target: 5,
      lowerIsBetter: false
    });
  });

  it('flags a range as lower-is-better, targeting the good end', () => {
    expect(valueDomain(metric('social_min'), [])).toEqual({
      min: 0,
      max: 30,
      target: 30,
      lowerIsBetter: true
    });
  });

  it('keeps zero inside a trend domain and targets zero', () => {
    const domain = valueDomain(metric('weight_trend'), series([-0.4, -0.6]));
    expect(domain.target).toBe(0);
    expect(domain.min).toBeCloseTo(-0.6, 10);
    expect(domain.max).toBe(0);
    expect(domain.lowerIsBetter).toBe(false);
  });

  it('scales a step to 0..1', () => {
    expect(valueDomain(metric('creatine'), [])).toEqual({
      min: 0,
      max: 1,
      target: 1,
      lowerIsBetter: false
    });
  });
});

describe('trendRate — the 30-day hit-rate, with the right noun', () => {
  const history = dates('2026-09-16', 30).map((date) => perfectDay(date));

  it('reads a daily metric in days', () => {
    expect(trendRate(metric('greens'), [], history, METRICS, cfg)).toMatchObject({
      met: 30,
      total: 30,
      rate: 1,
      unit: 'days'
    });
  });

  it('reads a weekly metric in weeks, per period', () => {
    const weekly: TrendPoint[] = [
      { date: '2026-09-18', value: 2 },
      { date: '2026-09-25', value: 1 },
      { date: '2026-10-02', value: 2 },
      { date: '2026-10-09', value: 2 }
    ];
    expect(trendRate(metric('strength_sessions'), weekly, history, METRICS, cfg)).toMatchObject({
      met: 3,
      total: 4,
      unit: 'weeks'
    });
  });

  it('reads a monthly metric in months', () => {
    const monthly: TrendPoint[] = [
      { date: '2026-09-30', value: 1 },
      { date: '2026-10-15', value: 1 }
    ];
    expect(trendRate(metric('invested'), monthly, history, METRICS, cfg)).toMatchObject({
      met: 2,
      total: 2,
      unit: 'months'
    });
  });
});

describe('point selection (04-ux.md §6)', () => {
  const points: TrendPoint[] = [
    { date: '2026-10-01', value: 1 },
    { date: '2026-10-02', value: null },
    { date: '2026-10-03', value: 2 }
  ];

  it('maps a click fraction to the nearest index, clamped', () => {
    expect(nearestIndex([], 0.5)).toBeNull();
    expect(nearestIndex(points, -5)).toBe(0);
    expect(nearestIndex(points, 0)).toBe(0);
    expect(nearestIndex(points, 0.5)).toBe(1);
    expect(nearestIndex(points, 1)).toBe(2);
  });

  it('steps to the next point that has a value, without wrapping', () => {
    expect(stepSelection(points, null, 1)).toBe('2026-10-01');
    expect(stepSelection(points, null, -1)).toBe('2026-10-03');
    expect(stepSelection(points, '2026-10-01', 1)).toBe('2026-10-03'); // skips the gap
    expect(stepSelection(points, '2026-10-03', 1)).toBe('2026-10-03'); // edge stays put
    expect(stepSelection(points, '2026-10-03', -1)).toBe('2026-10-01');
    expect(stepSelection([], null, 1)).toBeNull();
  });

  it('finds a point by date, and nothing for a missing one', () => {
    expect(pointAt(points, '2026-10-03')?.value).toBe(2);
    expect(pointAt(points, null)).toBeNull();
    expect(pointAt(points, '1999-01-01')).toBeNull();
  });
});

describe('trendsModel', () => {
  const history = dates('2026-09-16', 40).map((date) => perfectDay(date));
  const today = history[history.length - 1]!.date;
  const model = trendsModel({ days: history, today, window: 30, metrics: METRICS, settings: cfg });

  it('keeps all four pillar groups, in order', () => {
    expect(model.groups.map((group) => group.pillar)).toEqual([
      'body',
      'mind',
      'attention',
      'capital'
    ]);
  });

  it('spans the requested window and ends today', () => {
    expect(model.end).toBe(today);
    expect(model.start).toBe('2026-09-26'); // forty days back, last thirty
    const daily = model.groups[0]!.rows.find((row) => row.metric.id === 'greens')!;
    expect(daily.series).toHaveLength(30);
  });

  it('widens to ninety days when asked, capped by the history', () => {
    const wide = trendsModel({ days: history, today, window: 90, metrics: METRICS, settings: cfg });
    const daily = wide.groups[0]!.rows.find((row) => row.metric.id === 'greens')!;
    expect(daily.series).toHaveLength(40); // only forty days exist
  });

  it('carries a 90-day consistency strip per pillar, aligned to weekdays', () => {
    for (const group of model.groups) {
      expect(group.consistency).toHaveLength(40);
      expect(group.offset).toBeGreaterThanOrEqual(0);
      expect(group.offset).toBeLessThan(7);
    }
  });

  it('leaves a gap where a day has no value, and keeps the last value', () => {
    const sparse = dates('2026-09-16', 30).map((date, index) =>
      index < 27 ? day(date, {}) : day(date, { greens: 5 })
    );
    const sparseToday = sparse[sparse.length - 1]!.date;
    const model30 = trendsModel({
      days: sparse,
      today: sparseToday,
      window: 30,
      metrics: METRICS,
      settings: cfg
    });
    const greens = model30.groups[0]!.rows.find((row) => row.metric.id === 'greens')!;
    expect(greens.series.map((point) => point.value)).toEqual([
      ...Array<null>(27).fill(null),
      5,
      5,
      5
    ]);
    expect(greens.latest?.value).toBe(5);
  });

  it('plots a weekly metric per period, not per day', () => {
    const sparse = dates('2026-09-16', 30).map((date) => day(date, {}));
    const sparseToday = sparse[sparse.length - 1]!.date;
    const model30 = trendsModel({
      days: sparse,
      today: sparseToday,
      window: 30,
      metrics: METRICS,
      settings: cfg
    });
    const strength = model30.groups[0]!.rows.find(
      (row) => row.metric.id === 'strength_sessions'
    )!;
    expect(strength.series.length).toBeGreaterThan(0);
    expect(strength.series.length).toBeLessThan(30);
    const ordinals = strength.series.map((point) => point.date);
    expect([...ordinals].sort()).toEqual(ordinals);
  });

  it('drops a hidden metric from every row list', () => {
    const hiddenCfg = settings({ hidden: ['deep_blocks'] });
    const hidden = trendsModel({
      days: history,
      today,
      window: 30,
      metrics: resolveMetrics(hiddenCfg),
      settings: hiddenCfg
    });
    const ids = hidden.groups.flatMap((group) => group.rows.map((row) => row.metric.id));
    expect(ids).not.toContain('deep_blocks');
  });

  it('gives every insight card its sample size (02-metrics.md §6)', () => {
    expect(model.insights.length).toBeGreaterThan(0);
    expect(model.insights.length).toBeLessThanOrEqual(5);
    for (const card of model.insights) expect(card.n).toBeGreaterThan(0);
  });

  it('shows the single not-enough-history card below the gate', () => {
    const few = dates('2026-10-01', 5).map((date) => perfectDay(date));
    const early = trendsModel({
      days: few,
      today: few[few.length - 1]!.date,
      window: 30,
      metrics: METRICS,
      settings: cfg
    });
    expect(early.insights).toHaveLength(1);
    expect(early.insights[0]!.rule).toBe(0);
  });
});
