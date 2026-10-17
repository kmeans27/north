import { describe, expect, it } from 'vitest';
import {
  COVERAGE_MIN,
  coverage,
  coverageBand,
  dayPresence,
  dayScore,
  monthScore,
  pillarScores,
  weekScore,
  type PeriodValues
} from '../../src/lib/metrics/aggregate';
import { CADENCE_MASS } from '../../src/lib/metrics/registry';
import { metricMasses, resolveMetrics } from '../../src/lib/metrics/resolve';
import { DEFAULT_SETTINGS } from '../../src/lib/store/settings';
import { dates, day, perfectDay, settings, METRICS } from './helpers';
import type { Day } from '../../src/lib/metrics/types';

const cfg = settings();

/* 03-scoring.md §8.3, row by row. */

describe('§8.3 day score and presence', () => {
  it('a day with every daily metric present and scoring 100 scores 100', () => {
    expect(dayScore(perfectDay('2026-10-17'), METRICS, cfg)).toBeCloseTo(100, 10);
    expect(coverage(perfectDay('2026-10-17'), METRICS)).toBeCloseTo(1, 10);
  });

  it('creatine false is present and lowers the score', () => {
    const d = perfectDay('2026-10-17', { creatine: false });
    const score = dayScore(d, METRICS, cfg);
    expect(score).toBeLessThan(100);
    expect(score).toBeCloseTo((0.79 * 100 - 0.02 * 100) / 0.79, 10);
    expect(coverage(d, METRICS)).toBeCloseTo(1, 10);
  });

  it('creatine null is excluded from numerator and denominator, so the score is unchanged', () => {
    const withNull = perfectDay('2026-10-17', { creatine: null });
    expect(dayScore(withNull, METRICS, cfg)).toBeCloseTo(100, 10);
    // Excluded means the denominator shrinks: coverage is no longer 1.
    expect(coverage(withNull, METRICS)).toBeCloseTo((0.64 - 0.02) / 0.64, 10);
  });

  it('protein logged as zero is present and contributes zero', () => {
    const d = perfectDay('2026-10-17', { protein: 0 });
    expect(dayPresence(d, METRICS).present).toBe(14);
    expect(dayScore(d, METRICS, cfg)).toBeCloseTo((0.79 * 100 - 0.06 * 100) / 0.79, 10);
  });

  it('only deep_blocks present (weight 0.13) is insufficient', () => {
    const d = day('2026-10-17', { deep_blocks: 2 });
    expect(dayScore(d, METRICS, cfg)).toBeNull();
    expect(coverage(d, METRICS)).toBeLessThan(COVERAGE_MIN);
    expect(coverageBand(coverage(d, METRICS))).toBe('insufficient');
  });
});

describe('§8.3 week score', () => {
  it('a week with all days partial returns null and does not crash', () => {
    const days = dates('2026-10-12', 7).map((date) =>
      // deep_blocks + protein + read + learned = 0.34 of 0.64 coverage
      day(date, { deep_blocks: 2, protein: 4, read: true, learned: true }, { note: 'x' })
    );
    for (const d of days) {
      expect(coverageBand(coverage(d, METRICS))).toBe('partial');
    }
    expect(weekScore(days, METRICS, cfg)).toBeNull();
  });

  it('a week where weight_trend is missing has a denominator of 0.87, not 0.90', () => {
    const days = dates('2026-10-12', 7).map((date) => perfectDay(date));
    const weekly: PeriodValues = { strength_sessions: 2, daylight_days: 4 };
    // dailyPart = 100 × 0.79; weeklyPart = 100×0.05 + 80×0.03 = 7.4
    expect(weekScore(days, METRICS, cfg, weekly)).toBeCloseTo((79 + 7.4) / 0.87, 10);
    // With the weight trend present, the denominator becomes the full 0.90.
    const full = weekScore(days, METRICS, cfg, { ...weekly, weight_trend: 0.2 });
    expect(full).toBeCloseTo((79 + 7.4 + 100 * 0.03) / 0.9, 10);
  });

  it('uses only days at or above 70 % coverage', () => {
    const good = perfectDay('2026-10-12');
    const sparse = day('2026-10-13', { deep_blocks: 2, protein: 4, read: true, learned: true });
    expect(weekScore([good, sparse], METRICS, cfg)).toBeCloseTo(100, 10);
  });

  it('never lets a weekly metric silently contribute zero', () => {
    const days = dates('2026-10-12', 7).map((date) => perfectDay(date));
    const withZero = weekScore(days, METRICS, cfg, { strength_sessions: 0 });
    const without = weekScore(days, METRICS, cfg, {});
    // A real zero (0 sessions) lowers the score; absence must not.
    expect(withZero).toBeLessThan(100);
    expect(without).toBeCloseTo(100, 10);
  });
});

describe('§8.3 month score', () => {
  const weeks: Record<string, PeriodValues> = {
    '2026-W40': { strength_sessions: 2, daylight_days: 5, weight_trend: 0.2 },
    '2026-W41': { strength_sessions: 2, daylight_days: 5, weight_trend: 0.2 },
    '2026-W42': { strength_sessions: 2, daylight_days: 5, weight_trend: 0.2 },
    '2026-W43': { strength_sessions: 2, daylight_days: 5, weight_trend: 0.2 }
  };
  const monthDays = dates('2026-10-01', 28).map((date) => perfectDay(date));

  it('includes savings_rate at 20 % as a 100', () => {
    const score = monthScore(monthDays, METRICS, cfg, weeks, {
      savings_rate: 20,
      invested: true
    });
    expect(score).toBeCloseTo(100, 10);
  });

  it('excludes MONTHLY_MASS when there is no monthly data', () => {
    const without = monthScore(monthDays, METRICS, cfg, weeks, {});
    const zeroed = monthScore(monthDays, METRICS, cfg, weeks, { savings_rate: 0, invested: false });
    // Absence is not zero: without monthly data the score stays high, with a
    // real zero it drops. If MONTHLY_MASS were counted when absent, the two
    // would be identical.
    expect(without).toBeCloseTo(100, 10);
    expect(zeroed).toBeCloseTo(90, 10);
    expect(without!).toBeGreaterThan(zeroed!);
  });
});

describe('coverage and masses (02-metrics.md §4–5)', () => {
  it('the default masses match the canonical table', () => {
    const masses = metricMasses(METRICS);
    expect(masses.daily).toBeCloseTo(CADENCE_MASS.daily, 9);
    expect(masses.weekly).toBeCloseTo(CADENCE_MASS.weekly, 9);
    expect(masses.monthly).toBeCloseTo(CADENCE_MASS.monthly, 9);
    // 02-metrics.md §5, canonical: the coverage denominator is the sum of the
    // metrics that count toward coverage (0.64), not all daily weights (0.79).
    expect(masses.coverage).toBeCloseTo(0.64, 9);
  });

  it('coverage is 0 for an empty day and 1 when every coverage metric is present', () => {
    expect(coverage(day('2026-10-17', {}), METRICS)).toBe(0);
    expect(coverage(perfectDay('2026-10-17'), METRICS)).toBe(1);
  });

  it('band boundaries match 03-scoring.md §2', () => {
    expect(coverageBand(0.7)).toBe('ok');
    expect(coverageBand(0.25)).toBe('partial');
    expect(coverageBand(0.249)).toBe('insufficient');
  });
});

describe('rest days (03-scoring.md §7)', () => {
  it('restricts the day to sleep, protein, greens and read', () => {
    const rest: Day = {
      ...day('2026-10-17', { greens: 5, deep_blocks: 4, adult: false }),
      restDay: true
    };
    const presence = dayPresence(rest, METRICS);
    expect(presence.total).toBe(4);
    expect(presence.present).toBe(1);
  });
});

describe('pillar scores are diagnostic only (D10)', () => {
  it('normalises within the pillar and never multiplies pillar weights', () => {
    const days = dates('2026-10-01', 28).map((date) => perfectDay(date));
    const pillars = pillarScores(days, METRICS, cfg, {
      strength_sessions: 2,
      daylight_days: 5,
      weight_trend: 0.2
    });
    expect(pillars.body).toBeCloseTo(100, 10);
    expect(pillars.mind).toBeCloseTo(100, 10);
    expect(pillars.attention).toBeCloseTo(100, 10);
    // No monthly data in the window: Capital has nothing to say.
    expect(pillars.capital).toBeNull();
  });
});

describe('defaults sanity', () => {
  it('resolves every registry metric', () => {
    expect(resolveMetrics(DEFAULT_SETTINGS)).toHaveLength(19);
  });
});
