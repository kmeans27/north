import { describe, expect, it } from 'vitest';
import { createDayStore } from '../../src/lib/store/days';
import { createMemoryStore } from '../../src/lib/store/db';

function harness(startIso = '2026-10-17T21:30:00Z') {
  const kv = createMemoryStore();
  let clock = new Date(startIso).getTime();
  const store = createDayStore(kv, { now: () => new Date(clock), tz: 'Europe/Berlin' });
  return {
    kv,
    store,
    advance(ms = 1_000) {
      clock += ms;
    }
  };
}

describe('write', () => {
  it('creates a day with src manual and locked true', async () => {
    const { store } = harness();
    const day = await store.write('2026-10-17', 'protein', 3);

    expect(day.date).toBe('2026-10-17');
    expect(day.tz).toBe('Europe/Berlin');
    expect(day.values.protein).toEqual({
      v: 3,
      src: 'manual',
      t: new Date('2026-10-17T21:30:00Z').getTime(),
      locked: true
    });
  });

  it('writes twice to the same field, keeps the last value and stacks two undo entries', async () => {
    const { store, advance } = harness();

    await store.write('2026-10-17', 'protein', 3);
    advance();
    const day = await store.write('2026-10-17', 'protein', 4);

    expect(day.values.protein?.v).toBe(4);
    expect(day.values.protein?.editedAt).toBe(new Date('2026-10-17T21:30:01Z').getTime());
    expect(await store.undoCount()).toBe(2);
  });

  it('keeps 0, false and the empty string as present values', async () => {
    const { store } = harness();
    await store.write('2026-10-17', 'protein', 0);
    await store.write('2026-10-17', 'creatine', false);
    const day = await store.write('2026-10-17', 'learned', '');

    expect(day.values.protein?.v).toBe(0);
    expect(day.values.creatine?.v).toBe(false);
    expect(day.values.learned?.v).toBe('');
  });

  it('stores a cleared toggle as null, not as a deleted field', async () => {
    const { store } = harness();
    await store.write('2026-10-17', 'read', true);
    const day = await store.write('2026-10-17', 'read', null);
    expect(day.values.read?.v).toBeNull();
  });

  it('marks a manual edit of an auto value as overridden and keeps src auto', async () => {
    const { store, advance } = harness();

    await store.write('2026-10-17', 'sleep_hours', 7.2, 'auto');
    advance();
    const day = await store.write('2026-10-17', 'sleep_hours', 7.6, 'manual');

    expect(day.values.sleep_hours).toMatchObject({
      v: 7.6,
      src: 'auto',
      locked: true,
      overridden: true
    });
  });

  it('does not mark an ordinary manual write as overridden', async () => {
    const { store } = harness();
    const day = await store.write('2026-10-17', 'protein', 3);
    expect(day.values.protein?.overridden).toBeUndefined();
  });

  it('persists across store instances over the same database', async () => {
    const { kv, store } = harness();
    await store.write('2026-10-17', 'deep_blocks', 2);

    const reopened = createDayStore(kv, { now: () => new Date(), tz: 'Europe/Berlin' });
    const day = await reopened.get('2026-10-17');

    expect(day?.values.deep_blocks?.v).toBe(2);
    expect(day?.values.deep_blocks?.src).toBe('manual');
    expect(day?.values.deep_blocks?.locked).toBe(true);
  });
});

describe('undo', () => {
  it('restores the previous value', async () => {
    const { store, advance } = harness();
    await store.write('2026-10-17', 'protein', 3);
    advance();
    await store.write('2026-10-17', 'protein', 4);

    const op = await store.undo();
    expect(op?.kind).toBe('value');

    const day = await store.get('2026-10-17');
    expect(day?.values.protein?.v).toBe(3);
    expect(await store.undoCount()).toBe(1);
  });

  it('removes a field that did not exist before the write', async () => {
    const { store } = harness();
    await store.write('2026-10-17', 'creatine', true);
    await store.undo();

    const day = await store.get('2026-10-17');
    expect(day?.values.creatine).toBeUndefined();
  });

  it('returns null on an empty stack', async () => {
    const { store } = harness();
    expect(await store.undo()).toBeNull();
  });

  it('caps the stack at the last 20 writes', async () => {
    const { store, advance } = harness();
    for (let i = 0; i < 25; i++) {
      advance();
      await store.write('2026-10-17', 'protein', i);
    }
    expect(await store.undoCount()).toBe(20);

    // 20 undos walk back from 24 to 5; the day then keeps 5.
    for (let i = 0; i < 20; i++) await store.undo();
    const day = await store.get('2026-10-17');
    expect(day?.values.protein?.v).toBe(4);
  });
});

describe('note', () => {
  it('trims, caps at 400 characters and clears on empty', async () => {
    const { store } = harness();
    let day = await store.setNote('2026-10-17', '  Bayes vs frequentist  ');
    expect(day.note).toBe('Bayes vs frequentist');

    day = await store.setNote('2026-10-17', 'x'.repeat(500));
    expect(day.note?.length).toBe(400);

    day = await store.setNote('2026-10-17', '   ');
    expect(day.note).toBeUndefined();
  });

  it('undoes to the previous note', async () => {
    const { store } = harness();
    await store.setNote('2026-10-17', 'first');
    await store.setNote('2026-10-17', 'second');
    await store.undo();
    const day = await store.get('2026-10-17');
    expect(day?.note).toBe('first');
  });
});

describe('rest day', () => {
  it('sets and clears the flag', async () => {
    const { store } = harness();
    let day = await store.setRestDay('2026-10-17', true);
    expect(day.restDay).toBe(true);

    await store.undo();
    day = (await store.get('2026-10-17'))!;
    expect(day.restDay).toBeUndefined();
  });
});

describe('all and importDays', () => {
  it('returns days oldest first regardless of insertion order', async () => {
    const { store } = harness();
    await store.write('2026-10-19', 'protein', 4);
    await store.write('2026-10-17', 'protein', 3);
    await store.write('2026-10-18', 'protein', 5);

    expect((await store.all()).map((day) => day.date)).toEqual([
      '2026-10-17',
      '2026-10-18',
      '2026-10-19'
    ]);
  });

  it('imports days without creating undo history', async () => {
    const { store } = harness();
    await store.importDays([
      { date: '2026-10-16', tz: 'UTC', values: { protein: { v: 2, src: 'import', t: 1 } } }
    ]);

    expect((await store.get('2026-10-16'))?.values.protein?.v).toBe(2);
    expect(await store.undoCount()).toBe(0);
  });

  it('clear removes every day and the undo stack', async () => {
    const { store } = harness();
    await store.write('2026-10-17', 'protein', 3);
    await store.clear();

    expect(await store.all()).toEqual([]);
    expect(await store.undoCount()).toBe(0);
  });
});
