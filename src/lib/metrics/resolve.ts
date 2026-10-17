/* src/lib/metrics/resolve.ts
 *
 * Merge the canonical registry with the personalisation layer
 * (06-architecture.md §4): "`resolve.ts` merges registry → overrides and returns
 * a frozen `ResolvedMetric[]`. Nothing else in the app reads `REGISTRY` directly."
 *
 * Pure. No Svelte, no browser API, no clock.
 */

import { REGISTRY } from './registry';
import type { MetricDef, MetricId, ResolvedMetric, ScoreOverride, ScoreSpec, Settings } from './types';

/** Fields of `ScoreSpec` a person may retarget. Everything else stays canonical. */
const SCORE_FIELDS: readonly (keyof ScoreOverride)[] = [
  'target',
  'zeroAt',
  'good',
  'bad',
  'max',
  'stretch'
];

/** Apply the function form (protein, weight_trend) so `score` becomes a value. */
export function baseSpec(metric: MetricDef, settings: Settings): ScoreSpec {
  return typeof metric.score === 'function' ? metric.score(settings) : metric.score;
}

/**
 * The score spec for one metric, after settings overrides.
 * Overrides win field by field; absent fields keep the registry value.
 */
export function resolveSpec(metric: MetricDef, settings: Settings): ScoreSpec {
  const base = baseSpec(metric, settings);
  const override = settings.overrides[metric.id];
  if (!override) return base;

  const spec: ScoreSpec = { ...base };
  for (const field of SCORE_FIELDS) {
    const value = override[field];
    if (typeof value === 'number' && Number.isFinite(value)) spec[field] = value;
  }
  return spec;
}

/** One metric, merged. Unknown override keys are ignored; `id` can never change. */
export function resolveMetric(metric: MetricDef, settings: Settings): ResolvedMetric {
  const override = settings.overrides[metric.id];
  const merged: ResolvedMetric = { ...metric, score: resolveSpec(metric, settings) };
  if (!override) return merged;

  if (typeof override.weight === 'number' && Number.isFinite(override.weight)) {
    merged.weight = Math.max(0, override.weight);
  }
  if (typeof override.visible === 'boolean') merged.visible = override.visible;
  if (typeof override.lever === 'string') merged.lever = override.lever;
  if (typeof override.help === 'string') merged.help = override.help;
  if (typeof override.label === 'string') merged.label = override.label;
  if (typeof override.short === 'string') merged.short = override.short;
  if (typeof override.maxHint === 'string') merged.maxHint = override.maxHint;

  return merged;
}

/** Every metric, in registry order, with `hidden` applied. */
export function resolveMetrics(settings: Settings): ResolvedMetric[] {
  const hidden = new Set(settings.hidden);
  return REGISTRY.map((metric) => resolveMetric(metric, settings)).map((metric) =>
    hidden.has(metric.id) ? { ...metric, visible: false } : metric
  );
}

/** Only the metrics a screen should show. */
export function visibleMetrics(settings: Settings): ResolvedMetric[] {
  return resolveMetrics(settings).filter((metric) => metric.visible);
}

/** Look one up. Throws on an unknown id — a typo should not silently score 0. */
export function resolvedById(id: MetricId, settings: Settings): ResolvedMetric {
  const metric = resolveMetrics(settings).find((m) => m.id === id);
  if (!metric) throw new Error(`Unknown metric: ${id}`);
  return metric;
}

/* ─── Masses (02-metrics.md §4, 03-scoring.md §3) ─────────────────────────── */

export interface MetricMasses {
  /** Σ weight of every daily metric; equals the denominator block in dayScore. */
  daily: number;
  weekly: number;
  monthly: number;
  /** Σ weight of the metrics that count toward coverage (the daily subset). */
  coverage: number;
}

/**
 * Sum the resolved weights rather than trusting a literal. `02-metrics.md` §4
 * fixes them at 0.79 / 0.11 / 0.10 and coverage at 0.64, but a retargeted weight
 * must move the denominator with it or the composite silently mis-scales.
 */
export function metricMasses(metrics: readonly ResolvedMetric[]): MetricMasses {
  const sum = (predicate: (m: ResolvedMetric) => boolean): number =>
    metrics.reduce((total, m) => (predicate(m) ? total + m.weight : total), 0);

  return {
    daily: sum((m) => m.cadence === 'daily'),
    weekly: sum((m) => m.cadence === 'weekly'),
    monthly: sum((m) => m.cadence === 'monthly'),
    coverage: sum((m) => m.countsTowardCoverage && m.cadence === 'daily')
  };
}
