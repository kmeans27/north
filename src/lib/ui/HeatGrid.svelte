<script lang="ts">
  /* 05-design.md §4/§5: 7 columns × n rows of 10 × 10 cells, 2 px gap, fill
     opacity = score / 100 in --accent, empty cells in --rule. Pressure, not
     colour: no green squares, no legend beyond the line above it. Pure SVG. */
  interface Props {
    /** Oldest first. Null is a day with no data: a --rule cell. */
    points: readonly (number | null)[];
    /** Cells to skip before the first day, so each column is a weekday. */
    offset?: number;
    label: string;
  }

  let { points, offset = 0, label }: Props = $props();

  /** Chart geometry, in the SVG's own units — not UI sizes. */
  const CELL = 10;
  const GAP = 2;
  const COLUMNS = 7;
  /* A zero still has to be visible, so the ink never goes below this. */
  const MIN_INK = 0.12;

  const rows = $derived(Math.max(1, Math.ceil((offset + points.length) / COLUMNS)));
  const width = $derived(COLUMNS * CELL + (COLUMNS - 1) * GAP);
  const height = $derived(rows * CELL + (rows - 1) * GAP);

  const cells = $derived.by(() => {
    const out: { x: number; y: number; score: number | null }[] = [];
    for (let index = 0; index < points.length; index++) {
      const slot = offset + index;
      out.push({
        x: (slot % COLUMNS) * (CELL + GAP),
        y: Math.floor(slot / COLUMNS) * (CELL + GAP),
        score: points[index] ?? null
      });
    }
    return out;
  });

  const scored = $derived(points.filter((point): point is number => point !== null));

  const summary = $derived.by(() => {
    if (scored.length === 0) return `no scored days in the last ${points.length} days`;
    const average = Math.round(scored.reduce((total, value) => total + value, 0) / scored.length);
    return `${scored.length} of ${points.length} days scored, average ${average}`;
  });
</script>

<svg
  class="heat"
  viewBox="0 0 {width} {height}"
  width={width}
  height={height}
  role="img"
  aria-label="{label} consistency: {summary}"
>
  {#each cells as cell (`${cell.x}-${cell.y}`)}
    {#if cell.score === null}
      <rect class="empty" x={cell.x} y={cell.y} width={CELL} height={CELL} />
    {:else}
      <rect
        class="cell"
        x={cell.x}
        y={cell.y}
        width={CELL}
        height={CELL}
        fill-opacity={Math.max(MIN_INK, Math.min(1, cell.score / 100))}
      />
    {/if}
  {/each}
</svg>

<style>
  .heat {
    display: block;
    flex: none;
  }

  .cell {
    fill: var(--accent);
  }

  .empty {
    fill: var(--rule);
  }
</style>
