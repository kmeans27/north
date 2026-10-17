<script lang="ts">
  /* 04-ux.md §3: absolute-value cells, `0 1 2 … target`. One tap, never incremental. */
  import { optionsOf } from '$lib/today';
  import CellGroup from './CellGroup.svelte';
  import type { CellOption, CellRowProps } from './cells';

  let { metric, legendId, value, onpick, onfocus }: CellRowProps = $props();

  const options: CellOption[] = $derived(optionsOf(metric));
</script>

<CellGroup
  variant="choice"
  label={metric.label}
  {legendId}
  {value}
  {onpick}
  {onfocus}
  {options}
/>
