import { expect, test, type Page } from '@playwright/test';
import { DAILY_LOG, cell, logicalDate, openToday, row, rowOrder, score } from './helpers';

/* M3 acceptance criteria, literally (08-build-plan.md §M3). Each test names the
   criterion it proves, so a failure points at the spec line. */

/** Every element a finger or a keyboard can land on. */
const INTERACTIVE = 'button, input, select, textarea, a[href], [role="radio"]';

/** The targets that are smaller than the 44 px floor (05-design.md §8). */
async function undersizedTargets(page: Page) {
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

/** Tab until `locator` has focus, so no test has to know the tab order. */
async function tabTo(page: Page, locator: ReturnType<Page['locator']>, limit = 40): Promise<void> {
  for (let i = 0; i < limit; i++) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
}

test('1. nine interactions complete a full manual log in under 20 s', async ({ page }) => {
  const started = Date.now();
  await openToday(page);

  // The last three rows are one interaction away (04-ux.md §2).
  await page.getByTestId('expander').click();
  for (const step of DAILY_LOG) await cell(page, step.id, step.cell).click();

  for (const step of DAILY_LOG) await expect(row(page, step.id)).toHaveClass(/logged/);
  await expect(score(page)).not.toHaveText('—');

  expect(Date.now() - started, 'nine writes plus first paint').toBeLessThan(20_000);
});

test.describe('390 × 844 (04-ux.md §2 height budget)', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'asserted on the mobile project');

  test('2. with nine unlogged rows the expander is inside the viewport', async ({ page }) => {
    await openToday(page);

    // Nine manual daily metrics, six shown, three behind the expander.
    await expect(page.locator('[data-row]')).toHaveCount(6);
    await expect(page.getByTestId('expander')).toHaveText('+ 3 more');

    const expander = page.getByTestId('expander');
    const box = await expander.boundingBox();
    expect(box, 'the expander has a box').not.toBeNull();
    expect(box!.y, 'top edge').toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height, 'bottom edge').toBeLessThanOrEqual(844);

    await expander.click();
    await expect(page.locator('[data-row]')).toHaveCount(9);
    await expect(expander).toHaveText('Show fewer');
  });
});

test('3. every interactive target is at least 44 × 44 px', async ({ page }) => {
  await openToday(page);
  await page.getByTestId('expander').click();
  // Include the toast's undo, which only exists after a write.
  await cell(page, 'protein', '4').click();
  await expect(page.locator('.toast')).toBeVisible();

  expect(await undersizedTargets(page)).toEqual([]);
});

test('4. a whole day is logged and undone with the keyboard alone', async ({ page }) => {
  await openToday(page);

  // Reach the expander with Tab only, and open it with Enter.
  const expander = page.getByTestId('expander');
  await tabTo(page, expander);
  await expect(expander).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-row]')).toHaveCount(9);

  // `J` focuses the first row; a digit sets that row's Nth option (04-ux.md §4).
  await page.keyboard.press('j');
  for (const [index, step] of DAILY_LOG.entries()) {
    await page.keyboard.press(step.key);
    await expect(row(page, step.id), `${step.id} answers the keyboard`).toHaveClass(/logged/);
    if (index < DAILY_LOG.length - 1) await page.keyboard.press('j');
  }
  const logged = await score(page).textContent();

  // ⌘Z / Ctrl+Z undoes the last write, wherever focus is.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(row(page, 'social_min')).not.toHaveClass(/logged/);
  await expect(score(page)).not.toHaveText(logged!);
});

test('5. `null` is excluded while `false` scores zero — the two differ', async ({ page }) => {
  await openToday(page);
  await page.getByTestId('expander').click();
  for (const step of DAILY_LOG) await cell(page, step.id, step.cell).click();

  // Eight rows score 100; `learned ✓` with no note scores 40 (03-scoring.md
  // §1.6), so the day is (0.54 − 0.09) · 100 + 0.09 · 40 = 48.6 over 0.54 = 90.
  await expect(score(page)).toHaveText('90');

  // `✗` is a value: it is present, it scores 0, and the day falls to 83.
  await cell(page, 'learned', 'no').click();
  await expect(score(page)).toHaveText('83');

  // `·` is not a value: the row leaves the day and the remaining eight score 100.
  await cell(page, 'learned', 'unset').click();
  await expect(row(page, 'learned')).not.toHaveClass(/logged/);
  await expect(score(page)).toHaveText('100');
});

test('6. logging a row does not reorder the list within the same mount', async ({ page }) => {
  await openToday(page);
  const before = await rowOrder(page);
  expect(before[0]).toBe('protein');

  await cell(page, 'protein', '4').click();

  await expect(row(page, 'protein')).toHaveClass(/logged/);
  expect(await rowOrder(page)).toEqual(before);

  // The only feedback is the dimmed label; the cells never move (D18).
  await expect(row(page, 'protein').locator('.label')).toHaveCSS('color', 'rgb(107, 106, 102)');
});

test('7. the toast appears once per write, dismisses in 4 s, and takes focus', async ({ page }) => {
  await openToday(page);
  await page.getByTestId('expander').click();
  await cell(page, 'protein', '4').click();

  await expect(page.locator('.toast')).toHaveCount(1);
  await expect(page.locator('.toast')).toContainText('Protein anchors 4');

  // A second write replaces the first: one toast, never a stack.
  await cell(page, 'creatine', 'yes').click();
  await expect(page.locator('.toast')).toHaveCount(1);
  await expect(page.locator('.toast')).toContainText('Creatine');

  // Reachable with Tab alone, and Enter undoes.
  const undo = page.locator('.toast .undo');
  await tabTo(page, undo);
  await expect(undo).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row(page, 'creatine')).not.toHaveClass(/logged/);

  // 04-ux.md §3: "a quiet toast appears bottom-left for 4 s".
  await cell(page, 'read', 'yes').click();
  await expect(page.locator('.toast')).toBeVisible();
  await expect(page.locator('.toast')).toBeHidden({ timeout: 6000 });
});

test('8. the session makes no network request of its own', async ({ page }) => {
  await openToday(page);
  await page.waitForLoadState('networkidle');

  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await cell(page, 'protein', '4').click();
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('?'); // the help sheet
  await page.keyboard.press('Escape');
  await page.keyboard.press(']'); // next logical day
  await page.keyboard.press('[');
  await expect(logicalDate(page)).not.toHaveText('—');

  expect(requests, 'no fetches, no sync, no analytics').toEqual([]);
});
