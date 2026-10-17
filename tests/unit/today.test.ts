/* tests/unit/today.test.ts — the Today screen's pure model (M3).
 *
 * The ordering rule is 04-ux.md §2; the widgets are §3; the score header is
 * §2 plus 03-scoring.md §2–§5. Nothing here touches the DOM: the components are
 * thin, and everything that can be wrong is in `today.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_OPTIONS,
  SEVEN_DAY,
  SPARKLINE_DAYS,
  TODAY_ROW_LIMIT,
  aboveTarget,
  autoValue,
  controlFor,
  optionsOf,
  rowValue,
  scoreAnnouncement,
  scoreHeader,
  scoreTone,
  todayOrder,
  weakestLink,
  type ScoreHeaderModel,
  type TodayOptions
} from '../../src/lib/today';
import { buildInsights } from '../../src/lib/insights/rules';
import { resolveMetrics } from '../../src/lib/metrics/resolve';
import type { MetricId, ResolvedMetric } from '../../src/lib/metrics/types';
import { day, dates, METRICS, perfectDay, PERFECT_DAILY, settings } from './helpers';

const byId = (id: MetricId, metrics: readonly ResolvedMetric[] = METRICS): ResolvedMetric => {
  const metric = metrics.find((m) => m.id === id);
  if (!metric) throw new Error(`no metric ${id}`);
  return metric;
};

/** The day's options, for the common case. */
function options(overrides: Partial<TodayOptions> = {}): TodayOptions {
  return {
    day: null,
    days: [],
    metrics: METRICS,
    settings: settings(),
    ...overrides
  };
}

/** Manual daily metrics, in registry order — the NEEDS YOU group of an empty day. */
const MANUAL_DAILY: MetricId[] = [
  'protein',
  'creatine',
  'greens',
  'alcohol',
  'deep_blocks',
  'learned',
  'read',
  'phone_total',
  'social_min'
];

describe('controlFor', () => {
  it('maps every widget to its control, and a note to nothing', () => {
    expect(controlFor('toggle')).toBe('triState');
    expect(controlFor('counter')).toBe('choice');
    expect(controlFor('segmented')).toBe('segmented');
    expect(controlFor('bins')).toBe('bins');
    expect(controlFor('number')).toBe('number');
    expect(controlFor('note')).toBeNull();
  });
});

describe('todayOrder — the ordering rule (04-ux.md §2)', () => {
  it('lists every unlogged manual metric, in registry order', () => {
    const order = todayOrder(options());
    expect(order.needsYou).toEqual(MANUAL_DAILY);
    expect(order.logged).toEqual([]);
    expect(order.weekly).toEqual([]);
    expect(order.order).toEqual(MANUAL_DAILY);
  });

  it('moves logged rows into the dimmed group and keeps registry order inside it', () => {
    const order = todayOrder(
      options({ day: day('2026-10-17', { read: true, protein: 3 }) })
    );

    expect(order.needsYou).toEqual([
      'creatine',
      'greens',
      'alcohol',
      'deep_blocks',
      'learned',
      'phone_total',
      'social_min'
    ]);
    expect(order.logged).toEqual(['protein', 'read']);
    expect(order.order).toEqual([...order.needsYou, 'protein', 'read']);
  });

  it('counts `false` and `0` as logged, not as missing (D3, D4)', () => {
    const order = todayOrder(options({ day: day('2026-10-17', { creatine: false, protein: 0 }) }));
    expect(order.logged).toEqual(['protein', 'creatine']);
    expect(order.needsYou).not.toContain('creatine');
    expect(order.needsYou).not.toContain('protein');
    expect(order.needsYouCount).toBe(MANUAL_DAILY.length);
  });

  it('adds weekly metrics that have data but are not yet met', () => {
    const order = todayOrder(
      options({ day: day('2026-10-17', {}), weekly: { strength_sessions: 1, daylight_days: 4 } })
    );
    expect(order.weekly).toEqual(['strength_sessions', 'daylight_days']);
    expect(order.order.slice(-2)).toEqual(['strength_sessions', 'daylight_days']);
  });

  it('drops a weekly metric that is met, and one with no data', () => {
    const met = todayOrder(options({ weekly: { strength_sessions: 2, daylight_days: 5 } }));
    expect(met.weekly).toEqual([]);

    const absent = todayOrder(options({ weekly: {} }));
    expect(absent.weekly).toEqual([]);
  });

  it('puts needsYou ⧺ logged ⧺ weekly behind a `+ n more` split', () => {
    const order = todayOrder(options());
    expect(TODAY_ROW_LIMIT).toBe(6);
    expect(order.visible).toHaveLength(6);
    expect(order.visible).toEqual(MANUAL_DAILY.slice(0, 6));
    expect(order.hidden).toEqual(MANUAL_DAILY.slice(6));
    expect(order.order).toEqual([...order.visible, ...order.hidden]);
  });

  it('keeps the nine-item count after logging, because the heading counts rows', () => {
    const order = todayOrder(options({ day: perfectDay('2026-10-17') }));
    expect(order.needsYou).toEqual([]);
    expect(order.logged).toEqual(MANUAL_DAILY);
    expect(order.needsYouCount).toBe(MANUAL_DAILY.length);
  });

  it('is a pure snapshot: identical inputs give identical output (D18)', () => {
    const view = day('2026-10-17', { protein: 4, read: true });
    const first = todayOrder(options({ day: view }));
    const second = todayOrder(options({ day: view }));
    expect(second).toEqual(first);
  });

  it('does not move a row when only its value changes inside the group', () => {
    const low = todayOrder(options({ day: day('2026-10-17', { protein: 1, read: false }) }));
    const high = todayOrder(options({ day: day('2026-10-17', { protein: 4, read: true }) }));
    expect(low.order).toEqual(high.order);
  });

  it('honours an explicit limit', () => {
    const order = todayOrder(options({ limit: 3 }));
    expect(order.visible).toEqual(MANUAL_DAILY.slice(0, 3));
    expect(order.hidden).toEqual(MANUAL_DAILY.slice(3));
  });

  it('hides metrics the settings switch off', () => {
    const metrics = resolveMetrics(settings({ hidden: ['protein', 'read'] }));
    const order = todayOrder(options({ metrics }));
    expect(order.order).not.toContain('protein');
    expect(order.order).not.toContain('read');
  });

  it('keeps only daily metrics in NEEDS YOU — weekly and monthly never land there', () => {
    const order = todayOrder(options());
    expect(order.needsYou).not.toContain('savings_rate');
    expect(order.needsYou).not.toContain('weight_trend');
    expect(order.needsYou).not.toContain('strength_sessions');
  });

  it('caps the keyboard-reachable options at seven (04-ux.md §4)', () => {
    // Every option list on Today must fit under the digit keys.
    for (const id of MANUAL_DAILY) {
      expect(optionsOf(byId(id)).length).toBeLessThanOrEqual(MAX_OPTIONS);
    }
  });
});

describe('todayOrder — the automatic strip', () => {
  it('lists the auto metrics that have data, in registry order', () => {
    const order = todayOrder(
      options({
        day: day('2026-10-17', { sleep_hours: 7.4, steps: 8200, adult: true }),
        derived: { sleep_consistency: 22 },
        weekly: { strength_sessions: 2, daylight_days: 4, weight_trend: -0.4 }
      })
    );

    expect(order.auto).toEqual([
      'sleep_hours',
      'sleep_consistency',
      'steps',
      'strength_sessions',
      'daylight_days',
      'weight_trend',
      'adult'
    ]);
  });

  it('omits an auto metric with no data, and the collector metrics it never sees', () => {
    const order = todayOrder(options({ day: day('2026-10-17', { sleep_hours: 7.4 }) }));
    expect(order.auto).toEqual(['sleep_hours']);
    expect(order.auto).not.toContain('distraction_min');
  });

  it('never repeats a manual metric in the strip', () => {
    const order = todayOrder(options({ day: perfectDay('2026-10-17'), weekly: {} }));
    for (const id of MANUAL_DAILY) expect(order.auto).not.toContain(id);
  });
});

describe('autoValue', () => {
  it('prefers the stored value over the computed one', () => {
    const opts = options({ day: day('2026-10-17', { sleep_hours: 8.1 }), derived: { sleep_hours: 7.4 } });
    expect(autoValue(opts, 'sleep_hours')).toBe(8.1);
  });

  it('falls back to the computed value, then to the period value', () => {
    expect(autoValue(options({ derived: { sleep_consistency: 18 } }), 'sleep_consistency')).toBe(18);
    expect(autoValue(options({ weekly: { weight_trend: -0.42 } }), 'weight_trend')).toBe(-0.42);
  });

  it('returns null when there is nothing to show', () => {
    expect(autoValue(options(), 'weight_trend')).toBeNull();
    expect(autoValue(options({ day: day('2026-10-17', {}) }), 'steps')).toBeNull();
  });

  it('keeps a boolean false as a real value', () => {
    expect(autoValue(options({ day: day('2026-10-17', { adult: false }) }), 'adult')).toBe(false);
  });
});

describe('rowValue', () => {
  it('reports unset for a metric with no entry', () => {
    const value = rowValue(day('2026-10-17', {}), byId('creatine'), settings());
    expect(value).toEqual({ value: null, logged: false, score: null, overridden: false });
  });

  it('scores `false` as 0 and still counts it as logged (acceptance 5)', () => {
    const unset = rowValue(day('2026-10-17', {}), byId('creatine'), settings());
    const no = rowValue(day('2026-10-17', { creatine: false }), byId('creatine'), settings());
    const yes = rowValue(day('2026-10-17', { creatine: true }), byId('creatine'), settings());

    expect(unset.score).toBeNull();
    expect(no).toMatchObject({ value: false, logged: true, score: 0 });
    expect(yes).toMatchObject({ value: true, logged: true, score: 100 });
    expect(no.score).not.toBe(unset.score);
  });

  it('scores `0` as present, not as missing', () => {
    const value = rowValue(day('2026-10-17', { protein: 0 }), byId('protein'), settings());
    expect(value).toMatchObject({ value: 0, logged: true, score: 0 });
  });

  it('gives learned its note-dependent score (D12)', () => {
    const without = rowValue(day('2026-10-17', { learned: true }), byId('learned'), settings());
    const with_ = rowValue(
      day('2026-10-17', { learned: true }, { note: 'A written line.' }),
      byId('learned'),
      settings()
    );
    expect(without.score).toBe(40);
    expect(with_.score).toBe(100);
  });

  it('flags a hand-edited auto value (03-scoring.md §7)', () => {
    const view = day('2026-10-17', {});
    view.values.steps = { v: 9000, src: 'auto', t: 0, overridden: true };
    expect(rowValue(view, byId('steps'), settings()).overridden).toBe(true);
  });

  it('returns an empty row for a day that does not exist', () => {
    expect(rowValue(null, byId('protein'), settings())).toEqual({
      value: null,
      logged: false,
      score: null,
      overridden: false
    });
  });
});

describe('optionsOf', () => {
  it('gives a counter the cells 0..target — overshoot is not a cell (D7)', () => {
    expect(optionsOf(byId('protein')).map((o) => o.label)).toEqual(['0', '1', '2', '3', '4']);
    expect(optionsOf(byId('greens')).map((o) => o.label)).toEqual(['0', '1', '2', '3', '4', '5']);
  });

  it('gives a toggle the three states the digit keys reach, in order', () => {
    expect(optionsOf(byId('creatine'))).toEqual([
      { label: '·', value: null, spoken: 'unset' },
      { label: '✓', value: true, spoken: 'yes' },
      { label: '✗', value: false, spoken: 'no' }
    ]);
  });

  it('follows a retargeted protein anchor count', () => {
    const metrics = resolveMetrics(settings({ proteinGPerKg: 2 }));
    expect(optionsOf(byId('protein', metrics)).map((o) => o.value)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('stores 3.5 for the `3+` cell (04-ux.md §3)', () => {
    expect(optionsOf(byId('deep_blocks'))).toEqual([
      { label: '0', value: 0 },
      { label: '1', value: 1 },
      { label: '2', value: 2 },
      { label: '3+', value: 3.5 }
    ]);
  });

  it('uses the registry bins verbatim', () => {
    expect(optionsOf(byId('phone_total'))).toEqual([
      { label: '≤ 2h', value: 1.5 },
      { label: '2–3h', value: 2.5 },
      { label: '3–4h', value: 3.5 },
      { label: '4–5h', value: 4.5 },
      { label: '5h+', value: 6 }
    ]);
  });
});

describe('aboveTarget', () => {
  it('phrases overshoot as text and never as a score (03-scoring.md §1.1)', () => {
    expect(aboveTarget(byId('sleep_hours'), 8.5)).toBe('1.0 h above target');
    expect(aboveTarget(byId('sleep_hours'), 7.5)).toBeNull();
    expect(aboveTarget(byId('sleep_hours'), 6.5)).toBeNull();
    expect(aboveTarget(byId('sleep_hours'), true)).toBeNull();
  });
});

describe('scoreHeader', () => {
  it('is empty with no history at all', () => {
    const header = scoreHeader(options());
    expect(header).toMatchObject({
      day: null,
      previous: null,
      sevenDay: null,
      streak: 0,
      coverage: 0,
      logged: 0,
      total: 14
    });
    expect(header.sparkline).toEqual([]);
  });

  it('reads a run of perfect days as 100 / 100 / 3', () => {
    const days = dates('2026-10-15', 3).map((date) => perfectDay(date));
    const header = scoreHeader(options({ day: days[2]!, days }));

    // A weighted mean of exact hundreds still carries float dust.
    expect(header.day).toBeCloseTo(100, 6);
    expect(header.previous).toBeCloseTo(100, 6);
    expect(header.sevenDay).toBeCloseTo(100, 6);
    expect(header.streak).toBe(3);
    expect(header.coverage).toBe(1);
    expect(header.logged).toBe(14);
    expect(header.total).toBe(14);
    expect(header.sparkline.map((score) => (score === null ? null : Math.round(score)))).toEqual([
      100, 100, 100
    ]);
  });

  it('withholds the day score below 25 % coverage (04-ux.md §9)', () => {
    const sparse = day('2026-10-17', { deep_blocks: 2 });
    const header = scoreHeader(options({ day: sparse, days: [sparse] }));
    expect(header.day).toBeNull();
    expect(header.logged).toBe(1);
    expect(header.coverage).toBeCloseTo(0.13 / 0.64, 5);
  });

  it('shows a day between 25 % and 70 % but keeps it out of the 7-day mean (D8)', () => {
    const partial = day('2026-10-17', {
      protein: 4,
      creatine: true,
      greens: 5,
      alcohol: true,
      phone_total: 2.5,
      social_min: 15
    });
    const header = scoreHeader(options({ day: partial, days: [partial] }));

    expect(header.coverage).toBeGreaterThan(0.25);
    expect(header.coverage).toBeLessThan(0.7);
    expect(header.day).not.toBeNull();
    expect(header.day!).toBeGreaterThan(0);
    expect(header.day!).toBeLessThanOrEqual(100);
    expect(header.sparkline).toEqual([null]);
    expect(header.sevenDay).toBeNull();
  });

  it('averages only the qualifying days, over at most seven', () => {
    const week = [
      ...dates('2026-10-11', 5).map((date) => perfectDay(date)),
      day('2026-10-16', { deep_blocks: 2 }),
      day('2026-10-17', { deep_blocks: 1 })
    ];
    const header = scoreHeader(options({ day: week[6]!, days: week }));
    expect(header.sparkline.map((score) => (score === null ? null : Math.round(score)))).toEqual([
      100, 100, 100, 100, 100, null, null
    ]);
    expect(header.sevenDay).toBeCloseTo(100, 6);
    expect(SEVEN_DAY).toBe(7);
  });

  it('reads the previous day even when the viewed day is not in history', () => {
    const days = dates('2026-10-15', 2).map((date) => perfectDay(date));
    const header = scoreHeader(options({ day: perfectDay('2026-10-17'), days }));
    expect(header.previous).toBeCloseTo(100, 6);
  });

  it('keeps the sparkline inside its 30-day window', () => {
    const days = dates('2026-08-01', 45).map((date) => perfectDay(date));
    const header = scoreHeader(options({ day: days.at(-1)!, days }));
    expect(SPARKLINE_DAYS).toBe(30);
    expect(header.sparkline).toHaveLength(30);
    expect(header.streak).toBe(45);
  });

  it('treats a rest day as neutral for the streak (03-scoring.md §7)', () => {
    const rest = day('2026-10-17', { ...PERFECT_DAILY }, { restDay: true });
    const days = [perfectDay('2026-10-15'), perfectDay('2026-10-16'), rest];
    const header = scoreHeader(options({ day: rest, days }));

    expect(header.day).toBeCloseTo(100, 6);
    // The rest day neither breaks nor extends: the two logged days stand.
    expect(header.streak).toBe(2);
    expect(header.total).toBe(4);
  });

  it('reports the viewed day and the two before it for the red gate', () => {
    const days = dates('2026-10-15', 3).map((date) => perfectDay(date));
    const header = scoreHeader(options({ day: days[2]!, days }));
    expect(header.recent).toHaveLength(3);
    expect(header.recent.map((score) => Math.round(score ?? -1))).toEqual([100, 100, 100]);

    const gaps = scoreHeader(options({ day: perfectDay('2026-10-17'), days: [perfectDay('2026-10-16')] }));
    expect(gaps.recent.slice(0, 1)).toEqual([null]);
  });
});

describe('scoreTone (03-scoring.md §4, D22)', () => {
  it('follows the band boundaries', () => {
    expect(scoreTone(92, [80])).toBe('accent');
    expect(scoreTone(75, [80])).toBe('ink');
    expect(scoreTone(60, [80])).toBe('ink');
    expect(scoreTone(45, [80])).toBe('warn');
  });

  it('withholds red until three consecutive days below 40', () => {
    expect(scoreTone(35, [35, 35])).toBe('warn');
    expect(scoreTone(35, [35, 35, 35])).toBe('bad');
    expect(scoreTone(35, [null, 35, 35])).toBe('warn');
    expect(scoreTone(35, [82, 35, 35])).toBe('warn');
  });
});

describe('weakestLink (02-metrics.md §6, rule 1)', () => {
  const weakAttention = (date: string) => perfectDay(date, { social_min: 150 });

  it('needs the rule\u2019s sample size', () => {
    const days = dates('2026-10-05', 13).map(weakAttention);
    expect(weakestLink(options({ day: days.at(-1)!, days }))).toBeNull();
  });

  it('names the lowest pillar, its score and the lever inside it', () => {
    const days = dates('2026-10-04', 14).map(weakAttention);
    const link = weakestLink(options({ day: days.at(-1)!, days }));

    expect(link).not.toBeNull();
    expect(link!.pillar).toBe('attention');
    expect(link!.pillarLabel).toBe('Attention');
    expect(link!.metricId).toBe('social_min');
    expect(link!.score).toBeGreaterThan(60);
    expect(link!.score).toBeLessThan(75);
    expect(link!.lever).toContain('30-minute ceiling');
    expect(link!.n).toBe(14);
  });

  it('agrees with the insight rule it mirrors', () => {
    const days = dates('2026-10-04', 14).map(weakAttention);
    const link = weakestLink(options({ day: days.at(-1)!, days }));
    const card = buildInsights({ days, metrics: METRICS, settings: settings() }).find(
      (insight) => insight.rule === 1
    );

    expect(card).toBeDefined();
    expect(card!.body).toContain(link!.pillarLabel);
    expect(card!.body).toContain(String(Math.round(link!.score)));
    expect(card!.n).toBe(link!.n);
  });
});

describe('scoreAnnouncement (04-ux.md §12)', () => {
  const header = (overrides: Partial<ScoreHeaderModel>): ScoreHeaderModel => ({
    day: null,
    previous: null,
    sevenDay: null,
    streak: 0,
    sparkline: [],
    recent: [],
    coverage: 0,
    logged: 0,
    total: 14,
    ...overrides
  });

  it('states the direction in words', () => {
    expect(scoreAnnouncement(header({ day: 82, previous: 79 }))).toBe('Today 82, up from 79.');
    expect(scoreAnnouncement(header({ day: 79, previous: 82 }))).toBe('Today 79, down from 82.');
    expect(scoreAnnouncement(header({ day: 80, previous: 79.6 }))).toBe(
      'Today 80, level with yesterday.'
    );
  });

  it('says what is missing instead of inventing a number', () => {
    expect(scoreAnnouncement(header({}))).toBe('Nothing logged yet today.');
    expect(scoreAnnouncement(header({ logged: 3 }))).toBe('Logged 3 of 14 today.');
    expect(scoreAnnouncement(header({ day: 82 }))).toBe('Today 82.');
  });
});
