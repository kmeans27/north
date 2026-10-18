/* tests/unit/charts.test.ts — charts are hand-written SVG (05-design.md §5).
 *
 * A chart library is on the banned list (AGENTS.md §1) and a canvas would cost
 * the bundle for nothing. This suite holds that line: no runtime dependencies,
 * no chart package, no `<canvas>`, and the chart components really are SVG.
 *
 * Sources are read through Vite's raw glob, so the test needs no Node types.
 */

import { describe, expect, it } from 'vitest';

const SRC = import.meta.glob('/src/**/*', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

const pkgText = Object.values(
  import.meta.glob('/package.json', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >
)[0]!;

const BANNED_CHART_PACKAGES = [
  'chart.js',
  'chartjs',
  'd3',
  'echarts',
  'apexcharts',
  'recharts',
  'plotly.js',
  'highcharts',
  'victory',
  'uplot',
  'lightweight-charts',
  'billboard.js',
  'frappe-charts'
];

describe('charts are hand-written SVG', () => {
  it('ships no runtime dependencies at all', () => {
    const pkg = JSON.parse(pkgText) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('names no chart library anywhere in package.json', () => {
    const lower = pkgText.toLowerCase();
    for (const banned of BANNED_CHART_PACKAGES) {
      expect(lower, `${banned} must not be a dependency`).not.toContain(`"${banned}"`);
    }
  });

  it('renders a source tree to scan', () => {
    expect(Object.keys(SRC).length).toBeGreaterThan(20);
  });

  it('never uses a canvas', () => {
    for (const [file, text] of Object.entries(SRC)) {
      expect(text, `${file} must not use <canvas>`).not.toMatch(/<canvas/i);
      expect(text, `${file} must not use getContext`).not.toMatch(/getContext\s*\(/);
    }
  });

  it('draws the charts as SVG', () => {
    for (const component of ['MetricChart.svelte', 'HeatGrid.svelte']) {
      const text = SRC[`/src/lib/ui/${component}`];
      expect(text, `${component} must exist and render an <svg>`).toMatch(/<svg/);
    }
  });
});
