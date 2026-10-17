<script lang="ts">
  /* 04-ux.md §3: `0 1 2 3+`. The `3+` cell stores 3.5. */
  import { optionsOf } from '$lib/today';
  import CellGroup from './CellGroup.svelte';
  import type { CellOption, CellRowProps } from './cells';

  let { metric, legendId, value, onpick, onfocus }: CellRowProps = $props();

  const options: CellOption[] = $derived(optionsOf(metric));
</script>

<CellGroup
  variant="segmented"
  label={metric.label}
  {legendId}
  {value}
  {onpick}
  {onfocus}
  {options}
/>
