<script lang="ts">
  /* src/lib/ui/DashboardView.svelte — the v2.1 board, for both `/` and `/preview`.
     One screen, every part of life: the hero carries the day's composite, then
     each pillar is a band of tiles whose width is the metric's weight
     (docs/V2.1.md §3). The screen is read-first — the things you tap are the
     control tiles, right where you read them, and nothing re-orders under your
     finger (D18).

     It is deliberately dumb: it takes days, a day, settings and two write
     callbacks, so `/preview` can show a finished day out of `sample.ts` without
     persisting a byte. */
  import { untrack } from 'svelte';
  import {
    dashboard,
    panelOrder,
    tileTone,
    type DashboardOptions
  } from '$lib/dashboard';
  import { formatSigned } from '$lib/format';
  import { diffDays, formatDate } from '$lib/metrics/dates';
  import { resolveMetrics } from '$lib/metrics/resolve';
  import { band } from '$lib/metrics/score';
  import type { Day, Pillar, ResolvedMetric, Settings, Value } from '$lib/metrics/types';
  import { scoreAnnouncement, scoreHeader, scoreTone, weakestLink } from '$lib/today';
  import AreaChart from './AreaChart.svelte';
  import Banner from './Banner.svelte';
  import MetricTile from './MetricTile.svelte';
  import Ring from './Ring.svelte';
  import Sparkline from './Sparkline.svelte';

  interface Props {
    /** The logical date being viewed. */
    date: string;
    day: Day | null;
    /** History ending at the viewed day, oldest first. */
    days: readonly Day[];
    settings: Settings;
    ready: boolean;
    /** The day's one line, for the `learned` tile (D12). */
    note: string;
    /** 04-ux.md §1: a past day is correctable for 30 days, then cells go off. */
    readOnly: boolean;
    /** `local only`, `demo data`, `sample data` — the marker's last word. */
    marker: string;
    demo?: boolean;
    fingerprint?: string;
    demoDays?: number;
    /** A line above the board, when something needs saying. */
    banner?: string | null;
    onwrite: (metric: ResolvedMetric, value: Value) => void;
    onnote: (note: string) => void;
  }

  let {
    date,
    day,
    days,
    settings,
    ready,
    note,
    readOnly,
    marker,
    demo = false,
    fingerprint = '',
    demoDays = 0,
    banner = null,
    onwrite,
    onnote
  }: Props = $props();

  /* ─── The day's context ──────────────────────────────────────────────────── */

  const metrics = $derived(resolveMetrics(settings));
  const history = $derived(days.filter((candidate) => !date || candidate.date <= date));

  const options = $derived<DashboardOptions>({ day, days: history, metrics, settings });

  const model = $derived(dashboard(options));
  const hero = $derived(scoreHeader(options));

  const tone = $derived(hero.day === null ? 'muted' : scoreTone(hero.day, hero.recent));
  const bandWord = $derived(hero.day === null ? '' : band(hero.day));
  const delta = $derived(
    hero.day !== null && hero.sevenDay !== null ? hero.day - hero.sevenDay : null
  );
  const link = $derived(weakestLink(options));

  const dayNumber = $derived(
    history.length > 0 && date ? diffDays(history[0]!.date, date) + 1 : 0
  );

  /* ─── The frozen panel order (D18) ───────────────────────────────────────── */

  let order = $state<Pillar[] | null>(null);
  let orderKey = '';

  $effect(() => {
    const key = ready ? date : '';
    if (!key || key === orderKey) return;
    orderKey = key;
    order = untrack(() => panelOrder(options));
  });

  const panels = $derived.by(() => {
    const frozen = order;
    if (!frozen) return model.panels;
    return frozen.flatMap((pillar) => {
      const panel = model.panels.find((candidate) => candidate.pillar === pillar);
      return panel ? [panel] : [];
    });
  });

  /* ─── Presentation helpers ───────────────────────────────────────────────── */

  function panelTone(score: number | null): string {
    return tileTone(score) ?? 'muted';
  }

  /** The route owns the 30-day rule (04-ux.md §1); the view obeys it. */
  const editable = $derived(!readOnly);
</script>

<svelte:head>
  <title>north — dashboard</title>
</svelte:head>

{#if banner}
  <Banner message={banner} />
{/if}

<div class="shell wide page">
  <div class="date-line">
    <span class="date">{ready && date ? formatDate(date) : 'Today'}</span>
    <span class="meta" data-testid="mode-marker">
      {#if dayNumber > 0}<span class="num">day {dayNumber}</span> · {/if}
      {#if day?.restDay === true}rest day · {/if}
      <span data-testid="logical-date">{date || '—'}</span>
      · {marker}
      <span hidden data-testid="demo-fingerprint">{fingerprint}</span>
      <span hidden data-testid="demo-days">{demo ? demoDays : 0}</span>
    </span>
  </div>

  <section class="hero fade-in" aria-labelledby="hero-heading">
    <h2 class="visually-hidden" id="hero-heading">Today</h2>

    <Ring value={hero.day} word={bandWord || null} tone={tone} label="today's score" />

    <div class="hero-chart">
      <AreaChart points={hero.sparkline} label="30-day score" />
      <div class="chart-foot">
        <span class="meta">30 days</span>
        <span class="foot-right">
          {#if hero.day === null}
            <span class="meta" data-testid="hero-note">not enough logged yet for a score</span>
          {/if}
          {#if readOnly}
            <span class="meta">A past day — cells are off, the figures are still here.</span>
          {:else if model.open.length === 0}
            <span class="meta" data-testid="to-log">All {model.total} taps logged today.</span>
          {:else}
            <span class="meta to-log" data-testid="to-log"
              >{model.open.length} of {model.total} taps left today.</span
            >
          {/if}
        </span>
      </div>
    </div>

    <dl class="hero-kpis">
      <div class="hero-kpi">
        <dt class="section-label">7-day</dt>
        <dd class="num">{hero.sevenDay === null ? '—' : Math.round(hero.sevenDay)}</dd>
      </div>
      <div class="hero-kpi">
        <dt class="section-label">streak</dt>
        <dd class="num">{hero.streak}</dd>
      </div>
      <div class="hero-kpi">
        <dt class="section-label">vs 7-day</dt>
        <dd class="num">{delta === null ? '—' : formatSigned(delta)}</dd>
      </div>
    </dl>

    <p class="visually-hidden" aria-live="polite">{scoreAnnouncement(hero)}</p>
  </section>

  {#if link}
    <p class="next" data-testid="next">
      <span class="next-head"
        >{link.pillarLabel} · <span class="num">{Math.round(link.score)}</span></span
      ><span class="meta"> — {link.label}: {link.lever}</span>
    </p>
  {/if}

  <div class="board">
    {#each panels as panel (panel.pillar)}
      <section
        class="band"
        data-panel={panel.pillar}
        aria-labelledby={`panel-${panel.pillar}`}
        style="--pillar: var(--pillar-{panel.pillar})"
      >
        <header class="band-head">
          <h2 class="band-label" id={`panel-${panel.pillar}`}>{panel.label}</h2>
          <span class="band-score num tone-{panelTone(panel.score)}" data-panel-score={panel.pillar}
            >{panel.score === null ? '—' : Math.round(panel.score)}</span
          >
          {#if panel.score !== null}
            <span class="band-word">{band(panel.score)}</span>
          {/if}
          <span class="band-spark">
            <Sparkline points={panel.spark} label={`${panel.label} score, 30 days`} />
          </span>
          {#if panel.daily}
            <span class="band-n meta">{panel.n} of 28 days with enough logged</span>
          {/if}
        </header>

        <ul class="tiles">
          {#each panel.rows.flat() as row (row.metric.id)}
            <MetricTile
              {row}
              pillar={panel.pillar}
              readOnly={!editable}
              {note}
              {onwrite}
              {onnote}
            />
          {/each}
        </ul>
      </section>
    {/each}
  </div>

  <footer class="footer">
    <span class="meta">north · local-first · no server state, no accounts, no analytics</span>
  </footer>
</div>

<style>
  .page {
    padding-top: var(--s-4);
    padding-bottom: var(--s-10);
  }

  .date-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-4);
    margin-bottom: var(--s-4);
  }

  .date {
    font-size: var(--fs-13);
    color: var(--ink-muted);
  }

  /* ── Hero ──────────────────────────────────────────────────────────────── */

  .hero {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--s-3) var(--s-8);
    padding-bottom: var(--s-4);
    border-bottom: var(--bw-hair) solid var(--rule-strong);
  }

  .hero-chart {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    min-width: 0;
  }

  .chart-foot {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-4);
  }

  .foot-right {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: flex-end;
    gap: var(--s-2);
    text-align: right;
  }

  .hero-kpis {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    min-width: 132px;
  }

  .hero-kpi {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
  }

  .hero-kpi dd {
    font-size: var(--fs-20);
    line-height: var(--lh-tight);
    color: var(--ink);
  }

  .to-log {
    color: var(--ink);
  }

  .next {
    margin-top: var(--s-3);
    font-size: var(--fs-13);
    line-height: var(--lh-body);
  }

  .next-head {
    color: var(--ink);
  }

  /* ── The board ─────────────────────────────────────────────────────────── */

  .board {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    margin-top: var(--s-4);
  }

  .band {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    min-width: 0;
  }

  .band-head {
    display: flex;
    align-items: baseline;
    gap: var(--s-3);
    min-width: 0;
    padding-bottom: var(--s-1);
    border-bottom: var(--bw-hair) solid var(--rule);
  }

  .band-label {
    flex: 0 0 auto;
    border-left: 3px solid var(--pillar, var(--rule-strong));
    padding-left: var(--s-2);
    font-size: var(--fs-11);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--ls-label);
    /* The band's own hue, so the four categories read as four colours on the
       page — the one place V2.1's palette is allowed to carry meaning alone. */
    color: var(--pillar, var(--ink));
  }

  .band-score {
    flex: 0 0 auto;
    font-size: var(--fs-20);
    line-height: var(--lh-tight);
  }

  .tone-accent {
    color: var(--accent);
  }

  .tone-pillar {
    color: var(--pillar, var(--accent));
  }

  .tone-warn {
    color: var(--warn);
  }

  .tone-muted {
    color: var(--ink-muted);
  }

  .band-word {
    flex: 0 0 auto;
    font-size: var(--fs-11);
    color: var(--ink-muted);
  }

  .band-spark {
    flex: 0 1 var(--spark-band-w);
    align-self: center;
    min-width: 0;
    --spark-w: 100%;
    --spark: var(--pillar, var(--accent));
  }

  .band-n {
    flex: 0 0 auto;
    margin-left: auto;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: var(--tile-gap);
    min-width: 0;
  }

  .footer {
    margin-top: var(--s-8);
    padding-top: var(--s-4);
    border-top: var(--bw-hair) solid var(--rule);
  }

  /* ── Narrow: the hero stacks, the tiles go two and one up ───────────────
     `--cols` halves at each step and every tile is re-spanned explicitly,
     since a span that is right at 1400 px is absurd at 700 px. */

  @media (max-width: 1119px) {
    .board {
      --cols: 6;
    }

    .board :global(.tile) {
      grid-column: span 3;
    }

    .board :global(.tile[data-span='4']),
    .board :global(.tile[data-span='5']),
    .board :global(.tile[data-span='6']) {
      grid-column: span 6;
    }
  }

  @media (max-width: 839px) {
    .hero {
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--s-4) var(--s-6);
    }

    .hero-kpis {
      grid-column: 1 / -1;
      flex-direction: row;
      justify-content: flex-start;
      gap: var(--s-8);
    }
  }

  @media (max-width: 719px) {
    .board {
      --cols: 2;
    }

    .board :global(.tile),
    .board :global(.tile[data-span='4']),
    .board :global(.tile[data-span='5']),
    .board :global(.tile[data-span='6']) {
      grid-column: span 2;
    }
  }

  @media (max-width: 599px) {
    .hero {
      grid-template-columns: minmax(0, 1fr);
    }

    /* Three figures across, the word under each: they do not wrap mid-label. */
    .hero-kpis {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--s-3);
    }

    .hero-kpi {
      flex-direction: column-reverse;
      align-items: flex-start;
      gap: 0;
    }

    .hero-kpi dt {
      white-space: nowrap;
    }

    .band-head {
      flex-wrap: wrap;
    }

    /* The band's 30-day line is the least of it at this width: the tiles below
       are the same history, in the same order, one column. */
    .band-spark {
      display: none;
    }

    .band-n {
      margin-left: 0;
    }

    .date-line {
      flex-direction: column;
      gap: var(--s-1);
    }
  }

  @media (max-width: 479px) {
    .board {
      --cols: 1;
      --tile-pad: var(--s-3);
    }

    .board :global(.tile),
    .board :global(.tile[data-span='4']),
    .board :global(.tile[data-span='5']),
    .board :global(.tile[data-span='6']) {
      grid-column: span 1;
    }
  }
</style>
