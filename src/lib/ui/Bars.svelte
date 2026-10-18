<script lang="ts">
  /* docs/V2.1.md §3.2: the tile's bar chart. A bar's height is how the day went
     against the target — a taller bar is always the better day, and the hairline
     is always the target. For a `range` metric (lower is better) the bars mirror
     against its ceiling, so "under the ceiling" reads exactly like "over the
     floor". Each bar carries its own day's tone, so the shape says *how* the
     fortnight went, not just how tall it was. Hand-written SVG, no library,
     tokens only. A missing day is a gap. */
  import type { ChartSpec } from '$lib/dashboard';
  import { formatValue } from '$lib/format';

  let { chart, label }: { chart: ChartSpec; label: string } = $props();

  /** Chart geometry, in the SVG's own units — not UI sizes. */
  const WIDTH = 120;
  const HEIGHT = 28;
  const BASE = 1;
  const GAP = 1.5;

  const count = $derived(chart.points.length);

  /**
   * A `range` metric scores a *low* value as good, so its bars are mirrored
   * against the ceiling: the height becomes "how much room was left", a taller
   * bar is still the better day, and the hairline is still the target. Without
   * this, a fortnight of good days is a flat row of stubs.
   */
  const mirrored = $derived(chart.lowerIsBetter && chart.ceiling !== null);

  /** A raw value as a bar height: as-is, or the distance to the ceiling. */
  function draw(point: number): number {
    if (!mirrored) return point;
    return Math.max(0, (chart.ceiling ?? 0) - point);
  }

  /* The bars are scaled to the window's own best, so the shape is the day-to-day
     variation rather than "was it above the line". The scale never runs past the
     value that scores zero: one wild day must not flatten the other thirteen. */
  const scale = $derived.by(() => {
    let best = chart.target === null ? 0 : draw(chart.target);
    for (const point of chart.points) if (point !== null) best = Math.max(best, draw(point));
    const cap = mirrored
      ? (chart.ceiling ?? best)
      : chart.ceiling === null
        ? Infinity
        : Math.max(chart.ceiling, 1);
    return Math.max(1, Math.min(Math.max(best, 1), cap));
  });

  const bars = $derived.by(() => {
    const step = WIDTH / Math.max(1, count);
    const rise = HEIGHT - BASE;
    return chart.points.map((point, index) => {
      if (point === null) return null;
      const ratio = Math.min(1, Math.max(0, draw(point) / scale));
      /* A logged zero still gets a stub, so it reads as "none", not "no data". */
      const height = Math.max(0.75, ratio * rise);
      return {
        x: +(index * step + GAP / 2).toFixed(2),
        width: +Math.max(0.5, step - GAP).toFixed(2),
        y: +(HEIGHT - BASE - height).toFixed(2),
        height: +height.toFixed(2),
        tone: chart.tones[index] ?? 'pillar'
      };
    });
  });

  const targetY = $derived.by(() => {
    if (chart.target === null || chart.kind === 'none') return null;
    const ratio = Math.min(1, Math.max(0, draw(chart.target) / scale));
    return +(HEIGHT - BASE - ratio * (HEIGHT - BASE)).toFixed(2);
  });

  /** The most recent day with data, so the eye lands on where the line ends. */
  const latest = $derived.by(() => {
    for (let index = chart.points.length - 1; index >= 0; index--) {
      if (chart.points[index] !== null) return index;
    }
    return -1;
  });

  const summary = $derived.by(() => {
    const present = chart.points.filter((point) => point !== null).length;
    if (present === 0) return `${chart.caption}: nothing yet`;
    const goal =
      chart.target === null
        ? ''
        : `, ${chart.lowerIsBetter ? 'stay under' : 'target'} ${formatValue(chart.target, chart.unit, chart.decimals)}`;
    return `${chart.caption}, ${present} with data${goal}`;
  });
</script>

<svg
  class="bars"
  viewBox="0 0 {WIDTH} {HEIGHT}"
  role="img"
  aria-label="{label}: {summary}"
  preserveAspectRatio="none"
>
  <line
    class="plinth"
    x1="0"
    y1={HEIGHT - BASE}
    x2={WIDTH}
    y2={HEIGHT - BASE}
    vector-effect="non-scaling-stroke"
  />
  {#each bars as bar, index (index)}
    {#if bar}
      <rect
        class="bar tone-{bar.tone}"
        class:latest={index === latest}
        x={bar.x}
        y={bar.y}
        width={bar.width}
        height={bar.height}
        rx="1.5"
      />
    {/if}
  {/each}
  {#if targetY !== null}
    <line
      class="target"
      x1="0"
      y1={targetY}
      x2={WIDTH}
      y2={targetY}
      vector-effect="non-scaling-stroke"
    />
  {/if}
</svg>

<style>
  .bars {
    display: block;
    width: var(--bars-w, 100%);
    height: var(--bars-h);
    overflow: visible;
  }

  .bar {
    /* The category hue, unless the day itself has something to say. */
    fill: var(--pillar, var(--accent));
    opacity: 0.5;
    transition: opacity var(--t-fast) var(--ease);
  }

  .bar.tone-accent {
    fill: var(--accent);
  }

  .bar.tone-warn {
    fill: var(--warn);
  }

  .bar.latest {
    opacity: 1;
  }

  .plinth {
    stroke: var(--rule);
    stroke-width: 1;
  }

  .target {
    stroke: var(--rule-strong);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }
</style>
