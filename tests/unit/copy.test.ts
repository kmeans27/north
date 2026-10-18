/* tests/unit/copy.test.ts — the copy rules that are cheap to break and easy to
 * check (02-metrics.md §6). Insight copy claims association, never causation;
 * the banned word must not exist in `src/` at all. And every insight card shows
 * its sample size — a card without `n` is not allowed to render.
 *
 * Sources are read through Vite's raw glob, so the test needs no Node types.
 */

import { describe, expect, it } from 'vitest';

const SRC = import.meta.glob('/src/**/*', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

/** The word 02-metrics.md §6 bans from insight copy. */
const BANNED = 'because';

describe('insight copy never claims causation (02-metrics.md §6)', () => {
  it(`never writes "${BANNED}" anywhere in src/`, () => {
    const offenders = Object.entries(SRC)
      .filter(([, text]) => new RegExp(BANNED, 'i').test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('renders the sample size on every insight card', () => {
    const page = SRC['/src/routes/trends/+page.svelte'];
    expect(page, 'the trends page must exist').toBeTruthy();
    // The card loop exists, and inside it the sample size is rendered.
    expect(page).toMatch(/\{#each model\.insights/);
    expect(page).toMatch(/data-insight-n/);
    expect(page).toMatch(/card\.n/);
    // The copy shape is `n = 34 days` (02-metrics.md §6).
    expect(page).toMatch(/n = \{card\.n\}/);
  });
});
