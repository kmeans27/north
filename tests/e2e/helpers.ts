import type { Page } from '@playwright/test';

/* Shared handles for the Today screen, so the specs read as the user's actions
   rather than as selectors. Not a spec file: Playwright only collects
   `*.spec.ts` from `testDir`. */

/**
 * The nine manual daily metrics in registry order, the cell that logs each one
 * perfectly (02-metrics.md §4, 04-ux.md §3), and the digit key that reaches that
 * same option (04-ux.md §4: `1` is the first option). `learned` is the
 * exception: its score is note-dependent (03-scoring.md §1.6), so `✓` with no
 * note scores 40.
 */
export const DAILY_LOG: readonly { id: string; cell: string; key: string }[] = [
  { id: 'protein', cell: '4', key: '5' },
  { id: 'creatine', cell: 'yes', key: '2' },
  { id: 'greens', cell: '5', key: '6' },
  { id: 'alcohol', cell: 'yes', key: '2' },
  { id: 'deep_blocks', cell: '3+', key: '4' },
  { id: 'learned', cell: 'yes', key: '2' },
  { id: 'read', cell: 'yes', key: '2' },
  { id: 'phone_total', cell: '≤ 2h', key: '1' },
  { id: 'social_min', cell: '≤ 30m', key: '1' }
];

/** One row of NEEDS YOU. */
export function row(page: Page, id: string) {
  return page.locator(`[data-row="${id}"]`);
}

/** One cell of a row, by its accessible name. */
export function cell(page: Page, id: string, name: string) {
  return row(page, id).getByRole('radio', { name, exact: true });
}

/** The day's composite, `—` below 25 % coverage (03-scoring.md §2). */
export function score(page: Page) {
  return page.locator('.figure-value.big');
}

export function logicalDate(page: Page) {
  return page.getByTestId('logical-date');
}

/** Every row the page is showing, in document order. */
export async function rowOrder(page: Page): Promise<string[]> {
  return page.locator('[data-row]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-row') ?? '')
  );
}

/** Wait for the first paint of a loaded, ready Today screen. */
export async function openToday(page: Page, search = ''): Promise<void> {
  await page.goto(`/${search}`);
  await logicalDate(page).waitFor();
  await page.locator('[data-row]').first().waitFor();
}

/* ─── Local-mode seeding (M4 acceptance 6) ────────────────────────────────
   Demo mode ignores stored settings, so a test that proves "changing a target
   changes the Trends hit-rate" has to write to IndexedDB and reload. The
   shapes match db.ts: `days` keyed by date holds a `Day`; `meta`/`settings`
   holds a partial `Settings` that mergeSettings completes. */

export interface SeedDay {
  date: string;
  values: Record<string, { v: number | boolean | string | null; src: string; t: number }>;
  note?: string;
}

/** Write days and optional settings straight into the `north` database. */
export async function seedLocal(
  page: Page,
  days: readonly SeedDay[],
  settings?: Record<string, unknown>
): Promise<void> {
  await page.evaluate(
    async ([records, stored]) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('north', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of ['days', 'meta']) {
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
          }
        };
        request.onerror = () => reject(request.error ?? new Error('seed open failed'));
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['days', 'meta'], 'readwrite');
          const dayStore = tx.objectStore('days');
          for (const record of records as SeedDay[]) {
            const day = {
              date: record.date,
              tz: 'UTC',
              values: record.values,
              ...(record.note ? { note: record.note } : {})
            };
            dayStore.put(day, record.date);
          }
          if (stored) tx.objectStore('meta').put(stored, 'settings');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('seed write failed'));
        };
      });
    },
    [days, settings ?? null] as const
  );
}

/** The last `count` calendar dates ending today, as `YYYY-MM-DD`, oldest first. */
export function recentDates(count: number, today = new Date()): string[] {
  const out: string[] = [];
  for (let back = count - 1; back >= 0; back--) {
    const date = new Date(today);
    date.setDate(date.getDate() - back);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    out.push(`${date.getFullYear()}-${month}-${day}`);
  }
  return out;
}

/** A day that logs all nine manual metrics perfectly (`learned` needs its note). */
export function fullLogDay(date: string, protein = 4): SeedDay {
  const values: SeedDay['values'] = {};
  const put = (id: string, v: number | boolean): void => {
    values[id] = { v, src: 'manual', t: 0 };
  };
  put('protein', protein);
  put('creatine', true);
  put('greens', 5);
  put('alcohol', true);
  put('deep_blocks', 2);
  put('learned', true);
  put('read', true);
  put('phone_total', 2.5);
  put('social_min', 30);
  return { date, values, note: 'One line about the thing I learned.' };
}

/* ─── Shared layout assertions (the Definition of Done) ──────────────────── */

/** Every element a finger or a keyboard can land on. */
const INTERACTIVE = 'button, input, select, textarea, a[href], [role="radio"]';

/** Targets smaller than the 44 px floor (05-design.md §8). */
export async function undersizedTargets(
  page: Page
): Promise<{ element: string; name: string; width: number; height: number }[]> {
  return page.evaluate((selector) => {
    const out: { element: string; name: string; width: number; height: number }[] = [];
    for (const node of document.querySelectorAll<HTMLElement>(selector)) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const { width, height } = node.getBoundingClientRect();
      if (width < 44 || height < 44) {
        out.push({
          element: node.tagName.toLowerCase(),
          name: (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 30),
          width: Math.round(width),
          height: Math.round(height)
        });
      }
    }
    return out;
  }, INTERACTIVE);
}

/** Horizontal overflow in pixels: 0 means the page does not scroll sideways. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}
