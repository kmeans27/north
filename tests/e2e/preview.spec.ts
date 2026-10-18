import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, row, undersizedTargets } from './helpers';

/* docs/V2.1.md §4 — `/preview`: one finished day of sample data.
   It is the same board as `/`, filled from `sample.ts`. The tests below hold the
   two properties that make it safe: it is labelled, and nothing it does is
   written anywhere. */

async function openPreview(page: Page): Promise<void> {
  await page.goto('/preview');
  await page.locator('[data-panel]').first().waitFor();
}

test('1. the preview is a labelled sample of a finished day', async ({ page }) => {
  await openPreview(page);

  // Labelled, so it can never be mistaken for the owner's own data.
  await expect(page.getByTestId('mode-marker')).toContainText('sample data');

  // Every metric on the board, and every tap already done.
  await expect(page.locator('[data-panel]')).toHaveCount(4);
  await expect(page.locator('[data-row]')).toHaveCount(19);
  await expect(page.getByTestId('to-log')).toContainText('All 9 taps logged today');

  // The day's one line is filled in — `learned` scores 100 only with a note.
  await expect(row(page, 'learned').locator('.note')).not.toHaveValue('');
});

test('2. the board uses the width: weight is size', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPreview(page);

  const box = async (id: string) => {
    const rect = await row(page, id).boundingBox();
    if (!rect) throw new Error(`${id} has no box`);
    return rect;
  };

  // Full width, not the 1040 px measure the one-column screens keep.
  expect((await box('sleep_hours')).width).toBeGreaterThan(1040 / 3);

  // sleep takes four of twelve columns, creatine two: three-compact-tiles vs two.
  const sleep = await box('sleep_hours');
  const creatine = await box('creatine');
  expect(sleep.width).toBeGreaterThan(creatine.width * 1.5);
  expect(sleep.y).toBeLessThan(creatine.y);
});

test('3. the preview takes a tap, and stores nothing', async ({ page }) => {
  await openPreview(page);

  const figure = row(page, 'protein').locator('[data-value]');
  const before = await figure.textContent();

  // Any cell that is not the selected one: the figure must move.
  await row(page, 'protein')
    .locator('[role="radio"]:not([aria-checked="true"])')
    .first()
    .click();
  await expect(figure).not.toHaveText(before ?? '');

  // And a reload puts the finished day back: nothing was written.
  await page.reload();
  await page.locator('[data-panel]').first().waitFor();
  await expect(row(page, 'protein').locator('[data-value]')).toHaveText(before ?? '');
});

test('4. G P reaches the preview and G D comes back', async ({ page }) => {
  await page.goto('/');
  // Wait for the shell to be listening, or the chord arms before the listener.
  await page.locator('[data-panel]').first().waitFor();
  await page.keyboard.press('g');
  await page.keyboard.press('p');
  await expect(page).toHaveURL(/\/preview$/);
  await expect(page.locator('[data-panel]').first()).toBeVisible();

  await page.keyboard.press('g');
  await page.keyboard.press('d');
  await expect(page).toHaveURL(/\/$/);
});

test('the preview does not scroll sideways at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openPreview(page);
  expect(await horizontalOverflow(page)).toBe(0);
});

test('every interactive target on the preview is at least 44 × 44 px', async ({ page }) => {
  await openPreview(page);
  expect(await undersizedTargets(page)).toEqual([]);
});
