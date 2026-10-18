/* tests/unit/dashboard.test.ts — the v2 home screen's pure model (docs/V2.md §6).
 *
 * What carries a chart, what carries a control, how a pillar is ordered, and
 * that a gap stays a gap. Nothing here touches the DOM: the page is thin, so
 * everything that can be wrong lives in `dashboard.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  BOARD_COLUMNS,
  PANEL_DAYS,
  SPARK_DAYS,
  WEEK_BARS,
  chartCeiling,
  chartFor,
  dashboard,
  fillRow,
  goalText,
  handLogged,
  inlineControl,
  lowerIsBetter,
  metricDailyScores,
  panelOrder,
  tileTone,
  tileUnit,
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

  it('refuses a typed daily number and a weekly metric', () => {
    // `number` is typed, not tapped, so the row shows the figure and a chart.
    expect(inlineControl(byId('sleep_hours'))).toBeNull();
    expect(inlineControl(byId('distraction_min'))).toBeNull();
    // A weekly counter logs into a day, which would read "sessions today".
    expect(inlineControl(byId('strength_sessions'))).toBeNull();
    expect(inlineControl(byId('daylight_days'))).toBeNull();
  });

  it('is the only way in for a monthly figure', () => {
    // `/log` never shows a monthly metric, so the dashboard must take it.
    expect(inlineControl(byId('savings_rate'))).toBe('number');
    expect(inlineControl(byId('invested'))).toBe('triState');
    expect(chartFor(byId('savings_rate'), options([])).kind).toBe('none');
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

  it('leaves a hand-logged metric and a signed trend alone', () => {
    expect(chartFor(byId('protein'), options(days)).kind).toBe('none');
    expect(chartFor(byId('weight_trend'), options(days)).kind).toBe('none');
    expect(chartFor(byId('adult'), options(days)).kind).toBe('none');
    expect(chartFor(byId('weight_trend'), options(days)).ceiling).toBeNull();
  });

  it('stops the chart scale where the metric stops scoring', () => {
    // A `range` ceilings at `bad`, so a wild day cannot flatten the rest.
    expect(chartCeiling(byId('sleep_consistency'))).toBe(90);
    expect(chartCeiling(byId('distraction_min'))).toBe(240);
    // A `ramp` or `counter` ceilings at `stretch`: a bar may pass the target.
    expect(chartFor(byId('sleep_hours'), options(days)).ceiling).toBe(8.5);
    expect(chartCeiling(byId('steps'))).toBe(10000);
    expect(chartCeiling(byId('strength_sessions'))).toBe(3);
    // Protein's `stretch` comes from settings: 2.0 g/kg on 80 kg is 5 ×32 g.
    expect(chartCeiling(byId('protein'))).toBe(5);
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

  it('scores Capital from the month\u2019s figures, entered on any day of it', () => {
    const days = dates('2026-10-01', 28).map((date) => perfectDay(date));
    // Written on the 1st, read on the 18th: one figure for the whole month.
    days[0] = perfectDay('2026-10-01', { savings_rate: 15, invested: true });

    const capital = dashboard(options(days)).panels.find((panel) => panel.pillar === 'capital');
    // 15 % on a 0→20 % ramp is 75; invested is a step, so it is 100 or nothing.
    expect(capital?.score).toBeCloseTo((0.07 * 75 + 0.03 * 100) / 0.1, 5);
    expect(capital?.metrics.find((row) => row.metric.id === 'savings_rate')?.shown).toBe(15);
    expect(capital?.metrics.find((row) => row.metric.id === 'invested')?.shown).toBe(true);
    expect(capital?.daily).toBe(false);
    expect(capital?.n).toBe(0);
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

  it('shows a monthly figure for its whole month, whatever day it was written', () => {
    const days = [
      day('2026-10-01', { savings_rate: 18, invested: true }),
      day('2026-10-18', { protein: 4 })
    ];
    const rows = (listing: readonly Day[]) =>
      dashboard(options(listing)).panels.flatMap((panel) => panel.metrics);
    const find = (listing: readonly Day[], id: MetricId) =>
      rows(listing).find((row) => row.metric.id === id)?.shown;

    expect(find(days, 'savings_rate')).toBe(18);
    expect(find(days, 'invested')).toBe(true);

    // A new month has no figure until it is entered: never carried over.
    const november = [...days, day('2026-11-05', {})];
    expect(find(november, 'savings_rate')).toBeNull();
    expect(find(november, 'invested')).toBeNull();
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

/* ─── The board (docs/V2.1.md §3) ─────────────────────────────────────────── */

describe('the board', () => {
  const days = dates('2026-09-20', 40).map((date) => perfectDay(date));

  it('lays every visible metric out exactly once, in rows that fill the grid', () => {
    const model = dashboard(options(days));
    const placed = model.panels.flatMap((panel) => panel.rows.flat().map((row) => row.metric.id));
    const visible = METRICS.filter((metric) => metric.visible).map((metric) => metric.id);

    expect([...placed].sort()).toEqual([...visible].sort());
    expect(new Set(placed).size).toBe(placed.length);

    for (const panel of model.panels) {
      for (const row of panel.rows) {
        const units = row.reduce((total, tile) => total + tile.span, 0);
        expect(units, `${panel.pillar} row`).toBe(BOARD_COLUMNS);
        expect(row.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives weight a width: sleep is wider than creatine', () => {
    const body = dashboard(options(days)).panels.find((panel) => panel.pillar === 'body');
    const span = (id: MetricId) => body?.rows.flat().find((row) => row.metric.id === id)?.span;
    expect(span('sleep_hours')).toBeGreaterThan(span('creatine') ?? 0);
    // Every row is written out and every row fills: no metric can leave a hole.
    expect(span('sleep_hours')).toBe(4);
  });

  it('shares the columns of a hidden metric among the rest of its row', () => {
    const present = new Set<MetricId>(['sleep_hours', 'protein', 'greens']);
    const row = fillRow(
      [
        ['sleep_hours', 4],
        ['protein', 3],
        ['greens', 3],
        ['sleep_consistency', 2]
      ],
      present
    );
    expect(row.map((tile) => tile.id)).toEqual(['sleep_hours', 'protein', 'greens']);
    expect(row.reduce((total, tile) => total + tile.span, 0)).toBe(BOARD_COLUMNS);
    // Slack goes to the widest tile first, then round-robin.
    expect(row.map((tile) => tile.span)).toEqual([5, 4, 3]);

    expect(fillRow([], present)).toEqual([]);
  });

  it('reads a weekly metric as its week, not as the day it was written on', () => {
    // The device writes one row a day, so today's row says "no session" on a week
    // that has two: the tile has to show the week.
    const week = dates('2026-10-12', 7).map((date, index) =>
      day(date, { strength_sessions: index === 0 || index === 3 ? 1 : 0 })
    );
    const rows = dashboard(options(week)).panels.flatMap((panel) => panel.metrics);
    const gym = rows.find((row) => row.metric.id === 'strength_sessions');
    expect(gym?.value.value).toBe(0);
    expect(gym?.shown).toBe(2);
    expect(gym?.score).toBe(100);
  });

  it('gives a tile the score of what it shows, so badge and figure agree', () => {
    const week = dates('2026-10-12', 7).map((date) => day(date, { protein: 4 }));
    const rows = dashboard(options(week)).panels.flatMap((panel) => panel.metrics);
    const protein = rows.find((row) => row.metric.id === 'protein');
    expect(protein?.shown).toBe(4);
    expect(protein?.score).toBe(100);
  });

  it('reads a metric\u2019s own score history for the tile that has no chart', () => {
    const steady = dates('2026-09-20', 40).map((date) =>
      day(date, { protein: 4 }, { extras: { sleepStart: '23:00' } })
    );
    const series = metricDailyScores(byId('protein'), options(steady));
    expect(series).toHaveLength(SPARK_DAYS);
    expect(series.at(-1)).toBe(100);
    // A monthly figure is one value a month: a line of a constant is not a shape.
    expect(metricDailyScores(byId('savings_rate'), options(steady))).toEqual([]);
  });

  it('states the target in words, and states nothing where there is no scale', () => {
    expect(goalText(byId('sleep_hours'))).toBe('target 7.5 h');
    expect(goalText(byId('distraction_min'))).toBe('under 90 min');
    expect(goalText(byId('phone_total'))).toBe('ideal \u2264 2h');
    expect(goalText(byId('weight_trend'))).toBe('maintaining');
    // A tick has no scale to state: "target 1" would be noise.
    expect(goalText(byId('creatine'))).toBeNull();
  });

  it('tones a figure without ever shaming it', () => {
    expect(tileTone(null)).toBeNull();
    expect(tileTone(100)).toBe('accent');
    expect(tileTone(75)).toBe('pillar');
    expect(tileTone(40)).toBe('warn');
    expect(tileTone(0)).toBe('warn');
  });

  it('never prints a unit twice in one tile', () => {
    // A bare cell label needs it beside the label.
    expect(tileUnit(byId('protein'))).toBe('×32 g');
    expect(tileUnit(byId('deep_blocks'))).toBe('×45 min');
    expect(tileUnit(byId('strength_sessions'))).toBe('/wk');
    // A typed number prints its own unit in the figure.
    expect(tileUnit(byId('sleep_hours'))).toBe('');
    expect(tileUnit(byId('steps'))).toBe('');
    expect(tileUnit(byId('savings_rate'))).toBe('');
    // A bin labels itself.
    expect(tileUnit(byId('phone_total'))).toBe('');
    // The label already says it: `Daylight days` + `days` would read twice.
    expect(tileUnit(byId('daylight_days'))).toBe('');
    // `Greens & fruit` does not name servings, so the unit stays.
    expect(tileUnit(byId('greens'))).toBe('servings');
  });
});
