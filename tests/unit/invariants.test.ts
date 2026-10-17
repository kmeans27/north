import { describe, expect, it } from 'vitest';
import {
  coverage,
  dayPresence,
  dayScore,
  monthScore,
  pillarScores,
  weekScore,
  type PeriodValues
} from '../../src/lib/metrics/aggregate';
import { byWeekKey, weeklyValues } from '../../src/lib/metrics/derived';
import { metricMasses, resolveMetrics } from '../../src/lib/metrics/resolve';
import { REGISTRY } from '../../src/lib/metrics/registry';
import { scoreMetric } from '../../src/lib/metrics/score';
import { monthKey, weekKey } from '../../src/lib/metrics/dates';
import { generateDemoDays } from '../../src/lib/store/demo';
import { day, settings } from './helpers';
import type { Day, MetricId, Value } from '../../src/lib/metrics/types';

/* 03-scoring.md §8.5: property-style tests over 500 generated days. */

const cfg = settings();
const METRICS = resolveMetrics(cfg);
const HORIZON = '2026-10-17';
const days500 = generateDemoDays({ days: 500, end: HORIZON });

/** A deterministic, non-mutating permutation: reverse and rotate by three. */
function shuffle<T>(list: readonly T[]): T[] {
  const reversed = [...list].reverse();
  return [...reversed.slice(3), ...reversed.slice(0, 3)];
}

describe('§8.5 invariants over 500 generated days', () => {
  it('generated the expected history', () => {
    expect(days500).toHaveLength(500);
    expect(days500[days500.length - 1]!.date).toBe(HORIZON);
  });

  it('Σ metric weights === 1.00', () => {
    const total = REGISTRY.reduce((sum, metric) => sum + metric.weight, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
    const resolved = METRICS.reduce((sum, metric) => sum + metric.weight, 0);
    expect(Math.abs(resolved - 1)).toBeLessThan(1e-9);
  });

  it('0 <= score <= 100 for every metric, every curve, every value', () => {
    for (const metric of METRICS) {
      for (const d of days500) {
        const entry = d.values[metric.id];
        if (!entry) continue;
        const score = scoreMetric(metric, entry.v, cfg, { note: d.note });
        if (score === null) continue;
        expect(Number.isFinite(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('coverage is always within [0, 1]', () => {
    for (const d of days500) {
      const value = coverage(d, METRICS);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('dayScore is null or inside [0, 100]', () => {
    for (const d of days500) {
      const score = dayScore(d, METRICS, cfg);
      if (score === null) continue;
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('weekScore is null or inside [0, 100]', () => {
    for (const [, group] of byWeekKey(days500, cfg.weekStartsOn)) {
      const score = weekScore(group, METRICS, cfg, weeklyValues({ week: group, history: days500 }));
      if (score === null) continue;
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('monthScore is null or inside [0, 100]', () => {
    const weeks = new Map<string, Day[]>(byWeekKey(days500, cfg.weekStartsOn));
    const weeklyByWeek: Record<string, PeriodValues> = {};
    for (const [key, group] of weeks) {
      weeklyByWeek[key] = weeklyValues({ week: group, history: days500 });
    }

    const months = new Map<string, Day[]>();
    for (const d of days500) {
      const key = monthKey(d.date);
      (months.get(key) ?? months.set(key, []).get(key)!).push(d);
    }

    for (const [, group] of months) {
      const keys = new Set(group.map((d) => weekKey(d.date, cfg.weekStartsOn)));
      const perWeek: Record<string, PeriodValues> = {};
      for (const week of keys) perWeek[week] = weeklyByWeek[week] ?? {};

      const monthly: PeriodValues = {};
      for (const d of group) {
        for (const id of ['savings_rate', 'invested'] as const) {
          const entry = d.values[id];
          if (entry && entry.v !== null) monthly[id] = entry.v as number | boolean;
        }
      }

      const score = monthScore(group, METRICS, cfg, perWeek, monthly);
      if (score === null) continue;
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
    expect(months.size).toBeGreaterThan(0);
  });

  it('pillar scores are null or inside [0, 100]', () => {
    for (const [, group] of byWeekKey(days500, cfg.weekStartsOn)) {
      const scores = pillarScores(group, METRICS, cfg, weeklyValues({ week: group, history: days500 }));
      for (const score of Object.values(scores)) {
        if (score === null) continue;
        expect(Number.isFinite(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('never exceeds 100 even with absurd overshoot', () => {
    const overshoot: Partial<Record<MetricId, Value>> = {
      sleep_hours: 1e9,
      protein: 1e9,
      greens: 1e9,
      steps: 1e9,
      deep_blocks: 1e9,
      sleep_consistency: -1e9,
      distraction_min: -1e9
    };
    const d = day('2026-10-17', overshoot, { note: 'x' });
    expect(dayScore(d, METRICS, cfg)).toBeCloseTo(100, 10);
  });

  it('clamps every curve to [0, 100] on hostile inputs', () => {
    const hostile: Partial<Record<MetricId, Value>> = {
      sleep_hours: -1e9,
      sleep_consistency: 1e9,
      protein: -1e9,
      creatine: true,
      greens: -1e9,
      alcohol: false,
      steps: -1e9,
      deep_blocks: -1e9,
      learned: true,
      read: false,
      phone_total: 1e9,
      social_min: 1e9,
      distraction_min: 1e9,
      adult: false
    };
    const d = day('2026-10-17', hostile, { note: 'x' });

    for (const metric of METRICS) {
      const entry = d.values[metric.id];
      if (!entry) continue;
      const value = scoreMetric(metric, entry.v, cfg, { note: d.note });
      if (value === null) continue;
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeLessThanOrEqual(100);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    const score = dayScore(d, METRICS, cfg);
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(0);
    expect(score!).toBeLessThanOrEqual(100);
  });

  it('removing a value never increases the denominator', () => {
    for (const d of days500.slice(0, 80)) {
      const before = dayPresence(d, METRICS).weight;
      for (const id of Object.keys(d.values) as MetricId[]) {
        const clone: Day = { ...structuredClone(d), values: { ...d.values } };
        delete clone.values[id];
        const after = dayPresence(clone, METRICS).weight;
        expect(after).toBeLessThanOrEqual(before + 1e-12);
      }
    }
  });

  it('shuffling the metric order never changes any score', () => {
    const shuffled = shuffle(METRICS);
    let checked = 0;

    for (const d of days500.slice(-60)) {
      expect(coverage(d, shuffled)).toBeCloseTo(coverage(d, METRICS), 12);

      const a = dayScore(d, METRICS, cfg);
      const b = dayScore(d, shuffled, cfg);
      // Float addition is not associative, so the tolerance is 1e-9 (§8.5).
      if (a === null || b === null) expect(b).toBe(a);
      else expect(b).toBeCloseTo(a, 9);
      if (a !== null) checked++;

      const pa = pillarScores([d], METRICS, cfg);
      const pb = pillarScores([d], shuffled, cfg);
      for (const pillar of ['body', 'mind', 'attention', 'capital'] as const) {
        if (pa[pillar] === null || pb[pillar] === null) expect(pb[pillar]).toBe(pa[pillar]);
        else expect(pb[pillar]!).toBeCloseTo(pa[pillar]!, 9);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('identical inputs give identical output (pure, no clock reads inside)', () => {
    const a = dayScore(days500[10]!, METRICS, cfg);
    const b = dayScore(structuredClone(days500[10]!), METRICS, cfg);
    expect(b).toBe(a);

    const wa = weekScore(days500.slice(0, 7), METRICS, cfg, { strength_sessions: 2 });
    const wb = weekScore(days500.slice(0, 7), METRICS, cfg, { strength_sessions: 2 });
    expect(wb).toBe(wa);
  });

  it('the demo history actually produces scores to check', () => {
    const scored = days500.filter((d) => dayScore(d, METRICS, cfg) !== null).length;
    expect(scored).toBeGreaterThan(400);
    expect(metricMasses(METRICS).daily).toBeCloseTo(0.79, 9);
  });
});
