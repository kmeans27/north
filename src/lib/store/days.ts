/* src/lib/store/days.ts — day documents, writes and undo (06-architecture.md §5).
 *
 * Every write goes through `write()`, which applies one field, records an
 * inverse operation on the 20-entry undo stack, and persists. The clock is
 * injected so the store can be tested without freezing global time.
 */

import type { Day, DayValue, MetricId, Value } from '../metrics/types';
import type { KeyValueStore } from './db';

export type WriteSource = DayValue['src'];

export type UndoOp =
  | { kind: 'value'; date: string; metricId: MetricId; prev: DayValue | null; next: DayValue }
  | { kind: 'note'; date: string; prev: string | null; next: string | null }
  | { kind: 'restDay'; date: string; prev: boolean | null; next: boolean | null };

export interface DayStore {
  /** One day, or undefined when it was never written. */
  get(date: string): Promise<Day | undefined>;
  /** Every stored day, oldest first. */
  all(): Promise<Day[]>;
  /** Apply one metric value. Returns the new day document. */
  write(date: string, metricId: MetricId, value: Value, src?: WriteSource): Promise<Day>;
  /** Replace the day's one-line note. Empty deletes it. */
  setNote(date: string, note: string): Promise<Day>;
  /** Toggle the day's rest-day flag (03-scoring.md §7). */
  setRestDay(date: string, rest: boolean): Promise<Day>;
  /** Undo the most recent write. Returns the reversed operation, or null. */
  undo(): Promise<UndoOp | null>;
  undoCount(): Promise<number>;
  /** Bulk write used by demo seeding and JSON import. Never builds undo history. */
  importDays(days: Day[]): Promise<void>;
  /** Wipe days and undo history. Callers gate this behind a typed confirmation. */
  clear(): Promise<void>;
}

export interface DayStoreOptions {
  /** Injected clock. Pure by default; tests pass a fixed one. */
  now?: () => Date;
  /** IANA zone recorded on new days, for audit. */
  tz?: string;
}

const UNDO_KEY = 'undo';
const UNDO_LIMIT = 20;
const NOTE_LIMIT = 400;

function emptyDay(date: string, tz: string): Day {
  return { date, tz, values: {} };
}

function defaultTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function createDayStore(store: KeyValueStore, options: DayStoreOptions = {}): DayStore {
  const now = options.now ?? ((): Date => new Date());
  const tz = options.tz ?? defaultTz();

  const read = async (date: string): Promise<Day | undefined> => store.get<Day>('days', date);

  const readUndo = async (): Promise<UndoOp[]> => (await store.get<UndoOp[]>('meta', UNDO_KEY)) ?? [];
  const writeUndo = async (stack: UndoOp[]): Promise<void> => store.put('meta', UNDO_KEY, stack);

  const pushUndo = async (op: UndoOp): Promise<void> => {
    const stack = await readUndo();
    stack.push(op);
    await writeUndo(stack.slice(-UNDO_LIMIT));
  };

  const write = async (
    date: string,
    metricId: MetricId,
    value: Value,
    src: WriteSource = 'manual'
  ): Promise<Day> => {
    const day = (await read(date)) ?? emptyDay(date, tz);
    const prev = day.values[metricId] ?? null;
    const t = now().getTime();

    const next: DayValue = { v: value, src, t };
    if (prev) next.editedAt = t;
    if (src === 'manual') {
      next.locked = true;
      // 03-scoring.md §7: an auto value edited by hand keeps src 'auto' and is
      // marked overridden, so the source dot can stay honest (04-ux.md §3).
      if (prev && prev.src !== 'manual') {
        next.src = prev.src;
        next.overridden = true;
      }
    }

    day.values[metricId] = next;
    await store.put('days', date, day);
    await pushUndo({ kind: 'value', date, metricId, prev, next });
    return day;
  };

  const setNote = async (date: string, note: string): Promise<Day> => {
    const day = (await read(date)) ?? emptyDay(date, tz);
    const prev = day.note ?? null;
    const next = note.trim().slice(0, NOTE_LIMIT);

    if (next) day.note = next;
    else delete day.note;

    await store.put('days', date, day);
    await pushUndo({ kind: 'note', date, prev, next: next || null });
    return day;
  };

  const setRestDay = async (date: string, rest: boolean): Promise<Day> => {
    const day = (await read(date)) ?? emptyDay(date, tz);
    const prev = day.restDay ?? null;

    if (rest) day.restDay = true;
    else delete day.restDay;

    await store.put('days', date, day);
    await pushUndo({ kind: 'restDay', date, prev, next: rest ? true : null });
    return day;
  };

  const undo = async (): Promise<UndoOp | null> => {
    const stack = await readUndo();
    const op = stack.pop();
    if (!op) return null;
    await writeUndo(stack);

    const day = await read(op.date);
    if (!day) return op;

    switch (op.kind) {
      case 'value':
        if (op.prev) day.values[op.metricId] = op.prev;
        else delete day.values[op.metricId];
        break;
      case 'note':
        if (op.prev) day.note = op.prev;
        else delete day.note;
        break;
      case 'restDay':
        if (op.prev) day.restDay = true;
        else delete day.restDay;
        break;
    }

    await store.put('days', op.date, day);
    return op;
  };

  return {
    get: read,
    async all(): Promise<Day[]> {
      const days = await store.all<Day>('days');
      return days.sort((a, b) => a.date.localeCompare(b.date));
    },
    write,
    setNote,
    setRestDay,
    undo,
    async undoCount(): Promise<number> {
      return (await readUndo()).length;
    },
    async importDays(days: Day[]): Promise<void> {
      for (const day of days) await store.put('days', day.date, day);
    },
    async clear(): Promise<void> {
      await store.clear('days');
      await store.del('meta', UNDO_KEY);
    }
  };
}
