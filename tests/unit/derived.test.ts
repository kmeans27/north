import { describe, expect, it } from 'vitest';
import {
  deviceGapDays,
  deviceGaps,
  daylightDays,
  habitStreak,
  hitRate,
  logStreak,
  minutesOfDay,
  monthlyValues,
  sleepConsistency,
  standardDeviation,
  strengthSessions,
  weighInAgeDays,
  weightEma,
  weightSlopePctPerWeek,
  weightStale,
  weeklyValues,
  type EmaPoint
} from '../../src/lib/metrics/derived';
import { dates, day, perfectDay, settings, METRICS } from './helpers';
import type { Day } from '../../src/lib/metrics/types';

const cfg = settings();

describe('§8.4 weightSlopePctPerWeek', () => {
  it('two identical EMA points score 0', () => {
    const points: EmaPoint[] = [
      { date: '2026-10-01', ema: 80 },
      { date: '2026-10-15', ema: 80 }
    ];
    expect(weightSlopePctPerWeek(points)).toBe(0);
  });

  it('returns null for fewer than two points', () => {
    expect(weightSlopePctPerWeek([])).toBeNull();
    expect(weightSlopePctPerWeek([{ date: '2026-10-01', ema: 80 }])).toBeNull();
  });

  it('computes percent of bodyweight per week over 14 days', () => {
    // 80 → 79.2 over 14 days is −0.8 kg, −1 % of bodyweight over 2 weeks.
    const points: EmaPoint[] = [
      { date: '2026-10-01', ema: 80 },
      { date: '2026-10-15', ema: 79.2 }
    ];
    expect(weightSlopePctPerWeek(points)).toBeCloseTo(((-0.8 / 80) / 4) * 100, 10);
  });

  it('is undefined with a zero reference rather than Infinity', () => {
    const points: EmaPoint[] = [
      { date: '2026-10-01', ema: 0 },
      { date: '2026-10-15', ema: 1 }
    ];
    expect(weightSlopePctPerWeek(points)).toBeNull();
  });
});

describe('weight EMA (02-metrics.md §5)', () => {
  const days: Day[] = [
    { date: '2026-10-01', tz: 'UTC', values: {}, extras: { weightKg: 80 } },
    { date: '2026-10-08', tz: 'UTC', values: {}, extras: { weightKg: 82 } }
  ];

  it('seeds on the first weigh-in and applies α = 2/29 after', () => {
    const points = weightEma(days);
    expect(points[0]!.ema).toBe(80);
    expect(points[1]!.ema).toBeCloseTo((2 / 29) * 82 + (1 - 2 / 29) * 80, 10);
  });

  it('ignores days with no weigh-in', () => {
    expect(weightEma([...days, { date: '2026-10-09', tz: 'UTC', values: {} }])).toHaveLength(2);
  });

  it('flags a stale series at 10 days and reports the age', () => {
    expect(weighInAgeDays(days, '2026-10-15')).toBe(7);
    expect(weightStale(days, '2026-10-15')).toBe(false);
    expect(weightStale(days, '2026-10-18')).toBe(true);
    expect(weighInAgeDays([], '2026-10-18')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('§8.4 sleepConsistency', () => {
  it('computes SD over 3 nights, reports n = 3, and flags the low sample', () => {
    const days = [
      day('2026-10-15', {}, { extras: { sleepStart: '23:00' } }),
      day('2026-10-16', {}, { extras: { sleepStart: '23:30' } }),
      day('2026-10-17', {}, { extras: { sleepStart: '23:15' } })
    ];
    const result = sleepConsistency(days, 7);
    expect(result.n).toBe(3);
    expect(result.lowSample).toBe(true);
    expect(result.value).toBeCloseTo(Math.sqrt(150), 10); // SD of 1380, 1410, 1395
  });

  it('is not lowSample at 7 nights', () => {
    const days = dates('2026-10-11', 7).map((date) =>
      day(date, {}, { extras: { sleepStart: '23:00' } })
    );
    const result = sleepConsistency(days, 7);
    expect(result.n).toBe(7);
    expect(result.lowSample).toBe(false);
    expect(result.value).toBe(0);
  });

  it('returns an empty result when no night has a start time', () => {
    expect(sleepConsistency([day('2026-10-17', {})], 7)).toEqual({
      value: null,
      n: 0,
      lowSample: true
    });
  });

  it('parses only well-formed times', () => {
    expect(minutesOfDay('23:41')).toBe(1421);
    expect(minutesOfDay('00:05')).toBe(5);
    expect(minutesOfDay('24:00')).toBeNull();
    expect(minutesOfDay('23:99')).toBeNull();
    expect(minutesOfDay(2341)).toBeNull();
  });

  it('standard deviation is 0 for 0 and 1 samples', () => {
    expect(standardDeviation([])).toBe(0);
    expect(standardDeviation([5])).toBe(0);
  });
});

describe('weekly metric values', () => {
  it('sums strength sessions and counts daylight days', () => {
    const week = [
      day('2026-10-12', { strength_sessions: 1, daylight_days: 1 }),
      day('2026-10-13', { strength_sessions: 0, daylight_days: 0 }),
      day('2026-10-14', { strength_sessions: 1, daylight_days: 1 })
    ];
    expect(strengthSessions(week)).toBe(2);
    expect(daylightDays(week)).toBe(2);
  });

  it('prefers raw daylight minutes when present', () => {
    const week = [
      day('2026-10-12', {}, { extras: { daylightMinutes: 34 } }),
      day('2026-10-13', {}, { extras: { daylightMinutes: 12 } })
    ];
    expect(daylightDays(week)).toBe(1);
  });

  it('omits a metric that has no data in the week', () => {
    const week = [day('2026-10-12', { strength_sessions: 1 })];
    const values = weeklyValues({ week });
    expect(values.strength_sessions).toBe(1);
    expect(values.daylight_days).toBeUndefined();
    expect(values.weight_trend).toBeUndefined();
  });

  it('adds the weight slope when the weigh-ins are fresh', () => {
    const history = dates('2026-09-28', 21).map((date, i) =>
      day(date, {}, { extras: { weightKg: 82 - i * 0.05 } })
    );
    const week = history.slice(-7);
    const values = weeklyValues({ week, history });
    expect(typeof values.weight_trend).toBe('number');
    expect(values.weight_trend!).toBeLessThan(0);
  });
});

describe('monthly metric values (03-scoring.md §3)', () => {
  it('reads the month the history ends in, and nothing outside it', () => {
    const days = [
      day('2026-09-01', { savings_rate: 16, invested: true }),
      day('2026-10-01', { savings_rate: 21 }),
      day('2026-10-18', { protein: 4 })
    ];
    expect(monthlyValues(days)).toEqual({ savings_rate: 21 });
  });

  it('takes the newest value inside the month, wherever it was written', () => {
    const days = [
      day('2026-10-01', { savings_rate: 21 }),
      day('2026-10-18', { savings_rate: 27, invested: false })
    ];
    expect(monthlyValues(days)).toEqual({ savings_rate: 27, invested: false });
  });

  it('leaves a new month empty rather than carrying last month over', () => {
    const days = [day('2026-10-01', { savings_rate: 21 }), day('2026-11-02', {})];
    expect(monthlyValues(days)).toEqual({});
  });

  it('has nothing to say about an empty history', () => {
    expect(monthlyValues([])).toEqual({});
  });
});

describe('streaks (03-scoring.md §5)', () => {
  const streakDays = dates('2026-10-11', 7).map((date) => perfectDay(date));

  it('counts consecutive days where the habit is present and scores 100', () => {
    expect(habitStreak('creatine', streakDays, METRICS, cfg)).toBe(7);
  });

  it('breaks on a present day that scores 0', () => {
    const days = [...streakDays, perfectDay('2026-10-18', { creatine: false })];
    expect(habitStreak('creatine', days, METRICS, cfg)).toBe(0);
  });

  it('breaks on a partial day', () => {
    const partial = day(
      '2026-10-18',
      { creatine: true, deep_blocks: 2, protein: 4, read: true, learned: true },
      { note: 'x' }
    );
    expect(habitStreak('creatine', [...streakDays, partial], METRICS, cfg)).toBe(0);
  });

  it('treats a rest day as neutral: it neither breaks nor extends', () => {
    const rest: Day = {
      ...day('2026-10-16', { sleep_hours: 7.5, protein: 4, greens: 5, read: true }),
      restDay: true
    };
    const days = dates('2026-10-11', 7).map((date) => (date === '2026-10-16' ? rest : perfectDay(date)));
    // Six countable days plus one neutral day.
    expect(habitStreak('creatine', days, METRICS, cfg)).toBe(6);
    expect(logStreak(days, METRICS)).toBe(6);
  });

  it('breaks on a gap of two or more days', () => {
    const days = [
      perfectDay('2026-10-11'),
      perfectDay('2026-10-12'),
      // 13 and 14 missing entirely
      perfectDay('2026-10-15')
    ];
    expect(habitStreak('creatine', days, METRICS, cfg)).toBe(1);
  });

  it('log streak counts consecutive days at or above 70 % coverage', () => {
    expect(logStreak(streakDays, METRICS)).toBe(7);
    expect(logStreak([...streakDays, day('2026-10-18', { deep_blocks: 2 })], METRICS)).toBe(0);
  });

  it('reports no streak when the habit was never logged', () => {
    const days = dates('2026-10-11', 3).map((date) => day(date, { steps: 5000 }));
    expect(habitStreak('creatine', days, METRICS, cfg)).toBe(0);
  });
});

describe('device gaps (D9)', () => {
  it('counts the consecutive days with no value at all', () => {
    const days = [
      day('2026-10-15', { steps: 5000 }),
      // 16, 17, 18 have no steps
      day('2026-10-18', {})
    ];
    expect(deviceGapDays('steps', days, '2026-10-18')).toBe(3);
  });

  it('stops at the last day that has a value', () => {
    const days = [day('2026-10-15', { steps: 5000 }), day('2026-10-16', { steps: 6000 })];
    expect(deviceGapDays('steps', days, '2026-10-16')).toBe(0);
  });

  it('raises the banner at a three-day gap', () => {
    const days = [day('2026-10-15', { steps: 5000 }), day('2026-10-18', {})];
    const gaps = deviceGaps(days, '2026-10-18');
    expect(gaps.map((gap) => gap.metricId)).toContain('steps');
    expect(gaps.every((gap) => gap.days >= 3)).toBe(true);
  });

  it('reports nothing for a metric that has never arrived', () => {
    // A fresh install has no device yet: nothing has stopped, so no banner.
    expect(deviceGapDays('steps', [day('2026-10-18', {})], '2026-10-18')).toBe(0);
    expect(deviceGaps([day('2026-10-18', {})], '2026-10-18')).toEqual([]);
  });

  it('reads the device input of a derived metric out of `extras`', () => {
    const days = [
      { ...day('2026-10-15', {}), extras: { sleepStart: '23:10' } },
      day('2026-10-18', {})
    ];
    expect(deviceGapDays('sleep_consistency', days, '2026-10-18')).toBe(3);
    expect(deviceGapDays('sleep_consistency', [day('2026-10-18', {})], '2026-10-18')).toBe(0);
  });

  it('never treats a weekly metric as a three-day gap', () => {
    const days = [day('2026-10-05', { weight_trend: -0.4 }), day('2026-10-18', {})];
    expect(deviceGaps(days, '2026-10-18').map((gap) => gap.metricId)).not.toContain('weight_trend');
  });
});

describe('hit rates (rule 4)', () => {
  it('counts met days over countable days', () => {
    const days = dates('2026-10-01', 10).map((date, i) =>
      perfectDay(date, i < 4 ? { creatine: false } : {})
    );
    const rate = hitRate('creatine', days, METRICS, cfg);
    expect(rate).toEqual({ metricId: 'creatine', met: 6, total: 10, rate: 0.6 });
  });

  it('is zero, not NaN, with no countable days', () => {
    expect(hitRate('creatine', [], METRICS, cfg).rate).toBe(0);
  });
});
