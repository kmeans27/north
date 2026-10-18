import { describe, expect, it } from 'vitest';
import { formatValue, plural, pluralUnit } from '../../src/lib/format';

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
    expect(formatValue(9.1, 'k', 1)).toBe('9.1 k');
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
