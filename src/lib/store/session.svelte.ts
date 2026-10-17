/* src/lib/store/session.svelte.ts — the app's single source of runtime state.
 *
 * Loads settings and the viewed day, and routes every write through the day
 * store. Demo mode swaps the IndexedDB store for an in-memory one seeded from
 * `demo.ts`, so every screen works identically without persisting anything.
 */

/* eslint-disable svelte/prefer-svelte-reactivity --
   Date and URLSearchParams here are transient locals, never stored in reactive
   state, so SvelteDate/SvelteURLSearchParams would add cost for no benefit. */

import { logicalDate, parseDate } from '../metrics/dates';
import type { Day, MetricId, Settings, Value } from '../metrics/types';
import { createIndexedDbStore, createMemoryStore, type KeyValueStore } from './db';
import { createDayStore, type DayStore } from './days';
import { generateDemoDays } from './demo';
import { DEFAULT_SETTINGS, loadSettings, mergeSettings } from './settings';

export interface SessionState {
  ready: boolean;
  error: string | null;
  demo: boolean;
  settings: Settings;
  /** The current logical date, respecting the cutoff hour. */
  today: string;
  /** The date being viewed; differs from `today` for `?d=`. */
  date: string;
  day: Day | null;
  days: Day[];
  undoCount: number;
}

export const session = $state<SessionState>({
  ready: false,
  error: null,
  demo: false,
  settings: mergeSettings(DEFAULT_SETTINGS),
  today: '',
  date: '',
  day: null,
  days: [],
  undoCount: 0
});

let kv: KeyValueStore | null = null;
let days: DayStore | null = null;
let activeKey = '';

async function demoStore(today: string): Promise<DayStore> {
  const memory = createMemoryStore();
  const store = createDayStore(memory);
  await store.importDays(generateDemoDays({ end: today }));
  return store;
}

function upsertDay(next: Day): void {
  const index = session.days.findIndex((day) => day.date === next.date);
  if (index === -1) {
    session.days = [...session.days, next].sort((a, b) => a.date.localeCompare(b.date));
  } else {
    session.days = session.days.map((day) => (day.date === next.date ? next : day));
  }
  session.day = next;
}

/** Load or reload the session for a URL search string. Safe to call on every navigation. */
export async function loadSession(search: string): Promise<void> {
  const params = new URLSearchParams(search);
  const demo = params.get('demo') === '1';
  const key = demo ? 'demo' : 'local';

  try {
    if (!days || activeKey !== key) {
      if (demo) {
        kv = createMemoryStore();
        days = await demoStore(logicalDate(new Date()));
      } else {
        kv = createIndexedDbStore();
        days = createDayStore(kv);
      }
      activeKey = key;
    }

    const settings = demo || !kv ? mergeSettings(DEFAULT_SETTINGS) : await loadSettings(kv);
    const today = logicalDate(new Date(), settings.dayCutoffHour);
    const requested = parseDate(params.get('d'));
    // Future dates are not editable and not scorable (03-scoring.md §6).
    const date = requested && requested <= today ? requested : today;

    session.settings = settings;
    session.today = today;
    session.date = date;
    session.day = (await days.get(date)) ?? null;
    session.days = await days.all();
    session.undoCount = await days.undoCount();
    session.demo = demo;
    session.error = null;
    session.ready = true;
  } catch (error) {
    session.error = error instanceof Error ? error.message : 'Storage is unavailable';
    session.ready = true;
  }
}

export async function writeValue(metricId: MetricId, value: Value): Promise<void> {
  if (!days) return;
  const next = await days.write(session.date, metricId, value, 'manual');
  upsertDay(next);
  session.undoCount = await days.undoCount();
}

export async function undoLast(): Promise<void> {
  if (!days) return;
  const op = await days.undo();
  if (!op) return;
  const next = await days.get(op.date);
  if (next) upsertDay(next);
  session.undoCount = await days.undoCount();
}

export async function setNote(note: string): Promise<void> {
  if (!days) return;
  upsertDay(await days.setNote(session.date, note));
  session.undoCount = await days.undoCount();
}

export async function setRestDay(rest: boolean): Promise<void> {
  if (!days) return;
  upsertDay(await days.setRestDay(session.date, rest));
  session.undoCount = await days.undoCount();
}
