<script lang="ts">
  /* 05-design.md §4: min-height --row-h, hairline bottom rule, label left and a
     fixed control track right. A logged row dims its label — the cells stay
     exactly where they were: nothing moves under your finger (D18). */
  import type { Snippet } from 'svelte';
  import type { ResolvedMetric, Value } from '$lib/metrics/types';

  interface Props {
    metric: ResolvedMetric;
    /** The row's current value; a change draws the 1 px ink line. */
    value: Value;
    logged: boolean;
    rest?: boolean;
    children: Snippet;
  }

  let { metric, value, logged, rest = false, children }: Props = $props();

  const labelId = $derived(`row-${metric.id}`);
  /* A bare count is meaningless: "Protein 2" only makes sense once you know a
     tap is 32 g. Bins carry their own labels and would only repeat themselves. */
  const unit = $derived(metric.bins?.length ? '' : metric.unit);
  let ink = $state(false);
  /* Plain locals: they must survive between effect runs, not trigger them. */
  let previous: Value = null;
  let primed = false;

  $effect(() => {
    const current = value;
    if (primed && current !== previous) ink = true;
    previous = current;
    primed = true;
  });
</script>

<div class="row" class:logged data-row={metric.id}>
  <span class="label" id={labelId} title={metric.help}>
    {metric.label}
    {#if unit}<span class="unit">{unit}</span>{/if}
    {#if rest}<span class="rest">rest</span>{/if}
  </span>

  <div class="control">
    {@render children()}
    {#if ink}
      <span class="ink" aria-hidden="true" onanimationend={() => (ink = false)}></span>
    {/if}
  </div>
</div>

<style>
  .row {
    /* One shared grid track for every control (05-design.md §3): `.rows` is the
       grid in the page, and each row subgrids it, so cells line up down the
       column while the labels keep `1fr` to wrap into. */
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    gap: 0 var(--s-4);
    position: relative;
    min-height: var(--row-h);
    padding: var(--s-1) 0;
    border-bottom: var(--bw-hair) solid var(--rule);
  }

  .label {
    display: flex;
    align-items: baseline;
    gap: var(--s-2);
    min-width: 0;
    font-size: var(--fs-14);
    color: var(--ink);
    transition: color var(--t-fast) var(--ease);
  }

  .logged .label {
    color: var(--ink-muted);
  }

  .rest {
    font-size: var(--fs-11);
    color: var(--ink-muted);
  }

  .unit {
    font-size: var(--fs-11);
    color: var(--ink-muted);
    white-space: nowrap;
  }

  .control {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--s-2);
  }

  .ink {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--bw-hair);
    background: var(--accent);
    transform-origin: left;
    animation: draw var(--t-base) var(--ease) both;
  }

  @keyframes draw {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(1);
    }
  }

  /* A label plus six 44 px cells needs ~435 px, so on phones the label sits
     above its control rather than being squeezed into the leftover 65 px. */
  @media (max-width: 479px) {
    .row {
      gap: var(--s-1);
      padding: 0 0 var(--s-1);
    }

    .control {
      justify-content: flex-start;
    }
  }
</style>
