<script lang="ts">
  /* 05-design.md §4: an 11 px label above a 14 px figure and a 4 px source dot.
     Tapping opens the sheet with the history and the override (04-ux.md §3). */
  import { formatCompact, formatValue } from '$lib/format';
  import type { DayValue, ResolvedMetric, Value } from '$lib/metrics/types';

  interface Props {
    metric: ResolvedMetric;
    value: Value;
    source?: DayValue['src'];
    overridden?: boolean;
    onopen: () => void;
  }

  let { metric, value, source = 'auto', overridden = false, onopen }: Props = $props();

  const display = $derived(
    typeof value === 'number'
      ? `${formatCompact(value, metric.unit)}${metric.unit && metric.unit !== 'k' ? ` ${metric.unit}` : ''}`
      : formatValue(value, metric.unit, metric.decimals)
  );

  const dot = $derived(overridden ? 'overridden' : source === 'manual' ? 'manual' : 'auto');
</script>

<button class="cell" type="button" onclick={onopen} aria-label="{metric.label}: {display} ({dot})">
  <span class="meta">{metric.short}</span>
  <span class="figure num">{display}</span>
  <span class="dot {dot}" aria-hidden="true"></span>
</button>

<style>
  .cell {
    display: inline-grid;
    grid-template-columns: auto auto;
    align-items: baseline;
    gap: 0 var(--s-2);
    min-height: var(--tap-min);
    align-content: center;
    padding: var(--s-2) var(--s-3);
    border: var(--bw-hair) solid var(--rule);
    border-radius: var(--r-1);
    text-align: left;
  }

  .cell:hover {
    background: var(--paper-sunken);
  }

  .figure {
    font-size: var(--fs-14);
    color: var(--ink);
  }

  .dot {
    width: var(--dot);
    height: var(--dot);
    border-radius: 50%;
    align-self: center;
  }

  .dot.manual {
    background: var(--accent);
  }

  .dot.auto {
    background: var(--ink-faint);
  }

  .dot.overridden {
    background: var(--warn);
  }
</style>
