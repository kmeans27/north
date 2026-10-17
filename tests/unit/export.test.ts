import { describe, expect, it } from 'vitest';
import { createDayStore } from '../../src/lib/store/days';
import { createMemoryStore } from '../../src/lib/store/db';
import {
  buildExport,
  importBundle,
  parseExport,
  serializeExport,
  toCSV
} from '../../src/lib/store/export';
import { DEFAULT_SETTINGS } from '../../src/lib/store/settings';
import { REGISTRY } from '../../src/lib/metrics/registry';

async function seeded() {
  const kv = createMemoryStore();
  let clock = Date.UTC(2026, 9, 17, 21, 30);
  const store = createDayStore(kv, { now: () => new Date(clock), tz: 'Europe/Berlin' });

  await store.write('2026-10-15', 'protein', 3);
  clock += 1_000;
  await store.write('2026-10-15', 'creatine', true);
  clock += 1_000;
  await store.write('2026-10-16', 'protein', 4);
  clock += 1_000;
  await store.write('2026-10-16', 'sleep_hours', 7.4, 'auto');
  clock += 1_000;
  await store.setNote('2026-10-16', 'Bayes vs frequentist');

  return { store, days: await store.all() };
}

describe('JSON export', () => {
  it('round-trips day documents byte-identically', async () => {
    const { store, days } = await seeded();
    const before = days.map((day) => JSON.stringify(day));

    const text = serializeExport(buildExport(days, DEFAULT_SETTINGS, Date.UTC(2026, 9, 18)));
    await store.clear();
    expect(await store.all()).toEqual([]);

    const bundle = parseExport(text);
    await importBundle(store, bundle);

    const after = (await store.all()).map((day) => JSON.stringify(day));
    expect(after).toEqual(before);
  });

  it('is idempotent: importing the same bundle twice changes nothing', async () => {
    const { store, days } = await seeded();
    const bundle = buildExport(days, DEFAULT_SETTINGS, 1);

    await importBundle(store, bundle);
    const once = (await store.all()).map((day) => JSON.stringify(day));
    await importBundle(store, bundle);
    const twice = (await store.all()).map((day) => JSON.stringify(day));

    expect(twice).toEqual(once);
  });

  it('keeps settings in the bundle', async () => {
    const { days } = await seeded();
    const settings = { ...DEFAULT_SETTINGS, bodyweightKg: 91.5 };
    const bundle = parseExport(serializeExport(buildExport(days, settings, 1)));
    expect(bundle.settings.bodyweightKg).toBe(91.5);
  });

  it('refuses a newer backup version and malformed input', () => {
    expect(() => parseExport('not json')).toThrow('Not valid JSON');
    expect(() => parseExport('{"version":99,"settings":{},"days":[]}')).toThrow('newer');
    expect(() => parseExport('{"version":1,"settings":{},"days":[{"date":"x"}]}')).toThrow(
      'invalid date'
    );
  });
});

describe('CSV export', () => {
  it('puts date first and one column per metric', async () => {
    const { days } = await seeded();
    const lines = toCSV(days).trimEnd().split('\n');
    const header = lines[0]!;

    expect(header).toBe(['date', ...REGISTRY.map((metric) => metric.id)].join(','));
    expect(lines.slice(1)).toHaveLength(2); // one row per day
    expect(header.split(',')).toHaveLength(REGISTRY.length + 1);
  });

  it('writes raw values and leaves missing metrics empty', async () => {
    const { days } = await seeded();
    const lines = toCSV(days).trimEnd().split('\n');
    const header = lines[0]!.split(',');
    const row = lines[1]!.split(',');
    const cell = (id: string): string => row[header.indexOf(id)] ?? '';

    expect(row[0]).toBe('2026-10-15');
    expect(cell('protein')).toBe('3');
    expect(cell('creatine')).toBe('true');
    expect(cell('greens')).toBe('');
    expect(cell('learned')).toBe('');
  });

  it('sorts by date even when the input is unsorted', async () => {
    const { days } = await seeded();
    const reversed = [...days].reverse();
    expect(toCSV(days)).toBe(toCSV(reversed));
  });

  it('ends with a newline', async () => {
    const { days } = await seeded();
    expect(toCSV(days).endsWith('\n')).toBe(true);
  });
});
