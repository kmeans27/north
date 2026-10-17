import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  formatDate,
  formatDateRange,
  isoWeekNumber,
  logicalDate,
  monthKey,
  parseDate,
  startOfWeek,
  toISODate,
  weekKey,
  weekdayIndex
} from '../../src/lib/metrics/dates';

/* 03-scoring.md §8.4. The two derived-metric rows in that table
   (weightSlopePctPerWeek, sleepConsistency) belong to M2's derived.ts and are
   tested in derived.test.ts. */

const utc = (y: number, m: number, d: number, h = 12, min = 0): Date =>
  new Date(Date.UTC(y, m - 1, d, h, min));

describe('logicalDate (cutoff 4)', () => {
  it('03:59 belongs to the previous logical day', () => {
    expect(logicalDate(utc(2026, 10, 17, 3, 59), 4, 'UTC')).toBe('2026-10-16');
  });

  it('04:00 belongs to today', () => {
    expect(logicalDate(utc(2026, 10, 17, 4, 0), 4, 'UTC')).toBe('2026-10-17');
  });

  it('23:30 belongs to today', () => {
    expect(logicalDate(utc(2026, 10, 17, 23, 30), 4, 'UTC')).toBe('2026-10-17');
  });

  it('uses the wall clock of the given zone, not UTC', () => {
    // 01:30 UTC is 03:30 in Berlin (CEST), so still the previous logical day.
    const instant = new Date('2026-10-17T01:30:00Z');
    expect(logicalDate(instant, 4, 'Europe/Berlin')).toBe('2026-10-16');
    // 02:30 UTC is 04:30 in Berlin, a new logical day.
    const later = new Date('2026-10-17T02:30:00Z');
    expect(logicalDate(later, 4, 'Europe/Berlin')).toBe('2026-10-17');
  });

  it('respects a different cutoff hour', () => {
    expect(logicalDate(utc(2026, 10, 17, 3, 59), 0, 'UTC')).toBe('2026-10-17');
    expect(logicalDate(utc(2026, 10, 17, 2, 0), 3, 'UTC')).toBe('2026-10-16');
  });

  it('crosses a year boundary backwards', () => {
    expect(logicalDate(utc(2027, 1, 1, 2, 0), 4, 'UTC')).toBe('2026-12-31');
  });
});

describe('weekKey', () => {
  it('Thursday 2026-10-15 is 2026-W42', () => {
    expect(weekdayIndex('2026-10-15')).toBe(4);
    expect(weekKey('2026-10-15')).toBe('2026-W42');
  });

  it('2027-01-01 (a Friday) belongs to 2026-W53', () => {
    expect(weekdayIndex('2027-01-01')).toBe(5);
    expect(weekKey('2027-01-01')).toBe('2026-W53');
  });

  it('with weekStartsOn 0, a Sunday starts its own week', () => {
    // Sunday 2026-10-18: Sunday-start week → Thursday 2026-10-22 → W43.
    expect(weekdayIndex('2026-10-18')).toBe(0);
    expect(weekKey('2026-10-18', 0)).toBe('2026-W43');
    // The same Sunday under a Monday start belongs to the week of 2026-10-12.
    expect(weekKey('2026-10-18', 1)).toBe('2026-W42');
  });

  it('handles a leap day', () => {
    expect(weekdayIndex('2028-02-29')).toBe(2); // Tuesday
    expect(weekKey('2028-02-29')).toBe('2028-W09');
  });

  it('agrees with ISO week 1 for the first Thursday of a year', () => {
    expect(isoWeekNumber('2026-01-01')).toBe(1);
    expect(isoWeekNumber('2025-12-29')).toBe(1); // Monday of 2026-W01
    expect(isoWeekNumber('2026-01-04')).toBe(1); // Sunday of the same week
  });
});

describe('monthKey', () => {
  it('returns YYYY-MM', () => {
    expect(monthKey('2026-10-17')).toBe('2026-10');
    expect(monthKey('2027-01-01')).toBe('2027-01');
  });

  it('rejects a malformed date', () => {
    expect(() => monthKey('2026-10')).toThrow();
  });
});

describe('calendar arithmetic', () => {
  it('adds days across a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('adds days across a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('counts whole days between dates', () => {
    expect(diffDays('2026-10-01', '2026-10-17')).toBe(16);
    expect(diffDays('2026-10-17', '2026-10-01')).toBe(-16);
    expect(diffDays('2026-10-17', '2026-10-17')).toBe(0);
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('formats a local Date as YYYY-MM-DD', () => {
    expect(toISODate(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07');
  });
});

describe('formatDate', () => {
  it('renders the date line as in 04-ux.md §2', () => {
    expect(weekdayIndex('2026-10-17')).toBe(6);
    expect(formatDate('2026-10-17')).toBe('Saturday, 17 October');
  });

  it('supports medium and short styles', () => {
    expect(formatDate('2026-10-17', 'medium')).toBe('17 October');
    expect(formatDate('2026-10-17', 'short')).toBe('17 Oct');
  });

  it('does not drift across a timezone boundary', () => {
    expect(formatDate('2026-01-01', 'short')).toBe('1 Jan');
  });
});

describe('startOfWeek', () => {
  it('finds the Monday of the week', () => {
    expect(startOfWeek('2026-10-17', 1)).toBe('2026-10-12');
    expect(startOfWeek('2026-10-12', 1)).toBe('2026-10-12');
    expect(startOfWeek('2026-10-18', 1)).toBe('2026-10-12');
  });

  it('honours a Sunday start', () => {
    expect(startOfWeek('2026-10-18', 0)).toBe('2026-10-18');
    expect(startOfWeek('2026-10-17', 0)).toBe('2026-10-11');
  });

  it('crosses a year boundary', () => {
    expect(startOfWeek('2027-01-01', 1)).toBe('2026-12-28');
  });
});

describe('formatDateRange', () => {
  it('repeats the month once inside one month', () => {
    expect(formatDateRange('2026-10-08', '2026-10-14')).toBe('8–14 October');
  });

  it('names both months across a boundary', () => {
    expect(formatDateRange('2026-09-28', '2026-10-04')).toBe('28 Sept – 4 Oct');
  });
});

describe('parseDate', () => {
  it('accepts a canonical ISO date', () => {
    expect(parseDate('2026-10-17')).toBe('2026-10-17');
  });

  it('rejects malformed or impossible dates', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('17/10/2026')).toBeNull();
    expect(parseDate('2026-13-01')).toBeNull();
    expect(parseDate('2026-02-30')).toBeNull();
    expect(parseDate('2026-1-1')).toBeNull();
  });
});
