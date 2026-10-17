import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/lib/store/db';
import { migrate, runMigrations, SCHEMA_VERSION, type Migration } from '../../src/lib/store/migrate';

describe('migration harness', () => {
  it('runs version 1 → 2 with a fixture and records the new version', async () => {
    const store = createMemoryStore();
    await store.put('meta', 'saved', { legacy: true });

    const applied: number[] = [];
    const fixtureV2: Migration = async ({ store: kv, log }) => {
      // Example migration: move a legacy key to its versioned name.
      const legacy = await kv.get<{ legacy: boolean }>('meta', 'saved');
      await kv.put('meta', 'saved_v2', { modern: legacy?.legacy === true });
      log('moved saved → saved_v2');
    };

    let version = 1;
    const result = await runMigrations({
      store,
      from: 1,
      to: 2,
      migrations: { 2: fixtureV2 },
      setVersion: async (next) => {
        applied.push(next);
        version = next;
      }
    });

    expect(result).toBe(2);
    expect(version).toBe(2);
    expect(applied).toEqual([2]);
    expect(await store.get('meta', 'saved_v2')).toEqual({ modern: true });
  });

  it('is a no-op when the data is already current', async () => {
    const store = createMemoryStore();
    let called = false;
    let versionWrites = 0;

    const result = await runMigrations({
      store,
      from: 2,
      to: 2,
      migrations: {
        2: async () => {
          called = true;
        }
      },
      setVersion: async () => {
        versionWrites++;
      }
    });

    expect(result).toBe(2);
    expect(called).toBe(false);
    expect(versionWrites).toBe(0);
  });

  it('throws when a version has no migration', async () => {
    const store = createMemoryStore();
    await expect(
      runMigrations({ store, from: 1, to: 3, migrations: { 2: async () => {} } })
    ).rejects.toThrow('version 3');
  });

  it('runs every step in order', async () => {
    const store = createMemoryStore();
    const order: number[] = [];

    await runMigrations({
      store,
      from: 0,
      to: 3,
      migrations: {
        1: async () => void order.push(1),
        2: async () => void order.push(2),
        3: async () => void order.push(3)
      }
    });

    expect(order).toEqual([1, 2, 3]);
  });
});

describe('migrate', () => {
  it('treats a fresh database as current and writes nothing', async () => {
    const store = createMemoryStore();
    expect(await migrate(store)).toBe(SCHEMA_VERSION);
    expect(await store.keys('meta')).toEqual([]);
  });

  it('leaves a current database untouched', async () => {
    const store = createMemoryStore();
    await store.put('meta', 'schemaVersion', SCHEMA_VERSION);
    expect(await migrate(store)).toBe(SCHEMA_VERSION);
  });
});
