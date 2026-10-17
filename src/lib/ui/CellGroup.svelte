<script lang="ts">
  /* The cell rows of 04-ux.md §3 and 05-design.md §4, as one component.
     TriState, ChoiceRow, Segmented and Bins differ only in their options and
     their cell sizing, so they share this: a `<fieldset role="radiogroup">`
     with a visually hidden `<legend>` and one tab stop per row. */
  import type { Value } from '$lib/metrics/types';
  import type { CellOption } from './cells';

  interface Props {
    /** The metric's label: the group's accessible name. */
    label: string;
    legendId: string;
    options: CellOption[];
    value: Value;
    variant: 'triState' | 'choice' | 'segmented' | 'bins';
    onpick: (value: Value) => void;
    onfocus?: (() => void) | undefined;
  }

  let { label, legendId, options, value, variant, onpick, onfocus }: Props = $props();

  /** The cell that is selected; a value outside the options lands on its nearest. */
  const selectedIndex = $derived.by(() => {
    const exact = options.findIndex((option) => option.value === value);
    if (exact !== -1) return exact;
    if (typeof value !== 'number') return -1;
    let nearest = -1;
    let distance = Number.POSITIVE_INFINITY;
    options.forEach((option, index) => {
      if (typeof option.value !== 'number') return;
      const gap = Math.abs(option.value - value);
      if (gap < distance) {
        distance = gap;
        nearest = index;
      }
    });
    return nearest;
  });

  const tabbable = $derived(selectedIndex === -1 ? 0 : selectedIndex);

  /** Arrow keys move inside the group, per the WAI-ARIA radiogroup pattern. */
  function onkeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const group = event.currentTarget as HTMLElement | null;
    const from = selectedIndex === -1 ? 0 : selectedIndex;
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = (from + delta + options.length) % options.length;
    const option = options[next];
    if (!option) return;

    event.preventDefault();
    onpick(option.value);
    requestAnimationFrame(() => {
      group?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
    });
  }
</script>

<fieldset class="cells {variant}" role="radiogroup" aria-labelledby={legendId} onfocusin={onfocus} onkeydown={onkeydown}>
  <legend class="visually-hidden">{label}</legend>

  {#each options as option, index (index)}
    <button
      type="button"
      role="radio"
      aria-checked={option.value === value}
      tabindex={index === tabbable ? 0 : -1}
      class="cell"
      class:chosen={option.value === value}
      class:empty={variant === 'triState' && option.value === null}
      class:yes={variant === 'triState' && option.value === true}
      class:no={variant === 'triState' && option.value === false}
      onclick={() => onpick(option.value)}
    >
      <span class="glyph" aria-hidden={option.spoken ? 'true' : undefined}>{option.label}</span>
      {#if option.spoken}<span class="visually-hidden">{option.spoken}</span>{/if}
    </button>
  {/each}
</fieldset>

<style>
  .cells {
    display: inline-flex;
    align-items: stretch;
    margin: 0;
    padding: 0;
    border: var(--bw-hair) solid var(--rule);
    border-radius: var(--r-1);
    background: var(--paper);
  }

  .cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: var(--tap-min);
    padding: var(--s-1);
    border-left: var(--bw-hair) solid var(--rule);
    color: var(--ink-muted);
    font-size: var(--fs-14);
    font-variant-numeric: tabular-nums;
    transition: background-color var(--t-fast) var(--ease), color var(--t-fast) var(--ease);
  }

  .cell:first-of-type {
    border-left: 0;
  }

  .glyph {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--cell);
    height: var(--cell);
    font-family: var(--font-figures);
  }

  .cells.bins .cell {
    padding: 0 var(--s-3);
  }

  .cells.bins .glyph {
    width: auto;
    font-family: var(--font-ui);
    font-size: var(--fs-13);
    white-space: nowrap;
  }

  .cell.chosen {
    background: var(--paper-sunken);
    color: var(--ink);
    outline: var(--bw-hair) solid var(--ink);
    outline-offset: calc(var(--bw-hair) * -1);
  }

  .cell.empty {
    color: var(--ink-faint);
  }

  .cell.chosen.yes {
    color: var(--accent);
  }

  .cell.chosen.no {
    color: var(--bad);
  }

  .cell:hover {
    background: var(--paper-sunken);
  }
</style>
