/* tests/unit/dashboard.test.ts — the v2 home screen's pure model (docs/V2.md §6).
 *
 * What carries a chart, what carries a control, how a pillar is ordered, and
 * that a gap stays a gap. Nothing here touches the DOM: the page is thin, so
 * everything that can be wrong lives in `dashboard.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  PANEL_DAYS,
  SPARK_DAYS,
  WEEK_BARS,
  chartFor,
  dashboard,
  handLogged,
  inlineControl,
  lowerIsBetter,
  panelOrder,
  type DashboardOptions
} from '../../src/lib/dashboard';
import type { Day, MetricId, ResolvedMetric } from '../../src/lib/metrics/types';
import { day, dates, METRICS, perfectDay, settings } from './helpers';

const byId = (id: MetricId, metrics: readonly ResolvedMetric[] = METRICS): ResolvedMetric => {
  const metric = metrics.find((m) => m.id === id);
  if (!metric) throw new Error(`no metric ${id}`);
  return metric;
};

function options(days: readonly Day[], over: Partial<DashboardOptions> = {}): DashboardOptions {
  return {
    day: days[days.length - 1] ?? null,
    days,
    metrics: METRICS,
    settings: settings(),
    ...over
  };
}

/* ─── Direction ───────────────────────────────────────────────────────────── */

describe('lowerIsBetter', () => {
  it('reads the direction off the curve, never off a per-metric list', () => {
    // `range` scores `good` at the bottom and `bad` at the top (02-metrics.md §3).
    expect(lowerIsBetter(byId('sleep_consistency'))).toBe(true);
    expect(lowerIsBetter(byId('distraction_min'))).toBe(true);
    expect(lowerIsBetter(byId('phone_total'))).toBe(true);
    // Ramps and counters want more.
    expect(lowerIsBetter(byId('sleep_hours'))).toBe(false);
    expect(lowerIsBetter(byId('steps'))).toBe(false);
    expect(lowerIsBetter(byId('greens'))).toBe(false);
  });

  it('turns a trend around when the goal is to bulk', () => {
    const cutting: ResolvedMetric[] = [byId('weight_trend')];
    expect(lowerIsBetter(cutting[0]!)).toBe(true);

    const bulking = [byId('weight_trend', METRICS)];
    expect(bulking.length).toBe(1);
    // The same metric under a different setting: resolved from settings, not baked in.
    const permissive = { ...byId('weight_trend'), score: { ...byId('weight_trend').score, mode: 'bulk' as const } };
    expect(lowerIsBetter(permissive)).toBe(false);
  });
});

/* ─── Controls and charts ─────────────────────────────────────────────────── */

describe('inlineControl', () => {
  it('offers cells for the daily taps and nothing else', () => {
    expect(inlineControl(byId('protein'))).toBe('choice');
    expect(inlineControl(byId('creatine'))).toBe('triState');
    expect(inlineControl(byId('deep_blocks'))).toBe('segmented');
    expect(inlineControl(byId('phone_total'))).toBe('bins');
  });

  it('refuses a typed number, a weekly metric and a monthly one', () => {
    // `number` is typed, not tapped, so the row shows the figure and a chart.
    expect(inlineControl(byId('sleep_hours'))).toBeNull();
    expect(inlineControl(byId('distraction_min'))).toBeNull();
    expect(inlineControl(byId('savings_rate'))).toBeNull();
    // A weekly counter logs into a day, which would read "sessions today".
    expect(inlineControl(byId('strength_sessions'))).toBeNull();
    expect(inlineControl(byId('daylight_days'))).toBeNull();
  });

  it('counts the nine taps you make by hand', () => {
    const ids = handLogged(METRICS).map((metric) => metric.id);
    expect(ids).toEqual([
      'protein',
      'creatine',
      'greens',
      'alcohol',
      'deep_blocks',
      'learned',
      'read',
      'phone_total',
      'social_min'
    ]);
  });
});

describe('chartFor', () => {
  const days = dates('2026-10-01', 20).map((date, index) =>
    day(date, { sleep_hours: 7 + (index % 3) * 0.5, steps: 4000 + index * 300 })
  );

  it('draws the last 14 nights of sleep against its 7.5 h target', () => {
    const chart = chartFor(byId('sleep_hours'), options(days));
    expect(chart.kind).toBe('bars');
    expect(chart.points).toHaveLength(PANEL_DAYS);
    expect(chart.target).toBe(7.5);
    expect(chart.lowerIsBetter).toBe(false);
    expect(chart.caption).toBe('14 nights');
    expect(chart.points.every((point) => point !== null)).toBe(true);
  });

  it('keeps a missing day a gap, never a zero', () => {
    const sparse = [...days.slice(0, 19), day('2026-10-20', {})];
    const chart = chartFor(byId('sleep_hours'), options(sparse));
    expect(chart.points.at(-1)).toBeNull();
    expect(chart.points.at(-2)).not.toBeNull();
  });

  it('draws a weekly metric one bar per week', () => {
    const daily = dates('2026-10-01', 28).map((date, index) =>
      day(date, { strength_sessions: index >= 26 ? 1 : 0 })
    );
    const chart = chartFor(byId('strength_sessions'), options(daily));
    expect(chart.kind).toBe('bars');
    expect(chart.points).toHaveLength(WEEK_BARS);
    expect(chart.caption).toBe('6 weeks');
    expect(chart.points.at(-1)).toBe(2);
  });

  it('runs the sleep-regularity window for every day, so the shape is a history', () => {
    const steady = dates('2026-10-01', 20).map((date) =>
      day(date, { sleep_hours: 7.5 }, { extras: { sleepStart: '23:00' } })
    );
    const chart = chartFor(byId('sleep_consistency'), options(steady));
    expect(chart.kind).toBe('bars');
    expect(chart.points.at(-1)).toBe(0);
    expect(chart.points.at(-2)).toBe(0);
    expect(chart.target).toBe(30);
    expect(chart.lowerIsBetter).toBe(true);
  });

  it('leaves a hand-logged metric, a monthly one and a signed trend alone', () => {
    expect(chartFor(byId('protein'), options(days)).kind).toBe('none');
    expect(chartFor(byId('savings_rate'), options(days)).kind).toBe('none');
    expect(chartFor(byId('weight_trend'), options(days)).kind).toBe('none');
    expect(chartFor(byId('adult'), options(days)).kind).toBe('none');
  });
});

/* ─── Order and shape ─────────────────────────────────────────────────────── */

describe('panelOrder', () => {
  it('puts the part of life that needs attention first', () => {
    const days = dates('2026-09-20', 40).map((date) =>
      perfectDay(date, {
        phone_total: 6,
        social_min: 150,
        distraction_min: 240,
        adult: false
      })
    );
    expect(panelOrder(options(days))).toEqual(['attention', 'body', 'mind', 'capital']);
  });

  it('keeps the registry order on a tie, and a missing figure last', () => {
    const days = dates('2026-09-20', 40).map((date) => perfectDay(date));
    // Capital has no weekly value, so it has no figure and sorts last.
    expect(panelOrder(options(days))).toEqual(['body', 'mind', 'attention', 'capital']);
    expect(panelOrder(options(days, { weekly: { savings_rate: 25 } }))).toEqual([
      'body',
      'mind',
      'attention',
      'capital'
    ]);
  });
});

describe('dashboard', () => {
  const days = dates('2026-09-20', 40).map((date) => perfectDay(date, { protein: 2 }));

  it('returns every pillar in registry order, with all its visible metrics', () => {
    const model = dashboard(options(days));
    expect(model.panels.map((panel) => panel.pillar)).toEqual([
      'body',
      'mind',
      'attention',
      'capital'
    ]);

    const ids = model.panels.flatMap((panel) => panel.metrics.map((row) => row.metric.id));
    const visible = METRICS.filter((metric) => metric.visible).map((metric) => metric.id);
    expect([...ids].sort()).toEqual([...visible].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives each panel a 30-day sparkline and a sample size', () => {
    const model = dashboard(options(days));
    for (const panel of model.panels) {
      expect(panel.spark).toHaveLength(SPARK_DAYS);
    }

    const byPillar = (pillar: string) => model.panels.find((panel) => panel.pillar === pillar);
    expect(byPillar('body')?.score).not.toBeNull();
    expect(byPillar('body')?.n).toBe(28);
    expect(byPillar('mind')?.n).toBe(28);
    expect(byPillar('attention')?.n).toBe(28);
    // Capital is monthly: no daily metric, so there is no daily coverage to count.
    expect(byPillar('capital')?.daily).toBe(false);
    expect(byPillar('capital')?.n).toBe(0);
    expect(byPillar('body')?.daily).toBe(true);
  });

  it('shows a stored value, and falls back to the derived one', () => {
    const steady = dates('2026-09-20', 40).map((date) =>
      day(date, { sleep_hours: 7.5, protein: 3 }, { extras: { sleepStart: '23:00' } })
    );
    const model = dashboard(options(steady));
    const rows = model.panels.flatMap((panel) => panel.metrics);
    const sleep = rows.find((row) => row.metric.id === 'sleep_hours');
    const regularity = rows.find((row) => row.metric.id === 'sleep_consistency');
    expect(sleep?.shown).toBe(7.5);
    // Never stored: computed from the sleep starts on read.
    expect(regularity?.shown).toBe(0);
  });

  it('counts what is left to log today', () => {
    const empty = dashboard(options([day('2026-10-18', {})]));
    expect(empty.total).toBe(9);
    expect(empty.open).toHaveLength(9);

    const done = dashboard(options([day('2026-10-18', { protein: 4, creatine: true })]));
    expect(done.logged).toBe(2);
    expect(done.open).not.toContain('protein');
    expect(done.open).not.toContain('creatine');
    // A collector metric is tappable on the dashboard but is not one of the nine.
    expect(done.open).not.toContain('adult');
  });
});
