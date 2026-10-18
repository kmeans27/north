import { expect, test } from '@playwright/test';
import { horizontalOverflow, openToday, row, undersizedTargets } from './helpers';

/* 08-build-plan.md §M5, cut to the two things that were actually missing: the
   values every score is computed from, and a way to get your data out. The
   wizard, the presets and per-metric target editing are deliberately not built
   (reported as a scope cut); these tests prove the part that is. */

test('1. the keyboard alone reaches Settings (G then S)', async ({ page }) => {
  await openToday(page);

  await page.keyboard.press('g');
  await page.keyboard.press('s');

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'You', exact: true })).toBeVisible();
});

test('2. bodyweight drives the protein target, through to the Today row', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('protein-target')).toContainText('4');

  // 1.6 g/kg at the 80 kg default is 4 × 32 g. At 100 kg it is 5.
  await page.getByRole('button', { name: 'Edit Bodyweight' }).click();
  const field = page.getByRole('textbox', { name: 'Bodyweight' });
  await field.fill('100');
  await field.press('Enter');

  await expect(page.getByTestId('protein-target')).toContainText('5');
  await expect(page.getByTestId('protein-target')).toContainText('100 kg');

  // The row the tap lands on offers one more option, because the target moved.
  await openToday(page);
  await expect(row(page, 'protein').getByRole('radio')).toHaveCount(6);
});

test('3. a setting survives a reload', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Edit Bodyweight' }).click();
  const field = page.getByRole('textbox', { name: 'Bodyweight' });
  await field.fill('92.5');
  await field.press('Enter');
  await expect(page.getByTestId('protein-target')).toContainText('92.5 kg');

  await page.reload();
  await expect(page.getByTestId('protein-target')).toContainText('92.5 kg');
});

test('4. export hands you a real file, and says so', async ({ page }) => {
  await page.goto('/settings');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON' }).click()
  ]);

  expect(download.suggestedFilename()).toMatch(/^north-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.getByTestId('settings-note')).toContainText('Saved north-');
});

test('5. the CSV export is offered too', async ({ page }) => {
  await page.goto('/settings');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click()
  ]);

  expect(download.suggestedFilename()).toMatch(/^north-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('6. every interactive target is at least 44 × 44 px', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('data-range')).toBeVisible();

  expect(await undersizedTargets(page)).toEqual([]);
});

test('7. the page does not scroll sideways at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/settings');
  await expect(page.getByTestId('data-range')).toBeVisible();

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test('8. the session makes no network request of its own', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('data-range')).toBeVisible();
  await page.waitForLoadState('networkidle');

  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.getByRole('button', { name: 'Export JSON' }).click();
  await expect(page.getByTestId('settings-note')).toBeVisible();

  // Only the app's own code and the self-hosted font may be fetched.
  const noise = requests.filter((url) => !url.includes('/_app/') && !url.includes('/fonts/'));
  expect(noise, 'no fetches, no sync, no analytics').toEqual([]);
});
