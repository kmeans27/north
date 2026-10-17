import { describe, expect, it } from 'vitest';
import {
  buildInsights,
  HISTORY_GATE,
  MAX_CARDS,
  MIN_N
} from '../../src/lib/insights/rules';
import { resolveMetrics } from '../../src/lib/metrics/resolve';
import { generateDemoDays } from '../../src/lib/store/demo';
import { dates, perfectDay, settings } from './helpers';
import type { Day } from '../../src/lib/metrics/types';
import type { Insight } from '../../src/lib/insights/rules';

const cfg = settings();
const METRICS = resolveMetrics(cfg);

const build = (days: Day[]): Insight[] => buildInsights({ days, metrics: METRICS, settings: cfg });

const rule = (cards: Insight[], r: Insight['rule']): Insight[] =>
  cards.filter((card) => card.rule === r);

/** A history where the previous day's sleep predicts deep blocks. */
function laggedHistory(goodPairs: number, badPairs: number): Day[] {
  const total = goodPairs + badPairs + 1;
  const out: Day[] = [];
  for (let i = 0; i < total; i++) {
    const sleep = i <= goodPairs - 1 ? 7.5 : 6.0;
    const blocks = i >= 1 && i <= goodPairs ? 4 : 0;
    out.push(perfectDay(dates('2026-09-01', total)[i]!, { sleep_hours: sleep, deep_blocks: blocks }));
  }
  return out;
}

describe('the history gate (02-metrics.md §6)', () => {
  it('renders exactly one "not enough history" card below 14 logged days', () => {
    const cards = build(dates('2026-10-01', 13).map((date) => perfectDay(date)));
    expect(cards).toHaveLength(1);
    expect(cards[0]!.rule).toBe(0);
    expect(cards[0]!.body).toContain(`${HISTORY_GATE} logged days`);
    expect(cards[0]!.n).toBe(13);
  });

  it('renders no gate card at exactly 14 logged days', () => {
    const cards = build(dates('2026-10-01', 14).map((date) => perfectDay(date)));
    expect(rule(cards, 0)).toHaveLength(0);
  });
});

describe('the n = 7 boundary in the lagged-association rule (§8.4 acceptance)', () => {
  it('does not render with 6 days in each bucket', () => {
    expect(rule(build(laggedHistory(6, 6)), 3)).toHaveLength(0);
  });

  it('renders with 7 days in each bucket, and its n is 14', () => {
    const cards = rule(build(laggedHistory(7, 7)), 3);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.n).toBe(14);
    expect(cards[0]!.body).toContain('Correlation, not causation');
  });

  it('states the buckets and the means in words, not a model summary', () => {
    const card = rule(build(laggedHistory(7, 7)), 3)[0]!;
    expect(card.body).toMatch(/^On days after 7 h\+ of sleep you average [\d.]+ (deep blocks|points);/);
    expect(card.body).toContain('after under 7 h');
    expect(card.body).not.toContain('because');
  });

  it('picks the strongest pair by absolute difference', () => {
    // A large sleep-driven spread in the day score beats the block spread.
    const card = rule(build(laggedHistory(7, 7)), 3)[0]!;
    expect(card.body).toContain('points');
  });
});

describe('no card renders below its stated n', () => {
  it('holds for every card the demo history produces', () => {
    const cards = build(generateDemoDays({ days: 120, end: '2026-10-17' }));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(MAX_CARDS);

    for (const card of cards) {
      if (card.rule === 0) continue;
      const floor =
        card.rule === 1
          ? MIN_N.weakest
          : card.rule === 2
            ? MIN_N.momentum
            : card.rule === 3
              ? MIN_N.bucket * 2
              : card.rule === 4
                ? MIN_N.slipping
                : MIN_N.record;
      expect(card.n).toBeGreaterThanOrEqual(floor);
    }
  });

  it('caps the output at five cards', () => {
    const cards = build(generateDemoDays({ days: 500, end: '2026-10-17' }));
    expect(cards.length).toBeLessThanOrEqual(MAX_CARDS);
  });
});

describe('rule 1 — weakest link', () => {
  it('names the weakest pillar and the lever of its lowest metric', () => {
    const days = dates('2026-09-20', 28).map((date) => perfectDay(date, { phone_total: 6 }));
    const card = rule(build(days), 1)[0]!;
    expect(card).toBeTruthy();
    expect(card.pillar).toBe('attention');
    expect(card.body).toContain('Weakest link: Attention · ');
    expect(card.body).toContain('Move the two worst apps off the home screen.');
    expect(card.n).toBe(28);
  });
});

describe('rule 2 — momentum', () => {
  it('reports an improving pillar with the direction in words', () => {
    const prior = dates('2026-09-20', 7).map((date) => perfectDay(date, { phone_total: 6 }));
    const recent = dates('2026-09-27', 7).map((date) => perfectDay(date));
    const cards = rule(build([...prior, ...recent]), 2);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]!.body).toMatch(/is up \d+ points on last week/);
    expect(cards[0]!.body).not.toContain('↑');
  });

  it('says nothing when no pillar moves by four points', () => {
    const days = dates('2026-09-20', 14).map((date) => perfectDay(date));
    expect(rule(build(days), 2)).toHaveLength(0);
  });
});

describe('rule 4 — slipping habit', () => {
  it('reports met-of-total and the lever', () => {
    const days = dates('2026-09-01', 30).map((date, i) =>
      perfectDay(date, i < 10 ? { creatine: false } : {})
    );
    const card = rule(build(days), 4)[0]!;
    expect(card).toBeTruthy();
    expect(card.body).toContain('Creatine met 20 of 30 days.');
    expect(card.body).toContain('The lever:');
  });

  it('says nothing when every habit is above 70 %', () => {
    const days = dates('2026-09-01', 30).map((date) => perfectDay(date));
    expect(rule(build(days), 4)).toHaveLength(0);
  });
});

describe('rule 5 — record', () => {
  it('announces a new best week with its date range', () => {
    const weak = dates('2026-09-14', 14).map((date) => perfectDay(date, { deep_blocks: 0, alcohol: false }));
    const strong = dates('2026-09-28', 7).map((date) => perfectDay(date));
    const card = rule(build([...weak, ...strong]), 5)[0]!;
    expect(card).toBeTruthy();
    expect(card.body).toMatch(/Best week so far: 28 Sept – 4 Oct · \d+/);
  });

  it('says nothing when the best week is not the most recent', () => {
    const strong = dates('2026-09-14', 7).map((date) => perfectDay(date));
    const weak = dates('2026-09-21', 14).map((date) => perfectDay(date, { deep_blocks: 0, alcohol: false }));
    expect(rule(build([...strong, ...weak]), 5)).toHaveLength(0);
  });
});

describe('copy rules (04-ux.md §10, D26)', () => {
  const cards = build(generateDemoDays({ days: 200, end: '2026-10-17' }));

  it('never uses the word "because"', () => {
    for (const card of cards) expect(card.body.toLowerCase()).not.toContain('because');
  });

  it('never uses an exclamation mark or emoji', () => {
    for (const card of cards) {
      expect(card.body).not.toContain('!');
      expect(card.body).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });

  it('is deterministic: identical input gives identical cards', () => {
    const again = build(generateDemoDays({ days: 200, end: '2026-10-17' }));
    expect(again).toEqual(cards);
  });

  it('produces a mixture of cards from the demo history', () => {
    const kinds = new Set(cards.map((card) => card.rule));
    expect(kinds.has(1)).toBe(true);
  });
});

describe('excluded days (device gap, D9)', () => {
  it('drops excluded dates out of every rule', () => {
    const days = dates('2026-09-20', 28).map((date) => perfectDay(date, { phone_total: 6 }));
    const excluded = new Set(days.map((d) => d.date));
    const cards = buildInsights({ days, metrics: METRICS, settings: cfg, excluded });
    expect(cards).toHaveLength(1);
    expect(cards[0]!.rule).toBe(0);
  });
});
