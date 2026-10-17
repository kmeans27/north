<script lang="ts">
  /* 04-ux.md §3: three cells — `·` `✓` `✗`. One tap sets the state; `·` clears (D4). */
  import { optionsOf } from '$lib/today';
  import CellGroup from './CellGroup.svelte';
  import type { CellRowProps } from './cells';

  let { metric, legendId, value, onpick, onfocus }: CellRowProps = $props();

  const options = $derived(optionsOf(metric));
</script>

<CellGroup
  variant="triState"
  label={metric.label}
  {legendId}
  {value}
  {onpick}
  {onfocus}
  {options}
/>
