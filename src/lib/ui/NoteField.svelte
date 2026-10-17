<script lang="ts">
  /* 05-design.md §4: one line, no visible border except a bottom hairline,
     400 characters, inline — never a modal (04-ux.md §3). */
  interface Props {
    value: string;
    onchange: (note: string) => void;
    input?: (element: HTMLInputElement) => void;
  }

  let { value, onchange, input }: Props = $props();

  let element = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (element) input?.(element);
  });

  function commit(event: Event): void {
    onchange((event.currentTarget as HTMLInputElement).value);
  }
</script>

<input
  class="note"
  type="text"
  maxlength="400"
  placeholder="what did you learn"
  aria-label="What did you learn"
  value={value}
  bind:this={element}
  onchange={commit}
  onkeydown={(event) => {
    if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur();
  }}
/>

<style>
  .note {
    width: 100%;
    min-height: var(--tap-min);
    padding: var(--s-1) 0;
    background: none;
    border: 0;
    border-bottom: var(--bw-hair) solid var(--rule);
    color: var(--ink);
    font-size: var(--fs-13);
  }

  .note::placeholder {
    color: var(--ink-muted);
  }
</style>
