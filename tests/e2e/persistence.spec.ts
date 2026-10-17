import { expect, test, type Page } from '@playwright/test';
import { cell, logicalDate, openToday, row } from './helpers';

/* M1 acceptance (08-build-plan.md §M1), driven through the real Today screen:
   a logged value survives a reload as a locked manual write, `?d=` opens a past
   day, demo data never reaches IndexedDB, and a future `?d=` falls back. */

interface StoredValue {
  v: unknown;
  src?: string;
  locked?: boolean;
}

/** Read one stored value straight out of the app's IndexedDB. */
async function readValue(page: Page, date: string, metricId: string): Promise<StoredValue | null> {
  return page.evaluate(
    ({ date, metricId }) =>
      new Promise<StoredValue | null>((resolve, reject) => {
        const request = indexedDB.open('north', 1);
        request.onsuccess = () => {
          const db = request.result;
          try {
            const get = db.transaction('days', 'readonly').objectStore('days').get(date);
            get.onsuccess = () => {
              const day = get.result as { values?: Record<string, StoredValue> } | undefined;
              db.close();
              resolve(day?.values?.[metricId] ?? null);
            };
            get.onerror = () => reject(get.error);
          } catch (error) {
            reject(error as Error);
          }
        };
        request.onerror = () => reject(request.error);
      }),
    { date, metricId }
  );
}

/** Write a day the way the app itself would, so the real read path is exercised. */
async function seedDay(page: Page, date: string, metricId: string, value: number): Promise<void> {
  await page.evaluate(
    ({ date, metricId, value }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('north', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('days', 'readwrite');
          tx.objectStore('days').put(
            {
              date,
              tz: 'UTC',
              values: { [metricId]: { v: value, src: 'manual', t: 1_760_700_000_000, locked: true } }
            },
            date
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    { date, metricId, value }
  );
}

test('a logged value survives a reload as a locked manual write', async ({ page }) => {
  await openToday(page);
  await expect(page.getByTestId('mode-marker')).toContainText('local only');
  const date = (await logicalDate(page).textContent())!.trim();

  await page.getByTestId('expander').click();
  await cell(page, 'protein', '3').click();
  await expect(row(page, 'protein')).toHaveClass(/logged/);

  expect(await readValue(page, date, 'protein')).toMatchObject({
    v: 3,
    src: 'manual',
    locked: true
  });
  const databases = await page.evaluate(() => indexedDB.databases());
  expect(databases.map((db) => db.name)).toContain('north');

  await page.reload();
  await logicalDate(page).waitFor();
  await page.getByTestId('expander').click();
  await expect(cell(page, 'protein', '3')).toHaveAttribute('aria-checked', 'true');
});

test('?d= opens a past day and reads what is stored there', async ({ page }) => {
  await openToday(page);
  const today = (await logicalDate(page).textContent())!.trim();
  const yesterday = await page.evaluate((iso) => {
    const date = new Date(`${iso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }, today);

  await seedDay(page, yesterday, 'protein', 2);
  await page.goto(`/?d=${yesterday}`);

  await expect(logicalDate(page)).toHaveText(yesterday);
  await page.getByTestId('expander').click();
  await expect(cell(page, 'protein', '2')).toHaveAttribute('aria-checked', 'true');
});

test('demo mode is labelled and never touches the device store', async ({ page }) => {
  await page.goto('/?demo=1');
  await logicalDate(page).waitFor();

  await expect(page.getByTestId('mode-marker')).toContainText('demo data');
  // The seed fills the screen, so there is always a cell to tap.
  const firstCell = page.locator('[data-row] [role="radio"]').first();
  await expect(firstCell).toBeVisible();
  await firstCell.click();
  await expect(page.locator('.toast')).toBeVisible();

  const databases = await page.evaluate(() => indexedDB.databases());
  expect(databases.map((db) => db.name)).not.toContain('north');
});

test('a future ?d= falls back to today', async ({ page }) => {
  await openToday(page);
  const today = (await logicalDate(page).textContent())!.trim();

  await page.goto('/?d=2999-01-01');
  await expect(logicalDate(page)).toHaveText(today);
});
