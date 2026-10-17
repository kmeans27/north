/* src/lib/store/migrate.ts — versioned data migrations (M1, 08-build-plan.md).
 *
 * The harness is deliberately tiny and generic: it runs every migration in
 * order from `from + 1` to `to`, records progress after each step, and is a
 * no-op when the data is already current. The index/meta schema version is
 * tracked separately from the IndexedDB version, so adding a data migration
 * never needs a destructive database upgrade.
 */

import type { KeyValueStore } from './db';

export interface MigrationContext {
  store: KeyValueStore;
  log: (message: string) => void;
}

export type Migration = (context: MigrationContext) => Promise<void>;

export interface MigrationPlan {
  store: KeyValueStore;
  from: number;
  to: number;
  migrations: Record<number, Migration>;
  /** Persist the new version after each successful step. */
  setVersion?: (version: number) => Promise<void>;
  log?: (message: string) => void;
}

/** Run the plan. Returns the resulting version. Throws if a step is missing. */
export async function runMigrations(plan: MigrationPlan): Promise<number> {
  const log = plan.log ?? ((): void => {});
  if (plan.from >= plan.to) return plan.from;

  let version = plan.from;
  for (let next = plan.from + 1; next <= plan.to; next++) {
    const migration = plan.migrations[next];
    if (!migration) throw new Error(`No migration registered for version ${next}`);
    log(`migrating ${version} → ${next}`);
    await migration({ store: plan.store, log });
    version = next;
    await plan.setVersion?.(version);
  }

  return version;
}

export const SCHEMA_VERSION = 1;
const VERSION_KEY = 'schemaVersion';

/** Empty today: version 1 is the initial schema. */
export const MIGRATIONS: Record<number, Migration> = {};

/** Bring stored data up to SCHEMA_VERSION. Safe to call on every boot. */
export async function migrate(store: KeyValueStore): Promise<number> {
  const stored = await store.get<number>('meta', VERSION_KEY);
  const from = typeof stored === 'number' && Number.isInteger(stored) && stored > 0 ? stored : SCHEMA_VERSION;

  return runMigrations({
    store,
    from,
    to: SCHEMA_VERSION,
    migrations: MIGRATIONS,
    setVersion: (version) => store.put('meta', VERSION_KEY, version)
  });
}
