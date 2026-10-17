import { describe, expect, it } from 'vitest';
import {
  metricMasses,
  resolveMetric,
  resolveMetrics,
  resolveSpec,
  resolvedById,
  visibleMetrics
} from '../../src/lib/metrics/resolve';
import { REGISTRY } from '../../src/lib/metrics/registry';
import { dayScore } from '../../src/lib/metrics/aggregate';
import { day, perfectDay, settings } from './helpers';

const base = settings({ bodyweightKg: 80, proteinGPerKg: 1.6 });
const strict = settings({ bodyweightKg: 80, proteinGPerKg: 2.0 });

describe('registry → overrides merge (06-architecture.md §4)', () => {
  it('returns one resolved metric per registry entry, in registry order', () => {
    const resolved = resolveMetrics(base);
    expect(resolved).toHaveLength(REGISTRY.length);
    expect(resolved.map((m) => m.id)).toEqual(REGISTRY.map((m) => m.id));
  });

  it('turns the function form into a literal spec', () => {
    const protein = resolvedById('protein', base);
    expect(typeof protein.score).toBe('object');
    expect(protein.score).toEqual({
      curve: 'counter',
      target: 4,
      stretch: Math.round((2.0 * 80) / 32)
    });
  });

  it('never mutates the canonical registry', () => {
    const before = JSON.stringify(REGISTRY);
    resolveMetrics(settings({ overrides: { protein: { weight: 0.5, target: 9 } } }));
    expect(JSON.stringify(REGISTRY)).toBe(before);
    expect(typeof REGISTRY.find((m) => m.id === 'protein')!.score).toBe('function');
  });

  it('applies a target override', () => {
    const tuned = resolveMetric(
      REGISTRY.find((m) => m.id === 'social_min')!,
      settings({ overrides: { social_min: { target: 20, bad: 60 } } })
    );
    expect(tuned.score.bad).toBe(60);
    expect(tuned.score.good).toBe(30); // untouched fields keep the registry value
  });

  it('applies weight, visible, lever, help and label overrides', () => {
    const tuned = resolveMetric(
      REGISTRY.find((m) => m.id === 'read')!,
      settings({
        overrides: {
          read: { weight: 0.5, visible: false, lever: 'Move the book.', help: 'Ten minutes.', label: 'Reading a book' }
        }
      })
    );
    expect(tuned.weight).toBe(0.5);
    expect(tuned.visible).toBe(false);
    expect(tuned.lever).toBe('Move the book.');
    expect(tuned.help).toBe('Ten minutes.');
    expect(tuned.label).toBe('Reading a book');
  });

  it('ignores override values of the wrong type', () => {
    const tuned = resolveMetric(
      REGISTRY.find((m) => m.id === 'greens')!,
      settings({ overrides: { greens: { target: Number.NaN, weight: -0.5 } } })
    );
    expect(tuned.score.target).toBe(5); // NaN is not a target
    expect(tuned.weight).toBe(0); // negative weights are floored, never subtracted
  });

  it('hides metrics through settings.hidden', () => {
    const hidden = settings({ hidden: ['adult', 'invested'] });
    const ids = visibleMetrics(hidden).map((m) => m.id);
    expect(ids).not.toContain('adult');
    expect(ids).not.toContain('invested');
    expect(resolveMetrics(hidden).find((m) => m.id === 'adult')!.visible).toBe(false);
  });

  it('moves the masses when a weight is retargeted', () => {
    const before = metricMasses(resolveMetrics(base));
    const after = metricMasses(
      resolveMetrics(settings({ overrides: { deep_blocks: { weight: 0.5 } } }))
    );
    expect(after.daily).toBeGreaterThan(before.daily);
  });

  it('throws on an unknown metric id rather than scoring a typo as zero', () => {
    expect(() => resolvedById('nope' as never, base)).toThrow(/Unknown metric/);
  });
});

describe('resolveSpec', () => {
  it('is identity for a literal-spec metric with no override', () => {
    const greens = REGISTRY.find((m) => m.id === 'greens')!;
    expect(resolveSpec(greens, base)).toEqual(greens.score);
  });

  it('reads the mode from settings for weight_trend', () => {
    const trend = REGISTRY.find((m) => m.id === 'weight_trend')!;
    expect(resolveSpec(trend, settings({ weightMode: 'cut' })).mode).toBe('cut');
    expect(resolveSpec(trend, settings({ weightMode: 'bulk' })).mode).toBe('bulk');
  });
});

describe('M2 acceptance: protein per kg retargets the metric (08-build-plan.md §M2)', () => {
  it('1.6 g/kg gives 4 anchors, 2.0 g/kg gives 5', () => {
    expect(resolvedById('protein', base).score.target).toBe(4);
    expect(resolvedById('protein', strict).score.target).toBe(5);
  });

  it('re-scores a fixed fixture day to a lower value', () => {
    const fixture = perfectDay('2026-10-17', { protein: 4 });
    const before = dayScore(fixture, resolveMetrics(base), base);
    const after = dayScore(fixture, resolveMetrics(strict), strict);

    expect(before).toBeCloseTo(100, 10);
    // 4 of 5 anchors: the 0.06-weight row now scores 80 instead of 100.
    expect(after).toBeCloseTo((0.79 * 100 - 0.06 * 20) / 0.79, 10);
    expect(after).toBeLessThan(before!);
  });

  it('the three-anchor floor holds for a light user', () => {
    const light = settings({ bodyweightKg: 40, proteinGPerKg: 1.6 });
    expect(resolvedById('protein', light).score.target).toBe(3);
  });

  it('scores a logged four-anchor day identically for a day object and its clone', () => {
    const fixture = day('2026-10-17', { protein: 4, creatine: true });
    expect(dayScore(fixture, resolveMetrics(base), base)).toBe(
      dayScore(structuredClone(fixture), resolveMetrics(base), base)
    );
  });
});
