<script lang="ts">
  /* 05-design.md §4: bottom-left, 13 px, --paper on a 1 px --rule, max 280 px,
     four seconds, one undo. A real button, so it is reachable with the keyboard. */
  import { dismissToast, toast } from './toast.svelte';

  let { onundo }: { onundo: () => void } = $props();

  function undo(): void {
    dismissToast();
    onundo();
  }
</script>

{#if toast.current}
  <div class="toast-host">
    <div class="toast" role="status">
      <span class="toast-text">{toast.current.message}</span>
      <button class="undo" type="button" onclick={undo}>Undo</button>
    </div>
  </div>
{/if}

<style>
  .toast-host {
    position: fixed;
    left: var(--s-5);
    bottom: var(--s-5);
    z-index: 20;
    max-width: var(--toast-w);
  }

  .toast {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-1) var(--s-3);
    background: var(--paper);
    border: var(--bw-hair) solid var(--rule);
    font-size: var(--fs-13);
    animation: toast-in var(--t-fast) var(--ease) both;
  }

  .toast-text {
    color: var(--ink);
  }

  .undo {
    color: var(--accent);
    font-size: var(--fs-13);
    text-decoration: underline;
    text-decoration-thickness: var(--bw-hair);
    text-underline-offset: 2px;
    min-height: var(--tap-min);
    min-width: var(--tap-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
