<script lang="ts">
  /* 05-design.md §4: − / + 44 px buttons with a 1 px outline, the value in
     figures between them, tap the value to type (04-ux.md §3). */
  import { formatValue } from '$lib/format';
  import type { ResolvedMetric } from '$lib/metrics/types';

  interface Props {
    metric: ResolvedMetric;
    value: number | null;
    onchange: (value: number | null) => void;
    /** An optional line under the field, e.g. "1.0 h above target". */
    note?: string | null;
  }

  let { metric, value, onchange, note = null }: Props = $props();

  const step = $derived(metric.step ?? 1);
  const decimals = $derived(metric.decimals ?? 0);

  let editing = $state(false);
  let draft = $state('');
  let field = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (editing) field?.select();
  });

  /** Keep float dust out of the stored value: step 0.1 must never store 7.300000000000001. */
  function round(n: number): number {
    return Number(n.toFixed(Math.min(6, decimals + 2)));
  }

  function nudge(direction: 1 | -1): void {
    onchange(round(Math.max(0, (value ?? 0) + direction * step)));
  }

  function startEditing(): void {
    draft = value === null ? '' : String(value);
    editing = true;
  }

  function commit(): void {
    if (!editing) return;
    editing = false;
    const text = draft.trim().replace(',', '.');
    if (text === '') {
      onchange(null);
      return;
    }
    const parsed = Number(text);
    if (Number.isFinite(parsed) && parsed >= 0) onchange(round(parsed));
  }
</script>

<div class="field">
  <button class="step" type="button" onclick={() => nudge(-1)} aria-label="Decrease {metric.label}"
    >−</button
  >

  {#if editing}
    <input
      class="value num typing"
      type="text"
      inputmode="decimal"
      aria-label={metric.label}
      bind:this={field}
      bind:value={draft}
      onblur={commit}
      onkeydown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') editing = false;
      }}
    />
  {:else}
    <button class="value num" type="button" onclick={startEditing} aria-label="Edit {metric.label}">
      {formatValue(value, metric.unit, decimals)}
    </button>
  {/if}

  <button class="step" type="button" onclick={() => nudge(1)} aria-label="Increase {metric.label}"
    >+</button
  >
</div>

{#if note}<p class="note meta">{note}</p>{/if}

<style>
  .field {
    display: inline-flex;
    align-items: stretch;
    gap: var(--s-2);
  }

  .step {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--tap-min);
    min-height: var(--tap-min);
    border: var(--bw-hair) solid var(--rule);
    border-radius: var(--r-1);
    font-family: var(--font-figures);
    font-size: var(--fs-16);
    color: var(--ink);
  }

  .step:hover {
    background: var(--paper-sunken);
  }

  .value {
    min-width: calc(var(--tap-min) * 2);
    min-height: var(--tap-min);
    padding: 0 var(--s-2);
    border-bottom: var(--bw-hair) solid var(--rule-strong);
    font-family: var(--font-figures);
    font-variant-numeric: tabular-nums;
    font-size: var(--fs-16);
    color: var(--ink);
  }

  .value.typing {
    border-bottom-color: var(--accent);
    text-align: center;
  }

  .note {
    margin-top: var(--s-1);
  }
</style>
