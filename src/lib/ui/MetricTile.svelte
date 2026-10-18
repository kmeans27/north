<script lang="ts">
  /* docs/V2.1.md §3.1: one tile of the board.
     Label, figure, the target in words, then the control or the chart — the
     control IS the readout for the things you tap (V2's rule), and the chart is
     the shape of the last fortnight for the ones a device fills in. A metric
     with no value prints an em dash in --ink-muted, and its control stays
     reachable: a missing day is a gap, never a zero (D3). */
  import type { PanelMetric } from '$lib/dashboard';
  import { tileTone, tileUnit } from '$lib/dashboard';
  import type { Pillar, ResolvedMetric, Value } from '$lib/metrics/types';
  import { displayValue } from '$lib/today';
  import Bars from './Bars.svelte';
  import Bins from './Bins.svelte';
  import ChoiceRow from './ChoiceRow.svelte';
  import NoteField from './NoteField.svelte';
  import NumberField from './NumberField.svelte';
  import Segmented from './Segmented.svelte';
  import Sparkline from './Sparkline.svelte';
  import TriState from './TriState.svelte';

  interface Props {
    row: PanelMetric;
    pillar: Pillar;
    readOnly: boolean;
    /** The day's one line — only `learned` reads it (03-scoring.md §1.6). */
    note: string;
    onwrite: (metric: ResolvedMetric, value: Value) => void;
    onnote: (note: string) => void;
  }

  let { row, pillar, readOnly, note, onwrite, onnote }: Props = $props();

  const metric = $derived(row.metric);
  const legendId = $derived(`row-${metric.id}`);
  /**
   * A bare cell label cannot carry the unit, so it rides the label (`4` next to
   * `×32 g`); a typed number prints its own unit in the figure (`8.2 h`), so the
   * label does not repeat it; a bin labels itself (`≤ 2h`).
   */
  const unit = $derived(tileUnit(metric));
  const tone = $derived(tileTone(row.score));
  const hasChart = $derived(row.chart.kind === 'bars');
  const hasTrend = $derived(!hasChart && row.trend.filter((point) => point !== null).length >= 2);
  /** `learned` is the one metric whose note is part of its value (D12). */
  const asksNote = $derived(metric.id === 'learned' && row.value.value === true);

  const size = $derived(
    asksNote || (hasChart && row.span >= 3) ? 'lg' : row.span >= 3 ? 'md' : 'sm'
  );
  const shownText = $derived(row.shown === null ? '—' : displayValue(metric, row.shown));
</script>

<li
  class="tile"
  data-row={metric.id}
  data-span={row.span}
  data-size={size}
  style="--tile-span: {row.span}; --pillar: var(--pillar-{pillar})"
>
  <header class="tile-head">
    <h3 class="tile-label" id={legendId} title={metric.help}>
      {metric.label}
      {#if unit}<span class="tile-unit">{unit}</span>{/if}
    </h3>
    {#if tone !== null}
      <span class="tile-score num tone-{tone}" data-score title="score, 0 to 100"
        >{Math.round(row.score ?? 0)}</span
      >
    {/if}
  </header>

  <div class="tile-body">
    <p class="tile-figure">
      <span class="tile-value num" class:muted={row.shown === null} data-value>{shownText}</span>
      {#if row.goal}<span class="tile-goal">{row.goal}</span>{/if}
    </p>

    {#if row.control !== null && !readOnly}
      <div class="tile-control">
        {#if row.control === 'triState'}
          <TriState
            metric={metric}
            {legendId}
            value={row.controlValue}
            onpick={(value) => onwrite(metric, value)}
          />
        {:else if row.control === 'choice'}
          <ChoiceRow
            metric={metric}
            {legendId}
            value={row.controlValue}
            onpick={(value) => onwrite(metric, value)}
          />
        {:else if row.control === 'segmented'}
          <Segmented
            metric={metric}
            {legendId}
            value={row.controlValue}
            onpick={(value) => onwrite(metric, value)}
          />
        {:else if row.control === 'bins'}
          <Bins
            metric={metric}
            {legendId}
            value={row.controlValue}
            onpick={(value) => onwrite(metric, value)}
          />
        {:else if row.control === 'number'}
          <NumberField
            metric={metric}
            value={typeof row.controlValue === 'number' ? row.controlValue : null}
            onchange={(value) => onwrite(metric, value)}
          />
        {/if}
      </div>
    {:else if hasChart}
      <div class="tile-chart" data-chart={metric.id}>
        <Bars chart={row.chart} label={`${metric.label}, ${row.chart.caption}`} />
      </div>
    {:else if hasTrend}
      <div class="tile-chart" data-spark={metric.id}>
        <Sparkline points={row.trend} label={`${metric.label} score, 30 days`} />
      </div>
    {/if}
  </div>

  {#if asksNote && !readOnly}
    <NoteField value={note} onchange={onnote} />
  {/if}
</li>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    grid-column: span var(--tile-span, 1);
    min-width: 0;
    min-height: var(--tile-h-sm);
    padding: var(--tile-pad);
    background: var(--card);
    border: var(--bw-hair) solid var(--rule);
    /* The category, as a 2 px mark rather than a word repeated nineteen times. */
    border-left: 2px solid var(--pillar, var(--rule-strong));
    border-radius: var(--r-3);
  }

  .tile[data-size='md'] {
    min-height: var(--tile-h-md);
  }

  .tile[data-size='lg'] {
    min-height: var(--tile-h-lg);
  }

  .tile-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-2);
    min-width: 0;
  }

  .tile-label {
    display: flex;
    align-items: baseline;
    gap: var(--s-2);
    min-width: 0;
    overflow: hidden;
    font-size: var(--fs-11);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--ls-label);
    color: var(--ink-muted);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .tile-unit {
    flex: 0 0 auto;
    font-size: var(--fs-11);
    letter-spacing: normal;
    text-transform: none;
  }

  .tile-score {
    flex: 0 0 auto;
    font-size: var(--fs-12);
    line-height: var(--lh-tight);
  }

  .tone-accent {
    color: var(--accent);
  }

  .tone-pillar {
    color: var(--pillar, var(--accent));
  }

  .tone-warn {
    color: var(--warn);
  }

  .tile-body {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2) var(--s-3);
    min-width: 0;
    margin-top: auto;
  }

  .tile-figure {
    display: flex;
    flex: 0 0 auto;
    align-items: baseline;
    gap: var(--s-2);
    min-width: 0;
  }

  .tile-value {
    font-size: var(--fs-24);
    line-height: var(--lh-tight);
    color: var(--ink);
  }

  .tile[data-size='sm'] .tile-value {
    font-size: var(--fs-20);
  }

  /* A missing value is a real thing to find, not decoration: the faint token is
     too quiet to read at this size (and fails contrast on both themes). */
  .tile-value.muted {
    color: var(--ink-muted);
  }

  .tile-goal {
    overflow: hidden;
    font-size: var(--fs-11);
    color: var(--ink-muted);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .tile-control {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
  }

  .tile-control :global(.cells) {
    flex: 1 1 auto;
  }

  .tile-control :global(.cell) {
    flex: 1 1 auto;
  }

  /* A chart is a full-width strip under the figure, always. */
  .tile-chart {
    flex: 1 1 100%;
    min-width: 0;
    --bars-w: 100%;
    --bars-h: var(--bars-h-lg);
    --spark-w: 100%;
    --spark-h: var(--bars-h-sm);
    --spark: var(--pillar, var(--accent));
  }

  .tile[data-size='sm'] .tile-chart {
    --bars-h: var(--bars-h-sm);
  }
</style>
