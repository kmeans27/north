/* tests/unit/health.test.ts — the Apple Health hand import (docs/V2.1.md §6).
 *
 * Three promises the importer makes, and this file holds it to them: a missing
 * day stays a gap, a value a human typed is never overwritten, and the file that
 * arrives is validated before a byte of it is trusted.
 */

import { describe, expect, it } from 'vitest';
import {
  HEALTH_FORMAT,
  healthClock,
  healthFields,
  mergeHealth,
  parseHealthFile,
  planHealthImport,
  type HealthFile
} from '../../src/lib/store/health';
import { day, val } from './helpers';

/** A file with whatever body is wanted, in the contract's shape. */
function file(days: unknown[], extra: Record<string, unknown> = {}): HealthFile {
  return parseHealthFile(JSON.stringify({ format: HEALTH_FORMAT, days, ...extra }));
}

describe('the file', () => {
  it('reads the contract, in date order, whatever order it arrived in', () => {
    const parsed = file([
      { date: '2026-03-09', steps: 8000 },
      { date: '2026-03-02', steps: 4000, sleepHours: 7.2 }
    ]);

    expect(parsed.days.map((entry) => entry.date)).toEqual(['2026-03-02', '2026-03-09']);
    expect(parsed.days[1]).toEqual({ date: '2026-03-09', steps: 8000 });
    expect(parsed.format).toBe(HEALTH_FORMAT);
  });

  it('keeps the metadata a future app would write, and tolerates its absence', () => {
    expect(file([{ date: '2026-03-02', steps: 1 }], { source: 'ios-app' }).source).toBe('ios-app');
    expect(file([{ date: '2026-03-02', steps: 1 }]).generated).toBeNull();
  });

  it('refuses anything that is not a north.health.v1 file', () => {
    expect(() => parseHealthFile('not json at all')).toThrow(/valid JSON/);
    expect(() => parseHealthFile('[]')).toThrow(/not an object/);
    expect(() => parseHealthFile('{"format":"apple.export.v3","days":[]}')).toThrow(
      /north\.health\.v1/
    );
    expect(() => parseHealthFile(`{"format":"${HEALTH_FORMAT}"}`)).toThrow(/days array/);
  });

  it('refuses a day with no date, a date twice, and a day that carries nothing', () => {
    expect(() => file([{ steps: 100 }])).toThrow(/invalid date/);
    expect(() => file([{ date: '2026-03-02', steps: 1 }, { date: '2026-03-02', steps: 2 }])).toThrow(
      /twice/
    );
    expect(() => file([{ date: '2026-03-02' }])).toThrow(/no health values/);
  });

  it('refuses a value that could not be true, rather than storing it', () => {
    expect(() => file([{ date: '2026-03-02', sleepHours: 30 }])).toThrow(/out of range/);
    expect(() => file([{ date: '2026-03-02', steps: 1.5 }])).toThrow(/whole number/);
    expect(() => file([{ date: '2026-03-02', weightKg: 4 }])).toThrow(/out of range/);
    expect(() => file([{ date: '2026-03-02', steps: 'lots' }])).toThrow(/not a number/);
    expect(() => file([{ date: '2026-03-02', sleepStart: '25:00' }])).toThrow(/time of day/);
  });

  it('reads a clock however it is written, and only a clock', () => {
    expect(healthClock('7:05')).toBe('07:05');
    expect(healthClock('23:12:59')).toBe('23:12');
    expect(healthClock('2026-03-02 23:12:00 +0100')).toBeNull();
    expect(healthClock(7)).toBeNull();
  });

  it('rolls every field into the one list of things it would set', () => {
    const fields = healthFields(
      file([
        {
          date: '2026-03-02',
          sleepHours: 7.2,
          sleepStart: '23:10',
          steps: 4000,
          strengthSessions: 1,
          daylightMinutes: 30,
          weightKg: 80.4
        }
      ])
    );

    expect(fields.map((field) => field.slot.key)).toEqual([
      'sleep_hours',
      'sleepStart',
      'steps',
      'strength_sessions',
      'daylightMinutes',
      'weightKg'
    ]);
    expect(fields.every((field) => field.date === '2026-03-02')).toBe(true);
  });
});

describe('the plan', () => {
  const imported = file([
    { date: '2026-03-02', steps: 4000, sleepHours: 7.2 },
    { date: '2026-03-03', steps: 5000 }
  ]);

  it('writes everything on a device with nothing on it', () => {
    const plan = planHealthImport(imported, []);

    expect(plan.writes).toHaveLength(3);
    expect(plan.same).toBe(0);
    expect(plan.kept).toEqual([]);
    expect(plan.days).toBe(2);
    expect([plan.from, plan.to]).toEqual(['2026-03-02', '2026-03-03']);
  });

  it('never overwrites a value a human typed, and says it kept it', () => {
    const existing = [day('2026-03-02', { steps: 9000 })];
    const plan = planHealthImport(imported, existing);

    expect(plan.kept.map((field) => field.slot.key)).toEqual(['steps']);
    expect(plan.writes.map((field) => field.slot.key)).toEqual(['sleep_hours', 'steps']);
    expect(plan.writes.map((field) => field.date)).toEqual(['2026-03-02', '2026-03-03']);
  });

  it('overwrites a value this device got from a file or a sync: it is not locked', () => {
    const device = { date: '2026-03-03', tz: 'UTC', values: { steps: val(1000, 'import') } };
    const plan = planHealthImport(imported, [device]);

    expect(plan.kept).toEqual([]);
    expect(plan.writes.map((field) => `${field.date} ${field.slot.key}`)).toEqual([
      '2026-03-02 sleep_hours',
      '2026-03-02 steps',
      '2026-03-03 steps'
    ]);
  });

  it('counts a field that already reads the same, and does not write it', () => {
    const same = file([{ date: '2026-03-02', sleepHours: 7.2 }]);
    const plan = planHealthImport(same, [day('2026-03-02', { sleep_hours: 7.2 })]);

    expect(plan.same).toBe(1);
    expect(plan.writes).toEqual([]);
  });

  it('treats an extra the device already has as the same too', () => {
    const plan = planHealthImport(file([{ date: '2026-03-02', weightKg: 80.4 }]), [
      { date: '2026-03-02', tz: 'UTC', values: {}, extras: { weightKg: 80.4 } }
    ]);

    expect(plan.same).toBe(1);
    expect(plan.writes).toEqual([]);
  });

  it('leaves a missing day missing: the file only writes what it carries', () => {
    const plan = planHealthImport(file([{ date: '2026-03-05', steps: 100 }]), []);
    expect(plan.writes.map((field) => field.date)).toEqual(['2026-03-05']);
  });
});

describe('the merge', () => {
  const imported = file([
    {
      date: '2026-03-02',
      sleepHours: 7.2,
      sleepStart: '23:10',
      steps: 4000,
      strengthSessions: 1,
      daylightMinutes: 42,
      weightKg: 80.4
    },
    { date: '2026-03-04', steps: 6000 }
  ]);

  it('stores device metrics as values a later sync may refresh, never locked', () => {
    const { days } = mergeHealth(imported, []);
    const merged = days[0]!;

    expect(merged.date).toBe('2026-03-02');
    expect(merged.values.steps).toEqual({ v: 4000, src: 'import', t: 0 });
    expect(merged.values.steps?.locked).toBeUndefined();
    expect(merged.values.sleep_hours?.v).toBe(7.2);
    expect(merged.values.strength_sessions?.v).toBe(1);
  });

  it('stores the derived inputs as extras, where the registry reads them', () => {
    const { days } = mergeHealth(imported, []);
    expect(days[0]!.extras).toEqual({ sleepStart: '23:10', daylightMinutes: 42, weightKg: 80.4 });
  });

  it('returns only the days it changes, so a day it does not mention cannot be deleted', () => {
    const { days } = mergeHealth(imported, []);
    expect(days.map((entry) => entry.date)).toEqual(['2026-03-02', '2026-03-04']);
  });

  it('keeps everything else the day already had', () => {
    const existing = day(
      '2026-03-02',
      { protein: 3, learned: true },
      { note: 'A line.', restDay: false, extras: { sleepStart: '22:00', weightKg: 81 } }
    );
    const { days } = mergeHealth(file([{ date: '2026-03-02', steps: 4000 }]), [existing]);
    const merged = days[0]!;

    expect(merged.values.protein?.v).toBe(3);
    expect(merged.values.learned?.v).toBe(true);
    expect(merged.note).toBe('A line.');
    expect(merged.tz).toBe('UTC');
    expect(merged.extras).toEqual({ sleepStart: '22:00', weightKg: 81 });
  });

  it('keeps a hand-typed value and still writes the rest of the day', () => {
    const existing = day('2026-03-02', { steps: 9000 });
    const { days, plan } = mergeHealth(file([{ date: '2026-03-02', steps: 4000, sleepHours: 6.9 }]), [
      existing
    ]);

    expect(plan.kept.map((field) => field.slot.key)).toEqual(['steps']);
    expect(days[0]!.values.steps?.v).toBe(9000);
    expect(days[0]!.values.sleep_hours?.v).toBe(6.9);
  });

  it('never mutates the days it was handed', () => {
    const existing = day('2026-03-02', { steps: 9000 }, { extras: { weightKg: 81 } });
    const before = JSON.stringify(existing);
    mergeHealth(imported, [existing]);
    expect(JSON.stringify(existing)).toBe(before);
  });

  it('carries an override forward: a correction keeps its flag', () => {
    const existing = {
      date: '2026-03-02',
      tz: 'UTC',
      values: { steps: { v: 1000, src: 'import' as const, t: 0, overridden: true } }
    };
    const { days } = mergeHealth(file([{ date: '2026-03-02', steps: 4000 }]), [existing]);
    expect(days[0]!.values.steps?.overridden).toBe(true);
  });

  it('leaves a day the file cannot improve out of the write list', () => {
    const same = file([{ date: '2026-03-02', steps: 4000 }]);
    const { days } = mergeHealth(same, [day('2026-03-02', { steps: 4000 })]);
    expect(days).toEqual([]);
  });
});
