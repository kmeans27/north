import { expect, test } from '@playwright/test';

/* M1 acceptance (08-build-plan.md): a value survives a reload with
   src: 'manual' and locked: true, and ?d= opens a past day.

   The write is performed against the same IndexedDB schema the app uses, from
   the page context, so the test exercises the real read path and persistence.
   The write() itself (undo stack, src/locked, override rules) is unit-tested in
   tests/unit/days.test.ts. */

async function seedDay(page: import('@playwright/test').Page, date: string, value: number) {
  await page.evaluate(
    async ({ date, value }) => {
      const open = (): Promise<IDBDatabase> =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('north', 1);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('days')) db.createObjectStore('days');
            if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('days', 'readwrite');
        tx.objectStore('days').put(
          {
            date,
            tz: 'UTC',
            values: { protein: { v: value, src: 'manual', t: 1_760_700_000_000, locked: true } }
          },
          date
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { date, value }
  );
}

test('a written value survives a reload with manual source and a lock', async ({ page }) => {
  await page.goto('/');
  const dateCell = page.getByTestId('logical-date');
  await expect(dateCell).not.toHaveText('—');
  const date = (await dateCell.textContent())!.trim();

  await seedDay(page, date, 3);
  await page.reload();

  await expect(page.getByTestId('day-value-protein')).toContainText('3');
  await expect(page.getByText('manual · locked')).toBeVisible();
});

test('?d= opens a past day', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('logical-date')).not.toHaveText('—');

  const today = (await page.getByTestId('logical-date').textContent())!.trim();
  const yesterday = await page.evaluate((iso) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, today);

  await seedDay(page, yesterday, 2);
  await page.goto(`/?d=${yesterday}`);

  await expect(page.getByTestId('logical-date')).toHaveText(yesterday);
  await expect(page.getByTestId('day-value-protein')).toContainText('2');
});

test('demo mode reads from memory and is labelled', async ({ page }) => {
  await page.goto('/?demo=1');

  await expect(page.getByTestId('mode-marker')).toContainText('demo data');
  await expect(page.getByTestId('logical-date')).not.toHaveText('—');
  await expect(page.getByTestId('day-value-protein')).toBeVisible();
});

test('a future ?d= falls back to today', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('logical-date')).not.toHaveText('—');
  const today = (await page.getByTestId('logical-date').textContent())!.trim();

  await page.goto('/?d=2999-01-01');
  await expect(page.getByTestId('logical-date')).toHaveText(today);
});
