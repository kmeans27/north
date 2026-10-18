<script lang="ts">
  /* 04-ux.md §6 and 05-design.md §5: one hand-written SVG line per metric. The
     scale starts at the metric's zeroAt or 0, the target is a hairline, a
     missing day is a gap. No hover, no tooltip: a click or the arrow keys pick
     a point, and the page renders its value in the row header. */
  import { nearestIndex, stepSelection, type TrendDomain, type TrendPoint } from '$lib/trends';

  interface Props {
    series: readonly TrendPoint[];
    domain: TrendDomain;
    /** The selected date, or null when the header shows the latest value. */
    selected: string | null;
    /** Accessible name; the page owns formatting (bins, toggles, units). */
    label: string;
    onselect: (date: string) => void;
  }

  let { series, domain, selected, label, onselect }: Props = $props();

  /** Chart geometry, in the SVG's own units — not UI sizes. */
  const WIDTH = 100;
  const HEIGHT = 28;
  const PAD = 3;

  const span = $derived(domain.max - domain.min || 1);

  function x(index: number): number {
    const count = series.length;
    if (count <= 1) return WIDTH / 2;
    return PAD + (index / (count - 1)) * (WIDTH - PAD * 2);
  }

  function y(value: number): number {
    const fraction = Math.max(0, Math.min(1, (value - domain.min) / span));
    return HEIGHT - PAD - fraction * (HEIGHT - PAD * 2);
  }

  const line = $derived.by(() => {
    let path = '';
    let pen = false;
    series.forEach((point, index) => {
      if (point.value === null) {
        pen = false;
        return;
      }
      path += `${pen ? 'L' : 'M'}${x(index).toFixed(1)} ${y(point.value).toFixed(1)} `;
      pen = true;
    });
    return path.trim();
  });

  const targetY = $derived(
    domain.target === null || domain.target < domain.min || domain.target > domain.max
      ? null
      : y(domain.target)
  );

  /** The tinted side of the target rule: better is up for most, down for `range`. */
  const zone = $derived.by(() => {
    if (targetY === null) return null;
    const top = domain.lowerIsBetter ? targetY : y(domain.max);
    const bottom = domain.lowerIsBetter ? y(domain.min) : targetY;
    const height = bottom - top;
    if (height < 0.5) return null;
    return { y: top, height };
  });

  const selectedPoint = $derived(
    selected === null ? null : (series.find((point) => point.date === selected) ?? null)
  );
  const selectedIndex = $derived(
    selected === null ? -1 : series.findIndex((point) => point.date === selected)
  );

  function pick(clientX: number, element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return;
    const index = nearestIndex(series, (clientX - rect.left) / rect.width);
    const point = index === null ? null : series[index];
    if (point) onselect(point.date);
  }

  function onkeydown(event: KeyboardEvent): void {
    let next: string | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        next = stepSelection(series, selected, -1);
        break;
      case 'ArrowRight':
        next = stepSelection(series, selected, 1);
        break;
      case 'Home':
        next = stepSelection(series, null, 1);
        break;
      case 'End':
        next = stepSelection(series, null, -1);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next) onselect(next);
  }
</script>

<button
  class="chart"
  type="button"
  aria-label={label}
  onclick={(event) => pick(event.clientX, event.currentTarget)}
  {onkeydown}
>
  <svg class="line" viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
    {#if zone}
      <rect class="zone" x="0" y={zone.y} width={WIDTH} height={zone.height} />
    {/if}
    {#if targetY !== null}
      <line class="target" x1="0" y1={targetY} x2={WIDTH} y2={targetY} />
    {/if}
    <path class="stroke" d={line} />
    {#if selectedPoint && selectedPoint.value !== null && selectedIndex >= 0}
      <circle
        class="mark"
        cx={x(selectedIndex)}
        cy={y(selectedPoint.value)}
        r="2"
        vector-effect="non-scaling-stroke"
      />
    {/if}
  </svg>
</button>

<style>
  .chart {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: var(--tap-min);
    padding: 0;
    cursor: crosshair;
  }

  .line {
    display: block;
    width: 100%;
    height: var(--spark-h);
    overflow: visible;
    pointer-events: none;
  }

  .stroke {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .target {
    stroke: var(--rule-strong);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .zone {
    fill: var(--accent-soft);
    fill-opacity: 0.4;
  }

  .mark {
    fill: var(--accent);
  }
</style>
