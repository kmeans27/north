/* tests/unit/sample.test.ts — the sample of docs/V2.1.md §4.
 *
 * `/preview` is only worth looking at if the sample is *legal*: every value has
 * to be one the app could actually have produced, or the page shows a figure no
 * control could ever reach. So the tests below hold the sample to the registry:
 * the same options `/log` offers, the same derived-on-read rule, and no gaps. */

import { describe, expect, it } from 'vitest';
import { addDays, diffDays, startOfWeek, weekdayIndex } from '$lib/metrics/dates';
import {
  monthlyValues,
  sleepConsistency,
  sleepStartMinutes,
  weeklyValues
} from '$lib/metrics/derived';
import { coverage, valueOf } from '$lib/metrics/aggregate';
import { resolveMetrics } from '$lib/metrics/resolve';
import { optionsOf, scoreHeader } from '$lib/today';
import { generateSampleDays, SAMPLE_DAYS, SAMPLE_SEED } from '$lib/sample';
import { DEFAULT_SETTINGS, mergeSettings } from '$lib/store/settings';
import type { Day } from '$lib/metrics/types';

const SETTINGS = mergeSettings(DEFAULT_SETTINGS);
const METRICS = resolveMetrics(SETTINGS);
const END = '2026-10-18';
const DAYS = generateSampleDays({ end: END });

/** A metric whose value is one of a fixed set of cells, not a typed figure. */
const CELLED = new Set(['bins', 'toggle', 'counter', 'segmented']);

function history(end: string): Day[] {
  return DAYS.filter((day) => day.date <= end);
}

describe('the sample is a finished run (docs/V2.1.md §4)', () => {
  it('is 120 contiguous days, oldest first, ending on the given date', () => {
    expect(DAYS).toHaveLength(SAMPLE_DAYS);
    expect(DAYS[0]!.date).toBe(addDays(END, -(SAMPLE_DAYS - 1)));
    expect(DAYS[DAYS.length - 1]!.date).toBe(END);
    for (let index = 1; index < DAYS.length; index++) {
      expect(diffDays(DAYS[index - 1]!.date, DAYS[index]!.date)).toBe(1);
    }
  });

  it('never invents a value the registry cannot hold', () => {
    for (const day of DAYS) {
      for (const metric of METRICS) {
        const value = valueOf(day, metric.id);
        if (value === null) continue;
        // A derived metric stores nothing at all (02-metrics.md §5).
        expect(['sleep_consistency', 'weight_trend']).not.toContain(metric.id);
        // A number metric is a number, a toggle is a boolean.
        if (metric.widget === 'toggle') expect(typeof value).toBe('boolean');
        else expect(typeof value).toBe('number');
      }
    }
  });

  it('keeps every hand-tapped value inside the cells the row offers', () => {
    for (const metric of METRICS) {
      if (!CELLED.has(metric.widget)) continue;
      const cells = optionsOf(metric).map((option) => option.value);
      for (const day of DAYS) {
        const value = valueOf(day, metric.id);
        if (value === null || typeof value !== 'number') continue;
        expect(cells, `${metric.id} on ${day.date}`).toContain(value);
      }
    }
  });

  it('is a day with everything logged — no gaps, no rest days', () => {
    const last = DAYS[DAYS.length - 1]!;
    expect(coverage(last, METRICS)).toBe(1);
    expect(last.restDay).toBeUndefined();

    // The month's two figures are entered once and read for every day of it.
    const monthly = monthlyValues(history(END));
    expect(monthly.savings_rate).not.toBeUndefined();
    expect(monthly.invested).not.toBeUndefined();
  });

  it('tells one story: it starts mediocre and ends strong', () => {
    const score = (end: string): number =>
      scoreHeader({
        day: DAYS.find((day) => day.date === end) ?? null,
        days: history(end),
        metrics: METRICS,
        settings: SETTINGS
      }).day ?? 0;

    const early = score(addDays(END, -100));
    expect(score(END)).toBeGreaterThan(early);
    // Never above 100 of course; the raw mean lands a hair under it.
    expect(Math.round(score(END))).toBe(100);
  });

  it('leaves the current week with the figures a finished week would have', () => {
    const last = DAYS[DAYS.length - 1]!;
    const start = startOfWeek(last.date, SETTINGS.weekStartsOn);
    const week = DAYS.filter((day) => day.date >= start && day.date <= addDays(start, 6));
    const weekly = weeklyValues({ week, history: DAYS });

    expect(week).toHaveLength(7);
    // Two gym sessions a week, on Monday and Thursday, both taken on a strong week.
    expect(weekdayIndex(week[0]!.date)).toBe(1);
    expect(weekly.strength_sessions).toBeGreaterThanOrEqual(2);
    expect(weekly.daylight_days).toBeGreaterThanOrEqual(4);
    expect(weekly.weight_trend).not.toBeNull();
  });

  it('is deterministic: the same seed gives byte-identical days', () => {
    expect(JSON.stringify(generateSampleDays({ end: END }))).toBe(JSON.stringify(DAYS));
    expect(generateSampleDays({ end: END, seed: SAMPLE_SEED })).toEqual(DAYS);
  });

  it('leaves the derived figures inside their own scale', () => {
    // Every night has a sleep start the derived metric can parse, or the metric
    // silently reads zero — which is exactly the bug this sample had at first.
    for (const day of DAYS) expect(sleepStartMinutes(day), day.date).not.toBeNull();

    const consistency = sleepConsistency(DAYS).value ?? 0;
    expect(consistency).toBeGreaterThan(2);
    expect(consistency).toBeLessThan(30);
  });
});
