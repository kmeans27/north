<script lang="ts">
  /* 04-ux.md §3: 4–5 labelled cells sized to their content (D2: coarse bins). */
  import { optionsOf } from '$lib/today';
  import CellGroup from './CellGroup.svelte';
  import type { CellOption, CellRowProps } from './cells';

  let { metric, legendId, value, onpick, onfocus }: CellRowProps = $props();

  const options: CellOption[] = $derived(optionsOf(metric));
</script>

<CellGroup
  variant="bins"
  label={metric.label}
  {legendId}
  {value}
  {onpick}
  {onfocus}
  {options}
/>
