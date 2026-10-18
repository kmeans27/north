import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, undersizedTargets } from './helpers';

/* M4 acceptance criteria, literally (08-build-plan.md §M4). The hand-computed
   week score and the 0.90 → 0.87 denominator move live in
   tests/unit/week.test.ts; these tests prove the screen the user actually sees. */

async function openWeek(page: Page): Promise<void> {
  await page.goto('/week?demo=1');
  await page.getByTestId('week-score').waitFor();
}

test('1–2. the week score, its worded comparison and the status words render', async ({ page }) => {
  await openWeek(page);

  // The score is a number, or `—` when there is nothing to show (never a fake 0).
  await expect(page.getByTestId('week-score')).toHaveText(/^(—|\d+)$/);

  // The comparison is worded: `+6`, `−4`, or `—` (03-scoring.md §3).
  const compare = page.getByTestId('week-compare');
  await expect(compare).toContainText('vs last week');
  expect(await compare.locator('.num').textContent()).toMatch(/^(—|[+−]\d+)$/);

  // Every weekly line states its status as a word.
  const statuses = page.locator('[data-weekly] .status');
  await expect(statuses).toHaveCount(3);
  for (const word of await statuses.allTextContents()) {
    expect(['met', 'on pace', 'behind', 'none']).toContain(word.trim());
  }
});

test('the day grid is seven cells and the pillar table is four rows in order', async ({ page }) => {
  await openWeek(page);

  await expect(page.locator('[data-day]')).toHaveCount(7);

  const pillars = await page.locator('[data-pillar]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-pillar'))
  );
  expect(pillars).toEqual(['body', 'mind', 'attention', 'capital']);
});

test('week navigation steps back, and cannot step past the current week', async ({ page }) => {
  await openWeek(page);

  await expect(page.getByRole('button', { name: 'Next week' })).toBeDisabled();
  const current = await page.locator('.range').textContent();

  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.locator('.range')).not.toHaveText(current ?? '');
  await expect(page.getByRole('button', { name: 'Next week' })).toBeEnabled();
});

test('the keyboard alone reaches Week (G then W)', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.locator('[data-row]').first().waitFor();

  await page.keyboard.press('g');
  await page.keyboard.press('w');

  await expect(page).toHaveURL(/\/week/);
  await expect(page.getByTestId('week-score')).toBeVisible();
});

test('every interactive target is at least 44 × 44 px', async ({ page }) => {
  await openWeek(page);
  expect(await undersizedTargets(page)).toEqual([]);
});

test('the page does not scroll sideways at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openWeek(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test('the session makes no network request of its own', async ({ page }) => {
  await openWeek(page);
  await page.waitForLoadState('networkidle');

  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.getByRole('button', { name: 'Previous week' }).click();
  await page.getByRole('button', { name: 'Next week' }).click();
  await page.locator('[data-day]').first().click();

  // Only the app's own code and the self-hosted font may be fetched.
  const noise = requests.filter(
    (url) => !url.includes('/_app/') && !url.includes('/fonts/')
  );
  expect(noise, 'no fetches, no sync, no analytics').toEqual([]);
});
