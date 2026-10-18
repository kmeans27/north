import { expect, test } from '@playwright/test';

/* M0 acceptance (08-build-plan.md §M0), carried onto the real Today screen: a
   620 px column under a 56 px top bar, ink on paper with no shadows, and a
   deterministic 120-day demo seed. Also the DoD: no console errors, no runtime
   network requests beyond the self-hosted font, correct at 320 px and 1440 px. */

test('renders the page in a 620 px column under a 56 px top bar, with no shadows', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/');

  const shell = page.locator('.topbar .shell');
  await expect(shell).toBeVisible();
  const box = await shell.boundingBox();
  expect(box, 'measure').not.toBeNull();
  // docs/V2.1.md §3: the dashboard reads across the width; the shell caps it.
  expect(box!.width).toBeLessThanOrEqual(1400);
  expect(box!.width).toBeGreaterThan(0);

  const header = await page.locator('.topbar').boundingBox();
  expect(header!.height).toBeCloseTo(56, 0);

  // No shadows anywhere: the design is ink on paper (05-design.md §3).
  const shadows = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .map((element) => getComputedStyle(element).boxShadow)
      .filter((shadow) => shadow !== 'none')
  );
  expect(shadows).toEqual([]);

  // The paper is warm and the accent is the only saturated colour (§1).
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe('rgb(250, 249, 246)');

  expect(errors).toEqual([]);
});

test('makes no external requests and loads the self-hosted font', async ({ page }) => {
  const external: string[] = [];
  const fonts: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') external.push(request.url());
    if (request.resourceType() === 'font') fonts.push(url.pathname);
  });

  await page.goto('/', { waitUntil: 'networkidle' });

  expect(external).toEqual([]);
  expect(fonts).toContain('/fonts/inter-var-latin.woff2');

  // The font really loaded: Inter is in use, not a system fallback.
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family.startsWith('Inter')).toBe(true);
});

test('renders 120 demo days deterministically across reloads', async ({ page }) => {
  await page.goto('/?demo=1');

  await expect(page.getByTestId('demo-days')).toHaveText('120');
  const first = (await page.getByTestId('demo-fingerprint').textContent())!.trim();
  expect(first).toMatch(/^[0-9a-f]{8}$/);
  // Every seeded day carries watch data, so no gap banner (04-ux.md §9).
  await expect(page.locator('.banner')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('demo-days')).toHaveText('120');
  expect((await page.getByTestId('demo-fingerprint').textContent())!.trim()).toBe(first);
});

test('a fresh install reports no device gap', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-row]').first()).toBeVisible();

  // No device has ever delivered, so nothing has stopped (§9).
  await expect(page.locator('.banner')).toHaveCount(0);
});

test('holds 620 px on the log and the full width on the dashboard, and never overflows at 320 px', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // v1's measure is unchanged: the log stays a 620 px column.
  await page.goto('/log?demo=1');
  const column = await page.locator('main .shell').boundingBox();
  expect(column!.width).toBe(620);
  expect(Math.round(column!.x)).toBe(410); // centred in 1440

  // v2.1's dashboard uses the width (docs/V2.1.md §3), and the top bar follows it.
  await page.goto('/?demo=1');
  const wide = await page.locator('main .shell').boundingBox();
  expect(wide!.width).toBe(1400);
  expect(Math.round(wide!.x)).toBe(20);
  const bar = await page.locator('.topbar .shell').boundingBox();
  expect(bar!.width).toBe(1400);

  const overflow = async (): Promise<boolean> =>
    page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/?demo=1');
  expect(await overflow(), 'no horizontal scroll at 320 px').toBe(false);

  // 05-design.md §8: the layout survives a doubled root font-size.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(await overflow(), 'no horizontal scroll at 200 %').toBe(false);
});
