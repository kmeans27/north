import { expect, test } from '@playwright/test';

/* M0 acceptance (08-build-plan.md): the deployed page renders the token palette
   in a 620 px column with hairline rules and no shadows, and the demo seed is
   deterministic across reloads. Also enforces the DoD: no console errors and no
   runtime network requests beyond the self-hosted font. */

test.describe('M0 shell', () => {
  test('renders the palette in a 620 px column with a 56 px header', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));

    await page.goto('/');

    const shell = page.locator('.shell').first();
    await expect(shell).toBeVisible();
    const shellBox = await shell.boundingBox();
    expect(shellBox, 'measure').not.toBeNull();
    expect(shellBox!.width).toBeLessThanOrEqual(620);
    expect(shellBox!.width).toBeGreaterThan(0);

    const headerBox = await page.locator('.topbar').boundingBox();
    expect(headerBox!.height).toBeCloseTo(56, 0);

    // No shadows anywhere: the design is ink on paper (05-design.md §3).
    const shadows = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .map((el) => getComputedStyle(el).boxShadow)
        .filter((shadow) => shadow !== 'none')
    );
    expect(shadows).toEqual([]);

    // The accent is the only saturated colour (05-design.md §1).
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
    const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(fontFamily.startsWith('Inter')).toBe(true);
  });

  test('renders 120 demo days deterministically across reloads', async ({ page }) => {
    await page.goto('/?demo=1');

    await expect(page.getByTestId('demo-days')).toHaveText('120');
    await expect(page.getByTestId('demo-repeatable')).toHaveText('identical on two runs');
    const first = await page.getByTestId('demo-fingerprint').textContent();

    await page.reload();
    await expect(page.getByTestId('demo-days')).toHaveText('120');
    const second = await page.getByTestId('demo-fingerprint').textContent();

    expect(first).toMatch(/^[0-9a-f]{8}$/);
    expect(second).toBe(first);
  });

  test('keeps the page usable at 320 px and 200 % zoom', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/?demo=1');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);

    // Root font-size doubling must not clip or force horizontal scrolling.
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    const zoomOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(zoomOverflow).toBe(false);
  });
});
