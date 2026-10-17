<script lang="ts">
  /* 05-design.md §4: a bottom sheet on mobile, a right-side panel on desktop.
     Rule only, no shadow, 180 ms lift. Esc closes it (04-ux.md §4). */
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    onclose: () => void;
    children: Snippet;
  }

  let { open, title, onclose, children }: Props = $props();

  let panel = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!open) return;
    panel?.querySelector<HTMLElement>('button, input, [href]')?.focus();
  });
</script>

{#if open}
  <div class="layer">
    <button class="scrim" type="button" tabindex="-1" aria-hidden="true" onclick={onclose}></button>
    <div class="sheet" role="dialog" aria-label={title} bind:this={panel}>
      <div class="sheet-head">
        <h2 class="section-label">{title}</h2>
        <button class="close" type="button" onclick={onclose}>Close</button>
      </div>
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .layer {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    justify-content: flex-end;
  }

  .scrim {
    position: absolute;
    inset: 0;
    background: transparent;
    cursor: default;
  }

  .sheet {
    position: relative;
    width: var(--sheet-w);
    max-width: 100%;
    height: 100%;
    overflow-y: auto;
    background: var(--paper);
    border-left: var(--bw-hair) solid var(--rule);
    padding: var(--s-5);
    animation: sheet-in var(--t-base) var(--ease) both;
  }

  .sheet-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-4);
    margin-bottom: var(--s-4);
  }

  .close {
    min-height: var(--tap-min);
    min-width: var(--tap-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
    font-size: var(--fs-13);
  }

  @keyframes sheet-in {
    from {
      transform: translateY(var(--sheet-lift));
      opacity: 0;
    }
    to {
      transform: none;
      opacity: 1;
    }
  }

  @media (max-width: 560px) {
    .layer {
      align-items: flex-end;
    }

    .sheet {
      width: 100%;
      height: auto;
      max-height: 70%;
      border-left: 0;
      border-top: var(--bw-hair) solid var(--rule);
    }
  }
</style>
