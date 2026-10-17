<script lang="ts">
  /* 05-design.md §4: 11 px, uppercase, --ls-label, muted, with a right meta count. */
  let { label, id, count }: { label: string; id?: string; count?: string } = $props();
</script>

<div class="section-head">
  <h2 class="section-label" id={id}>{label}</h2>
  {#if count}<span class="meta">{count}</span>{/if}
</div>

<style>
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-4);
    margin-bottom: var(--s-2);
  }
</style>
