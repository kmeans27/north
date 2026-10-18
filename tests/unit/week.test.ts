/* tests/unit/week.test.ts — the Week screen's pure model (M4).
 *
 * The worked example is 03-scoring.md §3; the comparison, the pace words and
 * the day grid are 04-ux.md §5. The arithmetic uses synthetic metrics so the
 * day scores can be stated exactly, as the worked example states them.
 *
 * Metrics are resolved with the same settings they are scored with: a resolved
 * `weight_trend` bakes its mode in at resolve time, so resolving it with other
 * settings would silently score the wrong curve.
 */

import { describe, expect, it } from 'vitest';
import { weekScore } from '../../src/lib/metrics/aggregate';
import { resolveMetrics } from '../../src/lib/metrics/resolve';
import { dates, day, perfectDay, settings } from './helpers';
import { elapsedDays, weekModel, weeklyLines, weeklyStatus } from '../../src/lib/week';
import { formatSigned } from '../../src/lib/format';
import type { Day, MetricId, ResolvedMetric, Settings } from '../../src/lib/metrics/types';

/** The four synthetic metrics of the worked example, resolved for `cfg`. */
function synthMetrics(cfg: Settings): ResolvedMetric[] {
  const all = resolveMetrics(cfg);
  const get = (id: MetricId): ResolvedMetric => {
    const metric = all.find((m) => m.id === id);
    if (!metric) throw new Error(`no metric ${id}`);
    return metric;
  };

  /* One synthetic daily metric carrying the whole daily mass (0.79), on a
   * 0–100 ramp: a day's value *is* its day score. Weekly weights stay canonical. */
  const daily: ResolvedMetric = {
    ...get('deep_blocks'),
    weight: 0.79,
    countsTowardCoverage: true,
    score: { curve: 'ramp', zeroAt: 0, target: 100 }
  };

  return [daily, get('strength_sessions'), get('daylight_days'), get('weight_trend')];
}

const synthDay = (date: string, score: number): Day => day(date, { deep_blocks: score });

describe('03-scoring.md §3 — the worked example', () => {
  const cfg = settings({ weightMode: 'cut' });
  const SYNTHETIC = synthMetrics(cfg);
  const week = [82, 76, 88, 64, 90, 79, 84].map((score, index) =>
    synthDay(dates('2026-10-12', 7)[index]!, score)
  );
  const weekly = { strength_sessions: 2, daylight_days: 4, weight_trend: -0.42 };

  it('scores the documented good week 82.2 ± 0.05', () => {
    const score = weekScore(week, SYNTHETIC, cfg, weekly);
    expect(score).not.toBeNull();
    expect(Math.abs(score! - 82.2)).toBeLessThanOrEqual(0.05);
    // (80.4286 × 0.79 + 10.40) / 0.90 = 82.155
    expect(score!).toBeCloseTo(82.155, 2);
  });

  it('drops a missing weigh-in out of the numerator and the 0.90 denominator', () => {
    const without = weekScore(week, SYNTHETIC, cfg, {
      strength_sessions: 2,
      daylight_days: 4
    });
    // (63.5386 + 7.40) / 0.87 = 81.54 — 03-scoring.md §3's stated consequence.
    expect(without!).toBeCloseTo(81.54, 2);
    expect(without!).toBeLessThan(weekScore(week, SYNTHETIC, cfg, weekly)!);
  });

  it('never silently scores an absent metric as zero', () => {
    const zeroed = weekScore(week, SYNTHETIC, cfg, { ...weekly, weight_trend: 0 });
    const absent = weekScore(week, SYNTHETIC, cfg, {
      strength_sessions: 2,
      daylight_days: 4
    });
    expect(absent!).toBeGreaterThan(zeroed!);
  });
});

describe('elapsedDays (pace is informational only)', () => {
  it('counts the days of the week that have happened', () => {
    expect(elapsedDays('2026-10-12', '2026-10-18', '2026-10-11')).toBe(0);
    expect(elapsedDays('2026-10-12', '2026-10-18', '2026-10-12')).toBe(1);
    expect(elapsedDays('2026-10-12', '2026-10-18', '2026-10-15')).toBe(4);
    expect(elapsedDays('2026-10-12', '2026-10-18', '2026-10-18')).toBe(7);
    expect(elapsedDays('2026-10-12', '2026-10-18', '2026-11-30')).toBe(7);
  });
});

describe('met / on pace / behind (04-ux.md §5)', () => {
  const cfg = settings();
  const all = resolveMetrics(cfg);
  const pick = (id: MetricId): ResolvedMetric => all.find((m) => m.id === id)!;
  const strength = pick('strength_sessions');
  const daylight = pick('daylight_days');

  it('met is the target reached, whatever the elapsed share', () => {
    expect(weeklyStatus(strength, 2, 1, cfg)).toBe('met');
    expect(weeklyStatus(strength, 3, 7, cfg)).toBe('met');
    expect(weeklyStatus(daylight, 5, 2, cfg)).toBe('met');
  });

  it('on pace is the value keeping up with the elapsed share of the week', () => {
    expect(weeklyStatus(daylight, 3, 4, cfg)).toBe('on pace'); // 3 >= 5 × 4/7
    expect(weeklyStatus(strength, 1, 3, cfg)).toBe('on pace');
  });

  it('behind is a counter that has fallen off its share, or a past week under target', () => {
    expect(weeklyStatus(strength, 0, 3, cfg)).toBe('behind');
    expect(weeklyStatus(daylight, 2, 7, cfg)).toBe('behind');
  });

  it('a rate has no pace: met or behind', () => {
    const cut = settings({ weightMode: 'cut' });
    const weight = resolveMetrics(cut).find((m) => m.id === 'weight_trend')!;
    expect(weeklyStatus(weight, -0.42, 2, cut)).toBe('met');
    expect(weeklyStatus(weight, 0.5, 2, cut)).toBe('behind');
  });

  it('no value is a fourth state, never a zero', () => {
    expect(weeklyStatus(strength, null, 7, cfg)).toBe('none');
  });
});

describe('weeklyLines', () => {
  const cfg = settings({ weightMode: 'cut' });
  const metrics = synthMetrics(cfg);
  const lines = weeklyLines(
    metrics,
    cfg,
    { strength_sessions: 2, daylight_days: 4, weight_trend: -0.42 },
    7
  );

  it('renders the three weekly metrics in registry order, and nothing else', () => {
    expect(lines.map((line) => line.metric.id)).toEqual([
      'strength_sessions',
      'daylight_days',
      'weight_trend'
    ]);
  });

  it('draws dots for counters only', () => {
    expect(lines[0]!.dots).toEqual({ filled: 2, total: 2 });
    expect(lines[1]!.dots).toEqual({ filled: 4, total: 5 });
    expect(lines[2]!.dots).toBeNull();
  });

  it('states each status as a word and keeps overshoot as a quiet extra', () => {
    expect(lines[0]!.status).toBe('met');
    expect(lines[0]!.extra).toBe(0);
    expect(lines[1]!.status).toBe('behind');
    expect(lines[2]!.status).toBe('met');

    const over = weeklyLines(metrics, cfg, { strength_sessions: 3 }, 7)[0]!;
    expect(over.dots).toEqual({ filled: 2, total: 2 });
    expect(over.extra).toBe(1);
  });

  it('marks a metric with no data rather than scoring it zero', () => {
    const empty = weeklyLines(metrics, cfg, {}, 7);
    expect(empty.map((line) => line.status)).toEqual(['none', 'none', 'none']);
  });
});

describe('weekModel', () => {
  const cfg = settings();
  const SYNTHETIC = synthMetrics(cfg);
  const history: Day[] = [
    ...dates('2026-10-05', 7).map((date) => synthDay(date, 100)),
    ...dates('2026-10-12', 4).map((date, index) => synthDay(date, [82, 76, 88, 64][index]!))
  ];

  const model = weekModel({
    anchor: '2026-10-14',
    today: '2026-10-15',
    days: history,
    metrics: SYNTHETIC,
    settings: cfg
  });

  it('starts the week on the configured weekday and spans seven days', () => {
    expect(model.start).toBe('2026-10-12');
    expect(model.end).toBe('2026-10-18');
    expect(model.days).toHaveLength(7);
  });

  it('labels the grid M T W T F S S', () => {
    expect(model.days.map((cell) => cell.weekday)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });

  it('carries each day score and its ink fill', () => {
    expect(model.days.slice(0, 4).map((cell) => Math.round(cell.score!))).toEqual([82, 76, 88, 64]);
    expect(model.days[0]!.fill).toBeCloseTo(0.82, 10);
    expect(model.days[4]!.score).toBeNull();
    expect(model.days[4]!.fill).toBeNull();
  });

  it('marks today and the future without inventing scores for them', () => {
    expect(model.days.filter((cell) => cell.future)).toHaveLength(3);
    expect(model.days[3]!.today).toBe(true);
    expect(model.days[3]!.future).toBe(false);
  });

  it('compares rounded week scores, in words', () => {
    // This week (4 logged days) mean = 77.5; the previous week is a flat 100.
    expect(model.score!).toBeCloseTo(77.5, 10);
    expect(model.previousScore!).toBeCloseTo(100, 10);
    expect(model.delta).toBe(-22);
    expect(formatSigned(model.delta!)).toBe('−22');
  });

  it('counts the days that may enter the average', () => {
    expect(model.loggedDays).toBe(4);
  });

  it('keeps all four pillars, with Capital honestly empty', () => {
    expect(model.pillars.map((row) => row.pillar)).toEqual([
      'body',
      'mind',
      'attention',
      'capital'
    ]);
    expect(model.pillars[3]!.score).toBeNull();
    expect(model.pillars[3]!.delta).toBeNull();
  });

  it('has no score at all for a week with no data', () => {
    const empty = weekModel({
      anchor: '2026-10-14',
      today: '2026-10-15',
      days: [],
      metrics: SYNTHETIC,
      settings: cfg
    });
    expect(empty.score).toBeNull();
    expect(empty.previousScore).toBeNull();
    expect(empty.delta).toBeNull();
    expect(empty.days.every((cell) => cell.score === null)).toBe(true);
    expect(empty.loggedDays).toBe(0);
  });

  it('never lets a partial week invent a comparison', () => {
    const onlyThisWeek = weekModel({
      anchor: '2026-10-14',
      today: '2026-10-15',
      days: dates('2026-10-12', 4).map((date) => perfectDay(date)),
      metrics: resolveMetrics(cfg),
      settings: cfg
    });
    expect(onlyThisWeek.score).not.toBeNull();
    expect(onlyThisWeek.previousScore).toBeNull();
    expect(onlyThisWeek.delta).toBeNull();
  });
});
