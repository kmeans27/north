import { expect, test, type Page } from '@playwright/test';
import {
  fullLogDay,
  horizontalOverflow,
  recentDates,
  seedLocal,
  undersizedTargets
} from './helpers';

/* M4 acceptance criteria, literally (08-build-plan.md §M4). Criterion 3's
   grep assertions live in tests/unit/charts.test.ts; criterion 5's grep in
   tests/unit/copy.test.ts. These tests prove the user-visible behaviour. */

async function openTrends(page: Page): Promise<void> {
  await page.goto('/trends?demo=1');
  await page.locator('[data-metric]').first().waitFor();
}

test('3. charts are pure SVG, with no canvas anywhere', async ({ page }) => {
  await openTrends(page);
  await expect(page.locator('svg').first()).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('4. selecting a point moves its value into the row header, with no hover', async ({
  page
}) => {
  await openTrends(page);

  const row = page.locator('[data-metric="protein"]');
  const value = row.locator('[data-trend-value]');
  const date = row.locator('[data-trend-date]');
  const chart = row.getByRole('button');

  // Before any selection the header reads the newest point.
  await expect(date).toHaveText('latest');
  const labelBefore = await chart.getAttribute('aria-label');

  // Keyboard selection: no pointer, no hover. ArrowLeft steps to an earlier day.
  await chart.focus();
  await page.keyboard.press('ArrowLeft');

  // The header now names the selected day, and its value is rendered there.
  await expect(date).not.toHaveText('latest');
  await expect(date).not.toHaveText('no data');
  expect((await date.textContent())?.trim().length).toBeGreaterThan(0);
  expect((await value.textContent())?.trim()).not.toBe('');

  // The chart's own label carries the newly selected value and date.
  expect(await chart.getAttribute('aria-label')).not.toBe(labelBefore);

  // Nothing is delivered by a hover tooltip: the value is plain text in the header.
  expect(await chart.getAttribute('title')).toBeNull();

  // Move the pointer far away; the selected value is still shown.
  await page.mouse.move(0, 0);
  await expect(value).toBeVisible();
});

test('5. every insight card shows its sample size, and no copy claims causation', async ({
  page
}) => {
  await openTrends(page);

  // Every card states its sample size — as a footer, or inside the sentence
  // when the rule's copy already carries it (rule 3).
  const cards = page.locator('[data-rule]');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  for (const text of await cards.allTextContents()) {
    expect(text).toMatch(/n = \d+ days?/);
  }

  const footers = page.locator('[data-insight-n]');
  for (const text of await footers.allTextContents()) {
    expect(text.trim()).toMatch(/^n = \d+/);
  }

  // The banned word appears nowhere on the rendered page (02-metrics.md §6).
  expect(await page.locator('body').textContent()).not.toMatch(/because/i);
});

test('the 30/90 toggle widens the charts', async ({ page }) => {
  await openTrends(page);

  const chart = page.locator('[data-metric="protein"] button');
  await expect(page.locator('[data-window="30"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(chart).toHaveAttribute('aria-label', /over 30 days/);

  await page.locator('[data-window="90"]').click();
  await expect(page.locator('[data-window="90"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(chart).toHaveAttribute('aria-label', /over 90 days/);
});

test('6. changing a target changes the Trends hit-rate on the next render', async ({ page }) => {
  // Demo mode ignores stored settings, so seed local data and a settings row.
  const days = recentDates(30).map((date) => fullLogDay(date, 4));

  await page.goto('/');
  await seedLocal(page, days); // default settings: the protein target is 4
  await page.goto('/trends');

  const rate = page.locator('[data-metric="protein"] [data-trend-rate]');
  await expect(rate).toContainText('hit-rate 100 %');

  // Retarget protein from 4 to 5; a value of 4 is now short, so the rate falls.
  await seedLocal(page, days, { version: 1, overrides: { protein: { target: 5 } } });
  await page.reload();

  await expect(rate).toContainText('hit-rate 0 %');
});

test('every interactive target is at least 44 × 44 px', async ({ page }) => {
  await openTrends(page);
  expect(await undersizedTargets(page)).toEqual([]);
});

test('the page does not scroll sideways at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openTrends(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test('the session makes no network request of its own', async ({ page }) => {
  await openTrends(page);
  await page.waitForLoadState('networkidle');

  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.locator('[data-window="90"]').click();
  await page.locator('[data-metric="protein"] button').focus();
  await page.keyboard.press('ArrowLeft');
  await page.locator('[data-window="30"]').click();

  // Only the app's own code and the self-hosted font may be fetched.
  const noise = requests.filter(
    (url) => !url.includes('/_app/') && !url.includes('/fonts/')
  );
  expect(noise, 'no fetches, no sync, no analytics').toEqual([]);
});
