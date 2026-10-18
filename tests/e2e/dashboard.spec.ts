import { expect, test, type Page } from '@playwright/test';
import {
  cell,
  horizontalOverflow,
  logicalDate,
  openDashboard,
  openToday,
  recentDates,
  row,
  seedLocal,
  undersizedTargets,
  fullLogDay
} from './helpers';

/* docs/V2.md §6 — the v2 home screen. The v1 list still lives at `/log`; these
   tests cover the dashboard: that it is one glance of every part of life, that
   the day can still be logged in place, and that a missing day stays missing. */

/** One panel, by pillar. */
function panel(page: Page, pillar: string) {
  return page.locator(`[data-panel="${pillar}"]`);
}

test('1. the home screen is a dashboard of parts, not a list', async ({ page }) => {
  await openDashboard(page, '?demo=1');

  // Every pillar has a panel, and each one carries its own headline figure.
  await expect(page.locator('[data-panel]')).toHaveCount(4);
  for (const pillar of ['body', 'mind', 'attention', 'capital']) {
    await expect(panel(page, pillar).getByRole('heading', { level: 2 })).toBeVisible();
    await expect(panel(page, pillar).locator('[data-panel-score]')).toBeVisible();
  }

  // The panels are read weakest first, so the figures never rise down the page.
  const scores = await page
    .locator('[data-panel-score]')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''));
  const shown = scores.filter((text) => text !== '—').map((text) => Number(text));
  expect(shown.length).toBeGreaterThan(0);
  expect([...shown].sort((a, b) => a - b)).toEqual(shown);
});

test('2. every metric of a pillar is in that pillar, with a chart where one helps', async ({
  page
}) => {
  await openDashboard(page, '?demo=1');

  // The body panel carries sleep, steps and the weekly figures.
  for (const id of ['sleep_hours', 'sleep_consistency', 'steps', 'strength_sessions']) {
    await expect(panel(page, 'body').locator(`[data-row="${id}"]`)).toBeVisible();
  }

  // A chart is a labelled image, and a gap in it is never drawn as a zero.
  const sleep = panel(page, 'body').locator('[data-chart="sleep_hours"] svg');
  await expect(sleep).toHaveAttribute('role', 'img');
  await expect(sleep).toHaveAttribute('aria-label', /14 nights, \d+ with data/);

  // A hand-logged metric shows its cells instead of a chart: the control *is*
  // the readout, so a second copy under it would only repeat itself.
  await expect(panel(page, 'body').locator('[data-chart="protein"]')).toHaveCount(0);
  await expect(cell(page, 'protein', '4')).toBeVisible();
});

test('3. the nine taps happen on the dashboard itself', async ({ page }) => {
  const days = recentDates(11)
    .slice(0, 10)
    .map((date) => fullLogDay(date, 4));

  await page.goto('/');
  await seedLocal(page, days);
  await openDashboard(page);

  // Nothing logged today: nine taps are waiting, and they are all on this page.
  await expect(page.getByTestId('to-log')).toContainText('9 of 9 taps left today');

  await cell(page, 'protein', '4').click();

  await expect(page.locator('.toast')).toContainText('Protein');
  await expect(page.getByTestId('to-log')).toContainText('8 of 9 taps left today');

  // Logged in place: the URL never changed and nothing navigated away.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-panel]')).toHaveCount(4);
  await expect(cell(page, 'protein', '4')).toHaveAttribute('aria-checked', 'true');

  // The month's figure is entered here too — `/log` never shows it — and it is
  // not one of the nine daily taps.
  await cell(page, 'invested', 'yes').click();
  await expect(cell(page, 'invested', 'yes')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('to-log')).toContainText('8 of 9 taps left today');
});

test('4. a missing day is a gap in the chart, never a zero', async ({ page }) => {
  // Five days of sleep, then three days with nothing at all.
  const dates = recentDates(8);
  const logged = dates.slice(0, 5).map((date) => ({
    date,
    values: { sleep_hours: { v: 7.5, src: 'health', t: 0 } }
  }));

  await page.goto('/');
  await seedLocal(page, logged);
  await openDashboard(page);

  const chart = panel(page, 'body').locator('[data-chart="sleep_hours"]');
  await expect(chart).toBeVisible();
  // 14 slots, 5 of them with a night: the other nine are absent, not zero.
  await expect(chart.locator('svg')).toHaveAttribute('aria-label', /14 nights, 5 with data/);
  await expect(chart.locator('rect')).toHaveCount(5);
  await expect(row(page, 'sleep_hours').locator('[data-value]')).toHaveText('—');
});

test('5. the wordmark is home and G L is the log', async ({ page }) => {
  await openDashboard(page, '?demo=1');

  await page.keyboard.press('g');
  await page.keyboard.press('l');
  await expect(page).toHaveURL(/\/log/);
  await expect(logicalDate(page)).toBeVisible();

  await page.getByRole('link', { name: 'north' }).click();
  await expect(page).toHaveURL(/\/\?demo=1$/);
  await expect(page.locator('[data-panel]')).toHaveCount(4);
});

test('6. the demo flag survives browsing days from the dashboard', async ({ page }) => {
  await openDashboard(page, '?demo=1');
  const today = await logicalDate(page).textContent();

  await page.keyboard.press('[');
  await expect(logicalDate(page)).not.toHaveText(today ?? '');
  expect(page.url()).toContain('demo=1');

  await page.keyboard.press(']');
  await expect(logicalDate(page)).toHaveText(today ?? '');
  expect(page.url()).toContain('demo=1');
});

test('7. the panels do not re-order under your finger', async ({ page }) => {
  await openDashboard(page, '?demo=1');

  const order = async (): Promise<string[]> =>
    page
      .locator('[data-panel]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-panel') ?? ''));

  const before = await order();
  await cell(page, 'creatine', 'yes').click();
  await expect(page.locator('.toast')).toContainText('Creatine');
  expect(await order()).toEqual(before);
});

test('8. the log still works, and the dashboard is now the first screen', async ({ page }) => {
  await openToday(page, '?demo=1');
  await expect(page.getByTestId('logical-date')).toBeVisible();
  await expect(page.locator('[data-row]').first()).toBeVisible();

  // The shell links to both screens, and the dashboard comes first.
  await page.getByRole('link', { name: 'north' }).click();
  await expect(page).toHaveURL(/\/\?demo=1$/);
  await expect(page.locator('[data-panel]').first()).toBeVisible();
});

test('the dashboard does not scroll sideways at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openDashboard(page, '?demo=1');
  expect(await horizontalOverflow(page)).toBe(0);
});

test('every interactive target on the dashboard is at least 44 × 44 px', async ({ page }) => {
  await openDashboard(page, '?demo=1');
  expect(await undersizedTargets(page)).toEqual([]);
});
