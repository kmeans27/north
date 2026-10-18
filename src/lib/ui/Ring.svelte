<script lang="ts">
  /* docs/V2.1.md §3.2: the day's score as a ring. Hand-written SVG, one arc
     stroked with the band tone (03-scoring.md §4), the figure and the band word
     in the middle — so the colour is never the only thing carrying the meaning.
     A day without a score draws the empty track and an em dash, nothing else. */
  import type { ScoreTone } from '$lib/today';

  interface Props {
    /** 0–100, or `null` when there is not enough logged to score the day. */
    value: number | null;
    /** The band in words: `Excellent`, `Strong`, … */
    word: string | null;
    tone?: ScoreTone | 'muted';
    label: string;
  }

  let { value, word, tone = 'ink', label }: Props = $props();

  /* Geometry in the SVG's own units: a 100 × 100 box, so the stroke width and
     the radius stay proportional at any size the token gives the ring. */
  const RADIUS = 44;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const drawn = $derived(value === null ? 0 : Math.min(100, Math.max(0, value)));
  const arc = $derived((drawn / 100) * CIRCUMFERENCE);
  const summary = $derived(
    value === null
      ? `${label}: no score yet`
      : `${label}: ${Math.round(value)} of 100${word ? `, ${word}` : ''}`
  );
</script>

<div class="ring">
  <svg viewBox="0 0 100 100" role="img" aria-label={summary}>
    <circle class="track" cx="50" cy="50" r={RADIUS} />
    {#if value !== null}
      <circle
        class="arc tone-{tone}"
        cx="50"
        cy="50"
        r={RADIUS}
        stroke-dasharray="{arc} {CIRCUMFERENCE}"
        transform="rotate(-90 50 50)"
      />
    {/if}
  </svg>

  <div class="ring-face">
    <span class="ring-value num" data-ring-score
      >{#if value === null}<span class="placeholder">—</span>{:else}{Math.round(value)}{/if}</span
    >
    {#if word}<span class="section-label">{word}</span>{/if}
  </div>
</div>

<style>
  .ring {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--ring-lg);
    height: var(--ring-lg);
    flex: 0 0 auto;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .track {
    fill: none;
    stroke: var(--rule);
    stroke-width: 5;
  }

  .arc {
    fill: none;
    stroke: var(--accent);
    stroke-width: 5;
    stroke-linecap: round;
    transition: stroke-dasharray var(--t-base) var(--ease);
  }

  .tone-accent,
  .tone-ink {
    stroke: var(--accent);
  }

  .tone-warn {
    stroke: var(--warn);
  }

  .tone-bad {
    stroke: var(--bad);
  }

  .tone-muted {
    stroke: var(--rule-strong);
  }

  .ring-face {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .ring-value {
    font-size: var(--fs-32);
    line-height: var(--lh-tight);
  }

  .placeholder {
    font-size: var(--fs-20);
    color: var(--ink-muted);
  }
</style>
