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
