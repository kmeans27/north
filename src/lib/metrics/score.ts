/* src/lib/metrics/score.ts — curve primitives and dispatch (03-scoring.md §1).
 *
 * Pure functions only. No Svelte, no browser API, no clock. Rounding happens at
 * display time, never here: "a week of 89.4 must not silently become 89."
 */

import { resolveSpec } from './resolve';
import type { MetricDef, Settings, Value } from './types';

/** Limit `x` to `[lo, hi]`. Exported as the primitive in §1. */
export function clamp(x: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, x));
}

/* ─── 1.1 ramp — higher is better, with a floor ───────────────────────────── */

export function scoreRamp(v: number, zeroAt: number, target: number): number {
  if (target === zeroAt) return v >= target ? 100 : 0;
  return 100 * clamp((v - zeroAt) / (target - zeroAt), 0, 1);
}

/* ─── 1.2 step — binary ───────────────────────────────────────────────────── */

export function scoreStep(v: boolean | number): number {
  return v === true || v === 1 ? 100 : 0;
}

/* ─── 1.3 counter — count toward a target ─────────────────────────────────── */

export function scoreCounter(v: number, target: number): number {
  if (target <= 0) return v >= target ? 100 : 0;
  return 100 * clamp(v / target, 0, 1);
}

/* ─── 1.4 range — lower is better ─────────────────────────────────────────── */

export function scoreRange(v: number, good: number, bad: number): number {
  if (good === bad) return v <= good ? 100 : 0;
  if (v <= good) return 100;
  if (v >= bad) return 0;
  return 100 * (1 - (v - good) / (bad - good));
}

/* ─── 1.5 trend — weight, weekly ──────────────────────────────────────────── */

export type WeightMode = 'cut' | 'maintain' | 'bulk';

/**
 * `slope` is the 28-day EMA slope in percent of bodyweight per week, rounded to
 * two decimals by the caller (derived.ts).
 */
export function scoreTrend(slope: number, mode: WeightMode): number {
  if (mode === 'cut') {
    if (slope <= -2.0) return 40;
    if (slope < -1.0) return 70 + (30 * (slope + 2.0)) / 1.0;
    if (slope <= -0.2) return 100;
    if (slope < 0.4) return (100 * (0.4 - slope)) / 0.6;
    return 0;
  }

  if (mode === 'maintain') {
    const magnitude = Math.abs(slope);
    if (magnitude <= 0.3) return 100;
    if (magnitude < 1.2) return (100 * (1.2 - magnitude)) / 0.9;
    return 0;
  }

  // bulk
  if (slope < -0.2) return 0;
  if (slope < 0.1) return (100 * (slope + 0.2)) / 0.3;
  if (slope <= 0.5) return 100;
  if (slope < 1.0) return (100 * (1.0 - slope)) / 0.5;
  return 0;
}

/* ─── 1.6 dispatch ────────────────────────────────────────────────────────── */

export interface ScoreContext {
  /** The day's one-line note. Only `learned` reads it (D12). */
  note?: string | null | undefined;
}

/**
 * Score one metric value. Returns a float in `[0, 100]`, or `null` when the
 * metric is not present (unset) or cannot be scored.
 *
 * Accepts a `MetricDef` (registry form, `score` may be a function) or an
 * already-resolved metric (`score` is a literal) — the function form is applied
 * here through `resolveSpec`.
 */
export function scoreMetric(
  metric: MetricDef,
  value: Value,
  settings: Settings,
  context: ScoreContext = {}
): number | null {
  if (value === null || value === undefined) return null;

  // A toggle has three states; anything that is not a boolean is not one of them.
  if (metric.widget === 'toggle' && typeof value !== 'boolean') return null;

  // The only note-dependent score in the system (03-scoring.md §1.6, D12).
  if (metric.id === 'learned') {
    const note = context.note ?? null;
    if (value === true) return note !== null && note.trim().length > 0 ? 100 : 40;
    return 0;
  }

  const spec = typeof metric.score === 'function' ? resolveSpec(metric, settings) : metric.score;

  switch (spec.curve) {
    case 'step':
      return typeof value === 'boolean' || typeof value === 'number' ? scoreStep(value) : null;
    case 'ramp':
      return typeof value === 'number' ? scoreRamp(value, spec.zeroAt ?? 0, spec.target) : null;
    case 'counter':
      return typeof value === 'number' ? scoreCounter(value, spec.target) : null;
    case 'range':
      return typeof value === 'number'
        ? scoreRange(value, spec.good ?? spec.target, spec.bad ?? spec.target)
        : null;
    case 'trend':
      return typeof value === 'number' ? scoreTrend(value, spec.mode ?? settings.weightMode) : null;
  }
}

/** Band label for a composite score (03-scoring.md §4). Words, never colour alone. */
export type Band = 'Excellent' | 'Strong' | 'Steady' | 'Slipping' | 'Off track';

export function band(score: number): Band {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Steady';
  if (score >= 40) return 'Slipping';
  return 'Off track';
}
