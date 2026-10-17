import { describe, expect, it } from 'vitest';
import {
  band,
  clamp,
  scoreCounter,
  scoreMetric,
  scoreRamp,
  scoreRange,
  scoreStep,
  scoreTrend
} from '../../src/lib/metrics/score';
import { resolvedById } from '../../src/lib/metrics/resolve';
import { settings } from './helpers';
import type { WeightMode } from '../../src/lib/metrics/score';

/* Table-driven, straight from 03-scoring.md §8.1 and §8.2. */

describe('§8.1 ramp', () => {
  const rows: [number, number | undefined][] = [
    [5.5, 0],
    [6.5, 50],
    [7.5, 100],
    [9.0, 100],
    [4.0, 0]
  ];

  it.each(rows)('scoreRamp(%s, 5.5, 7.5) === %s', (value, expected) => {
    expect(scoreRamp(value, 5.5, 7.5)).toBe(expected);
  });

  it('degenerates to a step when zeroAt equals target', () => {
    expect(scoreRamp(7.5, 7.5, 7.5)).toBe(100);
    expect(scoreRamp(7.4, 7.5, 7.5)).toBe(0);
  });

  it('handles a descending ramp', () => {
    expect(scoreRamp(0, 10, 0)).toBe(100);
    expect(scoreRamp(5, 10, 0)).toBe(50);
    expect(scoreRamp(10, 10, 0)).toBe(0);
  });
});

describe('§8.1 counter', () => {
  const rows: [number, number][] = [
    [0, 0],
    [1, 50],
    [2, 100],
    [3.5, 100]
  ];

  it.each(rows)('scoreCounter(%s, 2) === %s', (value, expected) => {
    expect(scoreCounter(value, 2)).toBe(expected);
  });

  it('never leaks a division by zero', () => {
    expect(scoreCounter(0, 0)).toBe(100);
    expect(Number.isFinite(scoreCounter(3, 0))).toBe(true);
  });
});

describe('§8.1 range', () => {
  const rows: [number, number][] = [
    [2.0, 100],
    [3.5, 50],
    [4.5, 0],
    [6.0, 0]
  ];

  it.each(rows)('scoreRange(%s, 2.5, 4.5) === %s', (value, expected) => {
    expect(scoreRange(value, 2.5, 4.5)).toBe(expected);
  });

  it('is a step when good equals bad', () => {
    expect(scoreRange(30, 30, 30)).toBe(100);
    expect(scoreRange(30.1, 30, 30)).toBe(0);
  });
});

describe('§8.1 step', () => {
  const rows: [boolean | number, number][] = [
    [true, 100],
    [false, 0],
    [1, 100]
  ];

  it.each(rows)('scoreStep(%s) === %s', (value, expected) => {
    expect(scoreStep(value)).toBe(expected);
  });

  it('treats 0 as a miss', () => {
    expect(scoreStep(0)).toBe(0);
  });
});

describe('§8.1 learned — the note-dependent score', () => {
  const learned = resolvedById('learned', settings());

  it('true with a note scores 100', () => {
    expect(scoreMetric(learned, true, settings(), { note: 'Bayes vs frequentist' })).toBe(100);
  });

  it('true with an empty note scores 40', () => {
    expect(scoreMetric(learned, true, settings(), { note: '' })).toBe(40);
    expect(scoreMetric(learned, true, settings(), { note: '   ' })).toBe(40);
    expect(scoreMetric(learned, true, settings(), { note: null })).toBe(40);
  });

  it('false with a note scores 0', () => {
    expect(scoreMetric(learned, false, settings(), { note: 'x' })).toBe(0);
  });

  it('null with a note is excluded', () => {
    expect(scoreMetric(learned, null, settings(), { note: 'x' })).toBeNull();
  });
});

describe('§8.2 trend', () => {
  const rows: [number, WeightMode, number][] = [
    [-0.5, 'cut', 100],
    [-1.5, 'cut', 85],
    [-2.5, 'cut', 40],
    [0.1, 'cut', 50],
    [0.4, 'cut', 0],
    [0.5, 'cut', 0],
    [0.2, 'maintain', 100],
    [0.75, 'maintain', 50],
    [1.2, 'maintain', 0],
    [0.3, 'bulk', 100],
    [-0.05, 'bulk', 50],
    [-0.2, 'bulk', 0],
    [0.75, 'bulk', 50],
    [1.0, 'bulk', 0]
  ];

  it.each(rows)('scoreTrend(%s, %s) === %s', (slope, mode, expected) => {
    expect(scoreTrend(slope, mode)).toBeCloseTo(expected, 10);
  });

  it('scores a negative slope symmetrically under maintain', () => {
    expect(scoreTrend(-0.75, 'maintain')).toBeCloseTo(50, 10);
    expect(scoreTrend(-1.2, 'maintain')).toBe(0);
  });

  it('holds the 40 floor below −2.0 %/wk and jumps to 70 just above it', () => {
    expect(scoreTrend(-1.0, 'cut')).toBe(100);
    expect(scoreTrend(-0.2, 'cut')).toBe(100);
    expect(scoreTrend(-2.0, 'cut')).toBe(40);
    expect(scoreTrend(-1.999, 'cut')).toBeCloseTo(70.03, 1);
  });
});

describe('dispatch (03-scoring.md §1.6)', () => {
  it('returns null for an unset metric', () => {
    const protein = resolvedById('protein', settings());
    expect(scoreMetric(protein, null, settings())).toBeNull();
    // A stray `undefined` from a caller must not become a NaN score.
    expect(scoreMetric(protein, undefined as unknown as null, settings())).toBeNull();
  });

  it('refuses a non-boolean toggle, so a number cannot fake a yes', () => {
    const creatine = resolvedById('creatine', settings());
    expect(scoreMetric(creatine, 1, settings())).toBeNull();
    expect(scoreMetric(creatine, 'yes', settings())).toBeNull();
    expect(scoreMetric(creatine, false, settings())).toBe(0);
  });

  it('scores the resolved protein target from settings', () => {
    const protein = resolvedById('protein', settings({ proteinGPerKg: 1.6, bodyweightKg: 80 }));
    expect(scoreMetric(protein, 4, settings())).toBe(100);
    expect(scoreMetric(protein, 2, settings())).toBe(50);
  });

  it('never returns a value outside [0, 100] for an absurd overshoot', () => {
    const cases = [
      ['sleep_hours', 99],
      ['steps', 1e9],
      ['greens', 1e6],
      ['deep_blocks', 500],
      ['protein', 1e6]
    ] as const;
    for (const [id, value] of cases) {
      const metric = resolvedById(id, settings());
      const score = scoreMetric(metric, value, settings());
      expect(score).toBe(100);
    }
  });
});

describe('clamp and band', () => {
  it('clamps to [0, 1]', () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(0.5)).toBe(0.5);
    expect(clamp(2)).toBe(1);
  });

  it('names bands in words, never colour alone (D22)', () => {
    expect(band(95)).toBe('Excellent');
    expect(band(80)).toBe('Strong');
    expect(band(65)).toBe('Steady');
    expect(band(45)).toBe('Slipping');
    expect(band(20)).toBe('Off track');
    expect(band(90)).toBe('Excellent');
    expect(band(75)).toBe('Strong');
    expect(band(60)).toBe('Steady');
    expect(band(40)).toBe('Slipping');
  });
});
