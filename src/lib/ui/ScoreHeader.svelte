<script lang="ts">
  /* 04-ux.md §2 and 05-design.md §4: three figures with 11 px labels and a
     30-day sparkline. The band word is always rendered — colour is decoration. */
  import { band } from '$lib/metrics/score';
  import { scoreAnnouncement, type ScoreHeaderModel, type ScoreTone } from '$lib/today';
  import Sparkline from './Sparkline.svelte';

  let { header, tone }: { header: ScoreHeaderModel; tone: ScoreTone | 'muted' } = $props();

  const rounded = (value: number): number => Math.round(value);

  const bandWord = $derived(header.day === null ? null : band(header.day));
  const announcement = $derived(scoreAnnouncement(header));
  const streak = $derived(header.streak > 365 ? '365+' : String(header.streak));
  const coverageLine = $derived(
    header.day === null
      ? 'Not enough logged yet — the score appears after 25 % coverage.'
      : `Logged ${header.logged} of ${header.total} today.`
  );
</script>

<section class="score fade-in" aria-labelledby="score-heading">
  <h2 class="visually-hidden" id="score-heading">Score</h2>

  <div class="figures">
    <div class="figure">
      <span class="figure-value big num tone-{tone}"
        >{#if header.day === null}<span class="placeholder">—</span>{:else}{rounded(header.day)}{/if}</span
      >
      <span class="meta">today</span>
    </div>
    <div class="figure">
      <span class="figure-value mid num" class:muted={header.sevenDay === null}
        >{header.sevenDay === null ? '—' : rounded(header.sevenDay)}</span
      >
      <span class="meta">7-day</span>
    </div>
    <div class="figure">
      <span class="figure-value mid num">{streak}</span>
      <span class="meta">streak</span>
    </div>
  </div>

  <Sparkline points={header.sparkline} label="30-day score" />

  <p class="visually-hidden" aria-live="polite">{announcement}</p>
</section>

<p class="status-line">
  {#if bandWord}<span class="band">{bandWord}</span> · {/if}
  <span class="meta">{coverageLine}</span>
</p>

<style>
  .score {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
  }

  .figures {
    display: flex;
    align-items: baseline;
    gap: var(--s-6);
  }

  .figure {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }

  .figure-value {
    font-family: var(--font-figures);
    font-variant-numeric: tabular-nums;
    line-height: var(--lh-tight);
  }

  .big {
    font-size: var(--fs-56);
  }

  .mid {
    font-size: var(--fs-20);
  }

  /* No score yet: a 56 px em-dash reads as a redaction bar, so the placeholder
     is drawn smaller. The box keeps its 56 px line height, so nothing shifts
     when the score arrives. */
  .placeholder {
    font-size: var(--fs-24);
    color: var(--ink-muted);
  }

  .muted {
    color: var(--ink-muted);
  }

  .tone-accent {
    color: var(--accent);
  }

  .tone-ink {
    color: var(--ink);
  }

  /* No score yet: the placeholder is not a figure, so it is not as loud. */
  .tone-muted {
    color: var(--ink-muted);
  }

  .tone-warn {
    color: var(--warn);
  }

  .tone-bad {
    color: var(--bad);
  }

  .status-line {
    margin-top: var(--s-2);
  }

  .band {
    font-size: var(--fs-11);
    color: var(--ink);
  }
</style>
