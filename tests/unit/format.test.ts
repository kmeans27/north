import { describe, expect, it } from 'vitest';
import {
  formatCompact,
  formatHour,
  formatNumber,
  formatValue,
  joinUnit,
  plural,
  pluralUnit
} from '../../src/lib/format';

/*
 * Count nouns follow their number (04-ux.md §10). The registry stores the
 * plural form (`days`, `servings`), so one has to drop the trailing `s` — and
 * units that are not bare counts must not be touched.
 */
describe('pluralUnit', () => {
  it('drops the trailing s for exactly one', () => {
    expect(pluralUnit(1, 'days')).toBe('day');
    expect(pluralUnit(-1, 'days')).toBe('day');
    expect(pluralUnit(1, 'servings')).toBe('serving');
  });

  it('leaves every other count alone', () => {
    expect(pluralUnit(0, 'days')).toBe('days');
    expect(pluralUnit(2, 'days')).toBe('days');
    expect(pluralUnit(5, 'days')).toBe('days');
  });

  it('does not touch units that are not counts', () => {
    for (const unit of ['h', 'min', 'k', '/wk', '%', '%/wk', '×32 g', '×45 min']) {
      expect(pluralUnit(1, unit)).toBe(unit);
    }
  });
});

describe('formatValue', () => {
  it('reads a count unit in the right number', () => {
    expect(formatValue(1, 'days', 0)).toBe('1 day');
    expect(formatValue(5, 'days', 0)).toBe('5 days');
  });

  it('keeps unset a state, not a number', () => {
    expect(formatValue(null, 'days')).toBe('unset');
  });

  it('leaves the other units as written in the registry', () => {
    expect(formatValue(7.4, 'h', 1)).toBe('7.4 h');
    expect(formatValue(2, 'min', 0)).toBe('2 min');
    expect(formatValue(94, '%', 0)).toBe('94 %');
  });

  it('hugs a unit that starts with a slash', () => {
    expect(formatValue(0, '/wk', 0)).toBe('0/wk');
    expect(formatValue(-0.1, '%/wk', 1)).toBe('−0.1 %/wk');
    expect(joinUnit('9.4', '/wk')).toBe('9.4/wk');
    expect(joinUnit('7.1', 'h')).toBe('7.1 h');
    expect(joinUnit('9.4', '')).toBe('9.4');
  });

  it('uses one minus glyph everywhere', () => {
    expect(formatNumber(-4)).toBe('−4');
    expect(formatValue(-0.8, 'kg', 1)).toBe('−0.8 kg');
    expect(formatNumber(-1234)).toBe('−1,234');
  });

  it('prints a bare hour as a time', () => {
    expect(formatHour(4)).toBe('04:00');
    expect(formatHour(0)).toBe('00:00');
    expect(formatHour(21)).toBe('21:00');
  });

  /*
   * `k` means the value is measured in thousands (02-metrics.md §3, steps), so
   * it must be scaled — `9,400 k` would read as 9.4 million — and a bare `.0`
   * is dropped so a round target reads `7 k`, not `7.0 k`.
   */
  it('prints a value measured in thousands as thousands', () => {
    expect(formatValue(9400, 'k', 0)).toBe('9.4 k');
    expect(formatValue(7000, 'k', 0)).toBe('7 k');
    expect(formatValue(2500, 'k')).toBe('2.5 k');
    expect(formatValue(500, 'k')).toBe('0.5 k');
    expect(formatCompact(9400, 'k')).toBe('9.4k');
    expect(formatCompact(7000, 'k')).toBe('7k');
  });
});

describe('plural', () => {
  it('makes a bare noun plural for anything but one', () => {
    expect(plural(0, 'value')).toBe('values');
    expect(plural(1, 'value')).toBe('value');
    expect(plural(5, 'item')).toBe('items');
    expect(plural(3, 'metric')).toBe('metrics');
  });
});
