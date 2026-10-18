<script lang="ts">
  /* docs/V2.1.md §3.2: the hero's 30-day area. Hand-written SVG on a fixed 0–100
     scale, so the same shape always means the same thing, with the band
     boundaries (60 / 75 / 90, 03-scoring.md §4) drawn in as hairlines. A day with
     no score is a gap: the line lifts and resumes, it never interpolates. */
  import { clamp } from '$lib/metrics/score';

  let { points, label }: { points: readonly (number | null)[]; label: string } = $props();

  /** Chart geometry, in the SVG's own units — not UI sizes. */
  const WIDTH = 320;
  const HEIGHT = 100;
  const PAD = 6;
  const BASE = HEIGHT - PAD;

  /** The band boundaries of 03-scoring.md §4, as hairlines at 0–100. */
  const BANDS = [60, 75, 90] as const;

  const y = (score: number): number => BASE - (clamp(score, 0, 100) / 100) * (HEIGHT - PAD * 2);

  const placed = $derived.by(() =>
    points.map((point, index) => {
      if (point === null) return null;
      const x =
        points.length === 1 ? WIDTH / 2 : PAD + (index / (points.length - 1)) * (WIDTH - PAD * 2);
      return { x: +x.toFixed(2), y: +y(point).toFixed(2) };
    })
  );

  /** Consecutive scored days: one filled shape and one stroke each. */
  const runs = $derived.by(() => {
    const out: { x: number; y: number }[][] = [];
    let run: { x: number; y: number }[] = [];
    for (const point of placed) {
      if (point === null) {
        if (run.length > 0) out.push(run);
        run = [];
        continue;
      }
      run.push(point);
    }
    if (run.length > 0) out.push(run);
    return out;
  });

  const line = (run: { x: number; y: number }[]): string =>
    run.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');

  const area = (run: { x: number; y: number }[]): string => {
    if (run.length === 1) return '';
    const first = run[0]!;
    const last = run[run.length - 1]!;
    return `${line(run)} L${last.x} ${BASE} L${first.x} ${BASE} Z`;
  };

  const head = $derived(
    placed.filter((point): point is { x: number; y: number } => point !== null).at(-1) ?? null
  );

  const summary = $derived.by(() => {
    const present = placed.filter((point) => point !== null).length;
    if (present === 0) return `no scored days yet, bands at ${BANDS.join(', ')}`;
    return `${present} scored days, bands at ${BANDS.join(', ')}`;
  });
</script>

<svg
  class="area-chart"
  viewBox="0 0 {WIDTH} {HEIGHT}"
  role="img"
  aria-label="{label}: {summary}"
  preserveAspectRatio="none"
>
  <defs>
    <linearGradient id="north-area-fade" x1="0" y1="0" x2="0" y2="1">
      <stop class="fade-top" offset="0" />
      <stop class="fade-bottom" offset="1" />
    </linearGradient>
  </defs>

  {#each BANDS as score (score)}
    <line
      class="band"
      x1="0"
      y1={+y(score).toFixed(2)}
      x2={WIDTH}
      y2={+y(score).toFixed(2)}
      vector-effect="non-scaling-stroke"
    />
  {/each}

  <line class="base" x1="0" y1={BASE} x2={WIDTH} y2={BASE} vector-effect="non-scaling-stroke" />

  {#each runs as run, index (index)}
    {#if run.length > 1}
      <path class="fill" d={area(run)} />
    {/if}
    <path class="stroke" d={line(run)} vector-effect="non-scaling-stroke" />
  {/each}

  {#if head}
    <circle class="head" cx={head.x} cy={head.y} r="2.5" />
  {/if}
</svg>

<style>
  .area-chart {
    display: block;
    width: 100%;
    height: var(--area-h-lg);
    /* The one token the gradient needs: currentColor, so no colour is hardcoded. */
    color: var(--accent);
    overflow: visible;
  }

  .fade-top {
    stop-color: currentColor;
    stop-opacity: 0.22;
  }

  .fade-bottom {
    stop-color: currentColor;
    stop-opacity: 0.01;
  }

  .fill {
    fill: url(#north-area-fade);
    stroke: none;
  }

  .stroke {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.75;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .base {
    stroke: var(--rule-strong);
    stroke-width: 1;
  }

  /* The band boundaries: present enough to read the height, quiet enough that
     the line stays the subject. */
  .band {
    stroke: var(--rule);
    stroke-width: 1;
    stroke-dasharray: 2 4;
  }

  .head {
    fill: var(--accent);
  }
</style>
