<script lang="ts">
  /* 05-design.md §4: full-width, --paper-sunken, 13 px. Used only for a device
     gap and a sync error (04-ux.md §9). Non-dismissible while active. */
  let { message }: { message: string } = $props();
</script>

<p class="banner" role="status">{message}</p>

<style>
  .banner {
    background: var(--paper-sunken);
    border-bottom: var(--bw-hair) solid var(--rule);
    padding: var(--s-3) var(--s-5);
    font-size: var(--fs-13);
    color: var(--ink);
  }
</style>
