import { describe, expect, it } from 'vitest';
import {
  coverage,
  dayPresence,
  dayScore,
  monthScore,
  pillarScores,
  weekScore
} from '../../src/lib/metrics/aggregate';
import {
  deviceGapDays,
  habitStreak,
  hitRate,
  logStreak,
  sleepConsistency,
  weeklyValues,
  weightEma,
  weightSlopePctPerWeek
} from '../../src/lib/metrics/derived';
import { metricMasses, resolveMetrics, resolveSpec, resolvedById } from '../../src/lib/metrics/resolve';
import { scoreMetric } from '../../src/lib/metrics/score';
import { startOfWeek } from '../../src/lib/metrics/dates';
import { buildInsights } from '../../src/lib/insights/rules';
import { generateDemoDays } from '../../src/lib/store/demo';
import { dates, perfectDay, settings } from './helpers';

/* M2 acceptance (08-build-plan.md): "these modules never read the clock except
   through an injected `now` argument."

   We replace `Date` with a probe that throws on a zero-argument `new Date()` or
   on `Date.now()`, run every pure module with explicit dates, and only assert
   after restoring the real constructor — so no test-matcher internals see the
   probe. */

const cfg = settings();
const METRICS = resolveMetrics(cfg);

function withClockProbe<T>(run: () => T): T {
  const real = Date;
  const probe = function (this: unknown, ...args: unknown[]): unknown {
    if (args.length === 0) throw new Error('read the clock: new Date()');
    return Reflect.construct(real, args);
  } as unknown as DateConstructor;

  Object.assign(probe, {
    UTC: real.UTC,
    parse: real.parse,
    now: (): number => {
      throw new Error('read the clock: Date.now()');
    }
  });

  globalThis.Date = probe;
  try {
    return run();
  } finally {
    globalThis.Date = real;
  }
}

describe('M2 acceptance: purity', () => {
  const history = generateDemoDays({ days: 120, end: '2026-10-17' });

  it('scores a day without touching the clock', () => {
    const result = withClockProbe(() => dayScore(history[10]!, METRICS, cfg));
    expect(result).not.toBeUndefined();
  });

  it('resolves the registry without touching the clock', () => {
    const result = withClockProbe(() => {
      const resolved = resolveMetrics(cfg);
      return {
        masses: metricMasses(resolved),
        spec: resolveSpec(resolved[0]!, cfg),
        protein: resolvedById('protein', cfg).score,
        score: scoreMetric(resolved[0]!, 7.5, cfg)
      };
    });
    expect(result.masses.daily).toBeCloseTo(0.79, 9);
    expect(result.score).toBe(100);
  });

  it('aggregates a week and a month without touching the clock', () => {
    const result = withClockProbe(() => {
      const week = history.slice(-7);
      const weekly = weeklyValues({ week, history });
      return {
        coverage: coverage(week[0]!, METRICS),
        presence: dayPresence(week[0]!, METRICS),
        week: weekScore(week, METRICS, cfg, weekly),
        month: monthScore(history.slice(-28), METRICS, cfg, { '2026-W42': weekly }),
        pillars: pillarScores(week, METRICS, cfg, weekly)
      };
    });
    expect(typeof result.week).toBe('number');
    expect(result.pillars.body).not.toBeUndefined();
  });

  it('computes derived metrics without touching the clock', () => {
    const result = withClockProbe(() => {
      const ema = weightEma(history);
      return {
        slope: weightSlopePctPerWeek(ema),
        sleep: sleepConsistency(history),
        streak: habitStreak('creatine', history, METRICS, cfg),
        log: logStreak(history, METRICS),
        // `today` is injected, never read.
        gap: deviceGapDays('steps', history, history[history.length - 1]!.date),
        rate: hitRate('creatine', history.slice(-30), METRICS, cfg)
      };
    });
    expect(result.sleep.n).toBeGreaterThan(0);
    expect(typeof result.gap).toBe('number');
    expect(result.rate.total).toBeGreaterThan(0);
  });

  it('builds insights without touching the clock', () => {
    const result = withClockProbe(() => buildInsights({ days: history, metrics: METRICS, settings: cfg }));
    expect(result.length).toBeGreaterThan(0);
  });

  it('startOfWeek is pure calendar arithmetic', () => {
    const result = withClockProbe(() => startOfWeek('2026-10-17', 1));
    expect(result).toBe('2026-10-12');
  });

  it('the probe really does catch a clock read', () => {
    expect(() => withClockProbe(() => new Date())).toThrow(/read the clock/);
    expect(() => withClockProbe(() => Date.now())).toThrow(/read the clock/);
  });

  it('answers a fixed fixture identically on two runs', () => {
    const days = dates('2026-09-20', 7).map((date) => perfectDay(date));
    expect(dayScore(days[0]!, METRICS, cfg)).toBe(dayScore(structuredClone(days[0]!), METRICS, cfg));
  });
});
