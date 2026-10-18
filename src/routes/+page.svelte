<script lang="ts">
  /* `/` — the v2 dashboard (docs/V2.md §6). The v1 list lives at `/log`; this
     screen is read-first: the hero carries the day's composite over 30 days, and
     every panel is one part of life with its own chart. The nine things you log
     by hand are still one tap each, right where you read them.

     The panel order is decided on the 28-day figure and frozen once per visit
     (D18): nothing re-orders under your finger while you are logging. */
  import { untrack } from 'svelte';
  import {
    dashboard,
    panelOrder,
    type DashboardOptions,
    type PanelMetric
  } from '$lib/dashboard';
  import { formatSigned, formatValue } from '$lib/format';
  import { addDays, diffDays, formatDate, startOfWeek } from '$lib/metrics/dates';
  import { deviceGaps, weeklyValues } from '$lib/metrics/derived';
  import { resolveMetrics } from '$lib/metrics/resolve';
  import { band } from '$lib/metrics/score';
  import type { Pillar, ResolvedMetric, Value } from '$lib/metrics/types';
  import { demoFingerprint } from '$lib/store/demo';
  import { session, writeValue } from '$lib/store/session.svelte';
  import {
    canEditDay,
    scoreAnnouncement,
    scoreHeader,
    scoreTone,
    weakestLink
  } from '$lib/today';
  import AreaChart from '$lib/ui/AreaChart.svelte';
  import Banner from '$lib/ui/Banner.svelte';
  import Bars from '$lib/ui/Bars.svelte';
  import Bins from '$lib/ui/Bins.svelte';
  import ChoiceRow from '$lib/ui/ChoiceRow.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Sparkline from '$lib/ui/Sparkline.svelte';
  import TriState from '$lib/ui/TriState.svelte';
  import { showToast } from '$lib/ui/toast.svelte';

  /* ─── The day's context ──────────────────────────────────────────────────── */

  const metrics = $derived(resolveMetrics(session.settings));
  const history = $derived(
    session.days.filter((day) => !session.date || day.date <= session.date)
  );

  const weekDays = $derived.by(() => {
    if (!session.date) return [];
    const start = startOfWeek(session.date, session.settings.weekStartsOn);
    const end = addDays(start, 6);
    return history.filter((day) => day.date >= start && day.date <= end);
  });

  const weekly = $derived(weeklyValues({ week: weekDays, history }));

  const options = $derived<DashboardOptions>({
    day: session.day,
    days: history,
    metrics,
    settings: session.settings,
    weekly
  });

  const model = $derived(dashboard(options));
  const hero = $derived(scoreHeader(options));

  const tone = $derived(hero.day === null ? 'muted' : scoreTone(hero.day, hero.recent));
  const bandWord = $derived(hero.day === null ? null : band(hero.day));
  const delta = $derived(
    hero.day !== null && hero.sevenDay !== null ? hero.day - hero.sevenDay : null
  );
  const link = $derived(weakestLink(options));

  const gaps = $derived(session.today ? deviceGaps(session.days, session.today) : []);
  const gapDays = $derived(gaps.reduce((worst, gap) => Math.max(worst, gap.days), 0));

  /* 04-ux.md §1: a past day can be corrected for 30 days, then it is read-only. */
  const readOnly = $derived(session.ready && !canEditDay(session.date, session.today));

  const dayNumber = $derived(
    history.length > 0 && session.date ? diffDays(history[0]!.date, session.date) + 1 : 0
  );
  const fingerprint = $derived(session.demo ? demoFingerprint(session.days) : '');

  /* ─── The frozen panel order (D18) ───────────────────────────────────────── */

  let order = $state<Pillar[] | null>(null);
  let orderKey = '';

  $effect(() => {
    const key = session.ready ? session.date : '';
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

  /* ─── Writing ────────────────────────────────────────────────────────────── */

  function write(metric: ResolvedMetric, value: Value): void {
    if (readOnly) return;
    void writeValue(metric.id, value);
    showToast(
      value === null
        ? `${metric.label} cleared`
        : `${metric.label} ${formatValue(value, metric.unit, metric.decimals)}`
    );
  }

  /* ─── Presentation helpers ───────────────────────────────────────────────── */

  /** A bare count is meaningless, so the unit rides with the label; bins label themselves. */
  function unitOf(metric: ResolvedMetric): string {
    return metric.bins?.length ? '' : metric.unit;
  }

  function valueText(row: PanelMetric): string {
    const value = row.shown;
    if (value === null) return '—';
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    return formatValue(value, row.metric.unit, row.metric.decimals);
  }

  function panelTone(score: number | null): string {
    return score === null ? 'muted' : scoreTone(score, []);
  }
</script>

<svelte:head>
  <title>north — dashboard</title>
</svelte:head>

{#if session.ready && gapDays >= 3}
  <Banner message={`Watch data missing for ${gapDays} days. Scores are less reliable.`} />
{/if}

<div class="shell wide page">
  <div class="date-line">
    <span class="date">{session.ready && session.date ? formatDate(session.date) : 'Today'}</span>
    <span class="meta" data-testid="mode-marker">
      {#if dayNumber > 0}<span class="num">day {dayNumber}</span> · {/if}
      {#if session.day?.restDay === true}rest day · {/if}
      <span data-testid="logical-date">{session.date || '—'}</span>
      · {session.demo ? 'demo data' : 'local only'}
      <span hidden data-testid="demo-fingerprint">{fingerprint}</span>
      <span hidden data-testid="demo-days">{session.demo ? session.days.length : 0}</span>
    </span>
  </div>

  {#if readOnly}
    <p class="meta readonly" data-testid="read-only">
      Read-only — past days can be corrected for 30 days.
    </p>
  {/if}

  <section class="hero fade-in" aria-labelledby="hero-heading">
    <h2 class="visually-hidden" id="hero-heading">Today's score</h2>

    <div class="hero-main">
      <div class="hero-figure">
        <span class="hero-value num tone-{tone}" data-hero-score
          >{#if hero.day === null}<span class="placeholder">—</span>{:else}{Math.round(
              hero.day
            )}{/if}</span
        >
        <span class="meta">today</span>
      </div>

      <dl class="hero-side">
        <div class="hero-row">
          <dt class="meta">7-day</dt>
          <dd class="num">{hero.sevenDay === null ? '—' : Math.round(hero.sevenDay)}</dd>
        </div>
        <div class="hero-row">
          <dt class="meta">streak</dt>
          <dd class="num">{hero.streak}</dd>
        </div>
        {#if delta !== null}
          <div class="hero-row">
            <dt class="meta">vs 7-day</dt>
            <dd class="num">{formatSigned(delta)}</dd>
          </div>
        {/if}
      </dl>
    </div>

    <div class="hero-chart">
      <AreaChart points={hero.sparkline} label="30-day score" />
      <div class="chart-foot">
        <span class="meta">30 days</span>
        {#if bandWord}<span class="meta">{bandWord}</span>{/if}
      </div>
    </div>

    <p class="visually-hidden" aria-live="polite">{scoreAnnouncement(hero)}</p>
  </section>

  <p class="status-line">
    <span class="meta">Logged {hero.logged} of {hero.total} today.</span>
    {#if !readOnly && model.open.length > 0}
      <span class="meta to-log" data-testid="to-log">· {model.open.length} to log</span>
    {/if}
  </p>

  {#if link}
    <p class="next" data-testid="next">
      <span class="next-head"
        >{link.pillarLabel} · <span class="num">{Math.round(link.score)}</span></span
      ><span class="meta"> — {link.label}: {link.lever}</span>
    </p>
  {/if}

  <div class="panels">
    {#each panels as panel (panel.pillar)}
      <section class="panel" data-panel={panel.pillar} aria-labelledby={`panel-${panel.pillar}`}>
        <header class="panel-head">
          <h2 class="section-label" id={`panel-${panel.pillar}`}>{panel.label}</h2>
          <span class="panel-score num tone-{panelTone(panel.score)}" data-panel-score={panel.pillar}
            >{panel.score === null ? '—' : Math.round(panel.score)}</span
          >
          <Sparkline points={panel.spark} label={`${panel.label} score`} />
        </header>

        <ul class="panel-rows">
          {#each panel.metrics as row (row.metric.id)}
            <li class="prow" data-row={row.metric.id}>
              <span class="prow-label" id={`row-${row.metric.id}`} title={row.metric.help}
                >{row.metric.label}
                {#if unitOf(row.metric)}<span class="unit">{unitOf(row.metric)}</span>{/if}</span
              >

              {#if row.control !== null && !readOnly}
                <div class="prow-control">
                  {#if row.control === 'triState'}
                    <TriState
                      metric={row.metric}
                      legendId={`row-${row.metric.id}`}
                      value={row.value.value}
                      onpick={(value) => write(row.metric, value)}
                    />
                  {:else if row.control === 'choice'}
                    <ChoiceRow
                      metric={row.metric}
                      legendId={`row-${row.metric.id}`}
                      value={row.value.value}
                      onpick={(value) => write(row.metric, value)}
                    />
                  {:else if row.control === 'segmented'}
                    <Segmented
                      metric={row.metric}
                      legendId={`row-${row.metric.id}`}
                      value={row.value.value}
                      onpick={(value) => write(row.metric, value)}
                    />
                  {:else if row.control === 'bins'}
                    <Bins
                      metric={row.metric}
                      legendId={`row-${row.metric.id}`}
                      value={row.value.value}
                      onpick={(value) => write(row.metric, value)}
                    />
                  {/if}
                </div>
              {:else}
                <span
                  class="prow-value num"
                  class:muted={row.shown === null}
                  title={row.shown === null ? 'nothing yet' : row.metric.help}
                  data-value>{valueText(row)}</span
                >
                {#if row.control === null && row.chart.kind === 'bars'}
                  <div class="prow-chart" data-chart={row.metric.id}>
                    <Bars
                      chart={row.chart}
                      label={`${row.metric.label}, ${row.chart.caption}`}
                    />
                  </div>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>

        {#if panel.daily}
          <p class="panel-foot meta">
            {panel.n} of 28 days scored{panel.score === null ? ' · no figure yet' : ''}
          </p>
        {/if}
      </section>
    {/each}
  </div>

  <footer class="footer">
    <span class="meta">north · local-first · no server state, no accounts, no analytics</span>
  </footer>
</div>

<style>
  .page {
    padding-top: var(--s-6);
    padding-bottom: var(--s-16);
  }

  .date-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-4);
    margin-bottom: var(--s-5);
  }

  .date {
    font-size: var(--fs-13);
    color: var(--ink-muted);
  }

  .readonly {
    margin-bottom: var(--s-4);
  }

  /* ── Hero ──────────────────────────────────────────────────────────────── */

  .hero {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--s-10);
    padding-bottom: var(--s-6);
    border-bottom: var(--bw-hair) solid var(--rule);
  }

  .hero-main {
    display: flex;
    align-items: flex-end;
    gap: var(--s-6);
  }

  .hero-figure {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }

  .hero-value {
    font-size: var(--fs-56);
    font-variant-numeric: tabular-nums;
    line-height: var(--lh-tight);
  }

  /* No score yet: a 56 px em-dash reads as a redaction bar, so the placeholder
     is drawn smaller. The box keeps its 56 px line height, so nothing shifts. */
  .placeholder {
    font-size: var(--fs-24);
    color: var(--ink-muted);
  }

  .tone-accent {
    color: var(--accent);
  }

  .tone-ink {
    color: var(--ink);
  }

  .tone-muted {
    color: var(--ink-muted);
  }

  .tone-warn {
    color: var(--warn);
  }

  .tone-bad {
    color: var(--bad);
  }

  .hero-side {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    padding-bottom: var(--s-2);
  }

  .hero-row {
    display: flex;
    align-items: baseline;
    gap: var(--s-2);
  }

  .hero-row dt {
    min-width: 58px;
  }

  .hero-row dd {
    font-size: var(--fs-14);
    color: var(--ink);
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

  .status-line {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    margin-top: var(--s-3);
  }

  .to-log {
    color: var(--ink);
  }

  .next {
    margin-top: var(--s-4);
    font-size: var(--fs-13);
    line-height: var(--lh-body);
  }

  .next-head {
    color: var(--ink);
  }

  /* ── Panels ────────────────────────────────────────────────────────────── */

  .panels {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-8) var(--s-10);
    margin-top: var(--s-8);
  }

  .panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-top: var(--bw-hair) solid var(--rule-strong);
    padding-top: var(--s-3);
  }

  .panel-head {
    display: flex;
    align-items: baseline;
    gap: var(--s-3);
    margin-bottom: var(--s-2);
  }

  .panel-head h2 {
    flex: 1 1 auto;
  }

  .panel-score {
    font-size: var(--fs-32);
    line-height: var(--lh-tight);
  }

  .panel-head :global(.sparkline) {
    align-self: center;
  }

  .panel-rows {
    display: flex;
    flex-direction: column;
  }

  .prow {
    display: flex;
    align-items: center;
    gap: var(--s-1) var(--s-4);
    min-height: var(--row-h);
    padding: var(--s-1) 0;
    border-bottom: var(--bw-hair) solid var(--rule);
  }

  .prow-label {
    flex: 1 1 auto;
    display: flex;
    align-items: baseline;
    gap: var(--s-2);
    min-width: 0;
    font-size: var(--fs-14);
    color: var(--ink);
  }

  .unit {
    font-size: var(--fs-11);
    color: var(--ink-muted);
    white-space: nowrap;
  }

  .prow-value {
    flex: 0 0 auto;
    font-size: var(--fs-14);
    color: var(--ink);
  }

  .prow-value.muted {
    color: var(--ink-faint);
  }

  .prow-control {
    flex: 0 0 auto;
    margin-left: auto;
  }

  .prow-chart {
    flex: 0 0 auto;
  }

  .panel-foot {
    margin-top: var(--s-2);
  }

  .footer {
    margin-top: var(--s-12);
    padding-top: var(--s-4);
    border-top: var(--bw-hair) solid var(--rule);
  }

  /* Below the panel grid: one column, and a row's control or chart takes the
     full width under its label rather than being squeezed beside it. */
  @media (max-width: 839px) {
    .panels {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--s-8);
    }
  }

  @media (max-width: 719px) {
    .hero {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--s-5);
      align-items: start;
    }
  }

  @media (max-width: 479px) {
    .date-line {
      flex-direction: column;
      gap: var(--s-1);
    }

    .hero-main {
      flex-wrap: wrap;
      gap: var(--s-4);
    }

    .prow {
      flex-wrap: wrap;
    }

    .prow-control,
    .prow-chart {
      flex: 1 1 100%;
      margin-left: 0;
    }

    .prow-chart {
      --bars-w: 100%;
    }
  }
</style>
