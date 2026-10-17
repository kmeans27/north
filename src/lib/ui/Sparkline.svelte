<script lang="ts">
  /* 05-design.md §4/§5: hand-written SVG, a fixed 0–100 scale, 1 px accent stroke,
     no axis, no tooltips. A missing day is a gap, never an interpolation. */
  import { clamp } from '$lib/metrics/score';

  let { points, label }: { points: readonly (number | null)[]; label: string } = $props();

  /** Chart geometry, in the SVG's own units — not UI sizes. */
  const WIDTH = 100;
  const HEIGHT = 24;
  const PAD = 2;

  const drawn = $derived(points.map((point) => (point === null ? null : clamp(point, 0, 100))));

  const path = $derived.by(() => {
    const count = drawn.length;
    if (count === 0) return '';
    let d = '';
    let pen = false;
    for (let index = 0; index < count; index++) {
      const point = drawn[index] ?? null;
      if (point === null) {
        pen = false;
        continue;
      }
      const x = count === 1 ? WIDTH / 2 : PAD + (index / (count - 1)) * (WIDTH - PAD * 2);
      const y = HEIGHT - PAD - (point / 100) * (HEIGHT - PAD * 2);
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
      pen = true;
    }
    return d.trim();
  });

  const summary = $derived.by(() => {
    const present = drawn.filter((point): point is number => point !== null);
    if (present.length === 0) return 'no scored days yet';
    const low = Math.round(Math.min(...present));
    const high = Math.round(Math.max(...present));
    return `${present.length} scored days, lowest ${low}, highest ${high}`;
  });
</script>

<svg
  class="sparkline"
  viewBox="0 0 {WIDTH} {HEIGHT}"
  role="img"
  aria-label="{label}: {summary}"
  preserveAspectRatio="none"
>
  <path d={path} fill="none" stroke="var(--accent)" stroke-width="1" vector-effect="non-scaling-stroke" />
</svg>

<style>
  .sparkline {
    display: block;
    width: var(--spark-w);
    height: var(--spark-h);
    overflow: visible;
  }
</style>
