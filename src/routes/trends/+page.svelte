<script lang="ts">
  /* `/trends` — one sparkline row per metric, grouped by pillar, with the five
     insight cards above (04-ux.md §6). Every chart is hand-written SVG; a click
     or an arrow key selects a day and its value moves into the row header. */
  import { formatDate } from '$lib/metrics/dates';
  import { formatValue, plural, pluralUnit } from '$lib/format';
  import { resolveMetrics } from '$lib/metrics/resolve';
  import type { MetricId } from '$lib/metrics/types';
  import { session } from '$lib/store/session.svelte';
  import { displayValue } from '$lib/today';
  import {
    WINDOWS,
    pointAt,
    trendsModel,
    type TrendRow,
    type TrendWindow
  } from '$lib/trends';
  import HeatGrid from '$lib/ui/HeatGrid.svelte';
  import MetricChart from '$lib/ui/MetricChart.svelte';
  import SectionLabel from '$lib/ui/SectionLabel.svelte';

  const metrics = $derived(resolveMetrics(session.settings));
  let span = $state<TrendWindow>(30);
  let selected = $state<Partial<Record<MetricId, string>>>({});

  const model = $derived(
    session.ready && session.today
      ? trendsModel({
          days: session.days,
          today: session.today,
          window: span,
          metrics,
          settings: session.settings
        })
      : null
  );

  function chooseWindow(next: TrendWindow): void {
    if (next === span) return;
    span = next;
    selected = {};
  }

  function select(metricId: MetricId, date: string): void {
    selected = { ...selected, [metricId]: date };
  }

  /** The figure a point stands for: toggles read yes/no, bins keep their label. */
  function figure(row: TrendRow, value: number | null): string {
    if (value === null) return '—';
    return displayValue(row.metric, row.metric.widget === 'toggle' ? value > 0 : value);
  }

  /** The row header: the selected point, or the newest one before any selection. */
  function head(row: TrendRow): { value: string; meta: string } {
    const chosen = pointAt(row.series, selected[row.metric.id] ?? null);
    if (chosen) {
      return { value: figure(row, chosen.value), meta: formatDate(chosen.date, 'short') };
    }
    if (row.latest) {
      return { value: figure(row, row.latest.value), meta: 'latest' };
    }
    return { value: '—', meta: 'no data' };
  }

  function chartLabel(row: TrendRow): string {
    const current = head(row);
    return `${row.metric.label} over ${span} days: ${current.value}, ${current.meta}. Use the arrow keys to read earlier days.`;
  }

  function rateText(row: TrendRow): string {
    if (row.rate.total === 0) return '30-day hit-rate —';
    const percent = Math.round(row.rate.rate * 100);
    const noun = pluralUnit(row.rate.total, row.rate.unit);
    return `30-day hit-rate ${percent} % · ${row.rate.met} of ${row.rate.total} ${noun}`;
  }

  function targetText(row: TrendRow): string {
    const target = row.domain.target;
    if (target === null) return '';
    if (row.metric.score.curve === 'trend') return 'zero line';
    if (row.metric.widget === 'toggle') return `target ${target >= 1 ? 'yes' : 'no'}`;
    return `target ${formatValue(target, row.metric.unit, row.metric.decimals)}`;
  }
</script>

<svelte:head>
  <title>north — trends</title>
</svelte:head>

<h1 class="visually-hidden">Trends</h1>

{#if model}
  <div class="shell page">
    <div class="page-head">
      <div class="windows" role="group" aria-label="Window">
        {#each WINDOWS as value (value)}
          <button
            class="window"
            type="button"
            aria-pressed={span === value}
            data-window={value}
            onclick={() => chooseWindow(value)}>{value} days</button
          >
        {/each}
      </div>
      <span class="meta">{formatDate(model.start, 'short')} – {formatDate(model.end, 'short')}</span>
    </div>

    <section class="block" aria-labelledby="insights">
      <SectionLabel id="insights" label="Insights" count={`${model.insights.length} cards`} />
      <ul class="insights">
        {#each model.insights as card, position (card.rule + card.title + position)}
          <li class="insight" data-rule={card.rule}>
            <h3 class="insight-title">{card.title}</h3>
            <p class="prose">{card.body}</p>
            <p class="meta insight-n" data-insight-n
              >n = {card.n} {pluralUnit(card.n, 'days')}</p
            >
          </li>
        {/each}
      </ul>
    </section>

    {#each model.groups as group (group.pillar)}
      <section class="block" aria-labelledby={`pillar-${group.pillar}`}>
        <SectionLabel
          id={`pillar-${group.pillar}`}
          label={group.label}
          count={`${group.rows.length} ${plural(group.rows.length, 'metric')}`}
        />

        <div class="consistency">
          <HeatGrid points={group.consistency} offset={group.offset} label={group.label} />
          <p class="meta">last 90 days · ink is the pillar score</p>
        </div>

        <ul class="trends">
          {#each group.rows as row (row.metric.id)}
            <li class="trend" data-metric={row.metric.id}>
              <div class="trend-head">
                <span class="trend-label">{row.metric.label}</span>
                <span class="trend-read">
                  <span class="num trend-value" data-trend-value>{head(row).value}</span>
                  <span class="meta" data-trend-date>{head(row).meta}</span>
                </span>
              </div>

              <MetricChart
                series={row.series}
                domain={row.domain}
                selected={selected[row.metric.id] ?? null}
                label={chartLabel(row)}
                onselect={(date) => select(row.metric.id, date)}
              />

              <p class="meta trend-rate" data-trend-rate>
                {rateText(row)}
                {#if targetText(row)}· {targetText(row)}{/if}
              </p>
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    <footer class="footer">
      <span class="meta">north · local-first · no server, no accounts, no analytics</span>
    </footer>
  </div>
{/if}

<style>
  .page {
    padding-top: var(--s-6);
    padding-bottom: var(--s-16);
  }

  .page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    flex-wrap: wrap;
  }

  .windows {
    display: inline-flex;
    border: var(--bw-hair) solid var(--rule-strong);
    border-radius: var(--r-1);
    overflow: hidden;
  }

  .window {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--tap-min);
    min-height: var(--tap-min);
    padding: 0 var(--s-3);
    font-size: var(--fs-13);
    color: var(--ink-muted);
    transition:
      color var(--t-fast) var(--ease),
      background var(--t-fast) var(--ease);
  }

  .window[aria-pressed='true'] {
    background: var(--paper-sunken);
    color: var(--ink);
  }

  .window + .window {
    border-left: var(--bw-hair) solid var(--rule-strong);
  }

  .block {
    border-top: var(--bw-hair) solid var(--rule);
    padding-top: var(--s-5);
    margin-top: var(--s-6);
  }

  .insights {
    display: grid;
  }

  .insight {
    padding: var(--s-3) 0;
    border-bottom: var(--bw-hair) solid var(--rule);
  }

  .insight-title {
    font-size: var(--fs-14);
    font-weight: 500;
    color: var(--ink);
  }

  .insight-n {
    margin-top: var(--s-1);
  }

  .consistency {
    display: flex;
    align-items: flex-start;
    gap: var(--s-4);
    margin-bottom: var(--s-4);
  }

  .trends {
    display: grid;
  }

  .trend {
    display: grid;
    gap: var(--s-1);
    padding: var(--s-2) 0 var(--s-3);
    border-bottom: var(--bw-hair) solid var(--rule);
  }

  .trend-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-4);
  }

  .trend-label {
    font-size: var(--fs-14);
    color: var(--ink);
  }

  .trend-read {
    display: inline-flex;
    align-items: baseline;
    gap: var(--s-2);
    white-space: nowrap;
  }

  .trend-value {
    font-size: var(--fs-14);
    color: var(--ink);
  }

  .trend-rate {
    margin-top: calc(var(--s-1) * -1);
  }

  .footer {
    margin-top: var(--s-12);
    padding-top: var(--s-4);
    border-top: var(--bw-hair) solid var(--rule);
  }
</style>
