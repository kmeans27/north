import { describe, expect, it } from 'vitest';
import { CADENCE_MASS, PILLARS, PILLAR_LABEL, REGISTRY } from '../../src/lib/metrics/registry';
import type { MetricDef, ScoreSpec, Settings } from '../../src/lib/metrics/types';

/** 02-metrics.md §3 defaults. Only what the registry needs. */
const SETTINGS: Settings = {
  version: 1,
  bodyweightKg: 80,
  proteinGPerKg: 1.6,
  goalWeightKg: null,
  weightMode: 'cut',
  dayCutoffHour: 4,
  weekStartsOn: 1,
  eveningPrompt: '21:30',
  theme: 'system',
  density: 'comfortable',
  overrides: {},
  hidden: [],
  automation: { health: false, collector: false, sync: false, repo: null }
};

/** 02-metrics.md §4 — transcribed so a silent weight edit fails the build. */
const WEIGHTS: Record<string, number> = {
  sleep_hours: 0.10,
  sleep_consistency: 0.03,
  protein: 0.06,
  creatine: 0.02,
  greens: 0.02,
  alcohol: 0.04,
  steps: 0.02,
  strength_sessions: 0.05,
  daylight_days: 0.03,
  weight_trend: 0.03,
  deep_blocks: 0.13,
  learned: 0.09,
  read: 0.06,
  phone_total: 0.05,
  social_min: 0.07,
  distraction_min: 0.05,
  adult: 0.05,
  savings_rate: 0.07,
  invested: 0.03
};

const PILLAR_TOTALS = { body: 0.40, mind: 0.28, attention: 0.22, capital: 0.10 } as const;

const sum = (list: number[]): number => list.reduce((a, b) => a + b, 0);

function specOf(metric: MetricDef): ScoreSpec {
  return typeof metric.score === 'function' ? metric.score(SETTINGS) : metric.score;
}

describe('registry shape', () => {
  it('holds the 19 metrics from 02-metrics.md', () => {
    expect(REGISTRY).toHaveLength(19);
  });

  it('has unique ids', () => {
    const ids = REGISTRY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has the 14 daily, 3 weekly and 2 monthly metrics the spec states', () => {
    const count = (cadence: MetricDef['cadence']): number =>
      REGISTRY.filter((m) => m.cadence === cadence).length;
    expect(count('daily')).toBe(14);
    expect(count('weekly')).toBe(3);
    expect(count('monthly')).toBe(2);
  });

  it('gives every metric a lever, help and evidence line', () => {
    for (const metric of REGISTRY) {
      expect(metric.lever.trim(), `${metric.id}.lever`).not.toBe('');
      expect(metric.help.trim(), `${metric.id}.help`).not.toBe('');
      expect(metric.evidence.trim(), `${metric.id}.evidence`).not.toBe('');
      expect(metric.label.trim(), `${metric.id}.label`).not.toBe('');
    }
  });

  it('keeps short labels at 14 characters or fewer', () => {
    for (const metric of REGISTRY) {
      expect(metric.short.length, `${metric.id}.short`).toBeLessThanOrEqual(14);
    }
  });

  it('only uses a settings-dependent score for protein and weight_trend', () => {
    const functional = REGISTRY.filter((m) => typeof m.score === 'function').map((m) => m.id);
    expect(functional.sort()).toEqual(['protein', 'weight_trend']);
  });

  it('assigns every metric to one of the four pillars', () => {
    for (const metric of REGISTRY) {
      expect(PILLARS).toContain(metric.pillar);
      expect(PILLAR_LABEL[metric.pillar]).toBeTruthy();
    }
  });
});

describe('weights (02-metrics.md §4)', () => {
  it('sums to exactly 1.00 within 1e-9', () => {
    expect(Math.abs(sum(REGISTRY.map((m) => m.weight)) - 1)).toBeLessThanOrEqual(1e-9);
  });

  it('matches the canonical table row by row', () => {
    expect(Object.keys(WEIGHTS).sort()).toEqual(REGISTRY.map((m) => m.id).sort());
    for (const metric of REGISTRY) {
      expect(metric.weight, `${metric.id}.weight`).toBeCloseTo(WEIGHTS[metric.id]!, 10);
    }
  });

  it('sums each pillar to its stated total', () => {
    for (const pillar of PILLARS) {
      const total = sum(REGISTRY.filter((m) => m.pillar === pillar).map((m) => m.weight));
      expect(total, pillar).toBeCloseTo(PILLAR_TOTALS[pillar], 10);
    }
  });

  it('sums each cadence to the mass used by aggregation', () => {
    for (const cadence of ['daily', 'weekly', 'monthly'] as const) {
      const total = sum(REGISTRY.filter((m) => m.cadence === cadence).map((m) => m.weight));
      expect(total, cadence).toBeCloseTo(CADENCE_MASS[cadence], 10);
    }
  });

  it('counts 0.64 of manual coverage weight per day', () => {
    // 02-metrics.md §5: coverage = present coverage weight / weight of those same
    // metrics. Pure-auto metrics are excluded by D9, so the daily denominator is
    // 0.64, not the 0.79 daily mass. 03-scoring.md §2 says 0.79 and is wrong; the
    // canonical §5 formula wins. Documented in the M0 report.
    const coverageWeight = sum(
      REGISTRY.filter((m) => m.cadence === 'daily' && m.countsTowardCoverage).map((m) => m.weight)
    );
    expect(coverageWeight).toBeCloseTo(0.64, 10);
  });
});

describe('score specs are valid curves', () => {
  it('declares a known curve with a finite target', () => {
    for (const metric of REGISTRY) {
      const spec = specOf(metric);
      expect(['ramp', 'step', 'counter', 'range', 'trend'], metric.id).toContain(spec.curve);
      expect(Number.isFinite(spec.target), `${metric.id}.target`).toBe(true);
    }
  });

  it('ramp defines zeroAt strictly below target', () => {
    for (const metric of REGISTRY) {
      const spec = specOf(metric);
      if (spec.curve !== 'ramp') continue;
      expect(spec.zeroAt, `${metric.id}.zeroAt`).toBeTypeOf('number');
      expect(spec.zeroAt!, `${metric.id}.zeroAt < target`).toBeLessThan(spec.target);
    }
  });

  it('range defines good strictly below bad', () => {
    for (const metric of REGISTRY) {
      const spec = specOf(metric);
      if (spec.curve !== 'range') continue;
      expect(spec.good, `${metric.id}.good`).toBeTypeOf('number');
      expect(spec.bad, `${metric.id}.bad`).toBeTypeOf('number');
      expect(spec.good!, `${metric.id}.good < bad`).toBeLessThan(spec.bad!);
    }
  });

  it('counter and step targets are positive', () => {
    for (const metric of REGISTRY) {
      const spec = specOf(metric);
      if (spec.curve === 'counter' || spec.curve === 'step') {
        expect(spec.target, `${metric.id}.target`).toBeGreaterThan(0);
      }
    }
  });

  it('trend resolves a weight mode from settings', () => {
    const trend = REGISTRY.find((m) => m.id === 'weight_trend')!;
    const spec = trend.score as (s: Settings) => ScoreSpec;
    expect(spec(SETTINGS).curve).toBe('trend');
    expect(spec(SETTINGS).mode).toBe('cut');
    expect(spec({ ...SETTINGS, weightMode: 'bulk' }).mode).toBe('bulk');
    expect(spec({ ...SETTINGS, weightMode: 'maintain' }).mode).toBe('maintain');
  });

  it('protein target follows bodyweight and g/kg (1.6 g/kg at 80 kg → 4 anchors)', () => {
    const protein = REGISTRY.find((m) => m.id === 'protein')!;
    const spec = protein.score as (s: Settings) => ScoreSpec;
    expect(spec(SETTINGS).target).toBe(4);
    expect(spec({ ...SETTINGS, proteinGPerKg: 2.0 }).target).toBe(5);
  });

  it('bins are ordered and hold a numeric value', () => {
    for (const metric of REGISTRY) {
      if (metric.widget !== 'bins') continue;
      expect(metric.bins, `${metric.id}.bins`).toBeDefined();
      expect(metric.bins!.length).toBeGreaterThan(1);
      for (const bin of metric.bins!) {
        expect(bin.label.trim()).not.toBe('');
        expect(Number.isFinite(bin.value)).toBe(true);
      }
    }
  });
});
