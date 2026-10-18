<script lang="ts">
  /* `/week` — the Sunday review (04-ux.md §5). The week in progress, this week
     against last week, the pillar table and the seven day cells. */
  import { resolve } from '$app/paths';
  import { formatSigned, formatValue } from '$lib/format';
  import { addDays, formatDate, formatDateRange, startOfWeek } from '$lib/metrics/dates';
  import { resolveMetrics } from '$lib/metrics/resolve';
  import { session } from '$lib/store/session.svelte';
  import { scoreTone } from '$lib/today';
  import { weekModel, type WeeklyLine } from '$lib/week';
  import SectionLabel from '$lib/ui/SectionLabel.svelte';

  const metrics = $derived(resolveMetrics(session.settings));

  /* Any date in the shown week; null means "the current week". */
  let anchor = $state<string | null>(null);
  const anchorDate = $derived(anchor ?? session.today);

  const model = $derived(
    session.ready && anchorDate
      ? weekModel({
          anchor: anchorDate,
          today: session.today,
          days: session.days,
          metrics,
          settings: session.settings
        })
      : null
  );

  const currentWeek = $derived(
    session.today ? startOfWeek(session.today, session.settings.weekStartsOn) : ''
  );
  const nextWeek = $derived(model ? addDays(model.start, 7) : '');
  const canGoForward = $derived(nextWeek !== '' && nextWeek <= currentWeek);

  const tone = $derived(model && model.score !== null ? scoreTone(model.score, []) : 'muted');

  function shiftWeek(direction: 1 | -1): void {
    if (!model) return;
    anchor = addDays(model.start, direction * 7);
  }

  function dayHref(date: string): `/?${string}` {
    return session.demo ? `/?d=${date}&demo=1` : `/?d=${date}`;
  }

  /** A weekly line's figure: counters read `2 of 2`, a rate reads `−0.42 %/wk`. */
  function lineText(line: WeeklyLine): string {
    if (line.value === null) return '—';
    if (line.dots) return `${line.dots.filled} of ${line.dots.total}`;
    const decimals = line.metric.id === 'weight_trend' ? 2 : line.metric.decimals;
    return formatValue(line.value, line.metric.unit, decimals);
  }

  function dayScoreText(score: number | null): string {
    return score === null ? 'no score' : String(Math.round(score));
  }
</script>

<svelte:head>
  <title>north — week</title>
</svelte:head>

<h1 class="visually-hidden">Week</h1>

{#if model}
  <div class="shell page">
    <div class="week-head">
      <div class="week-nav">
        <button
          class="step"
          type="button"
          aria-label="Previous week"
          onclick={() => shiftWeek(-1)}>←</button
        >
        <span class="range">{formatDateRange(model.start, model.end)}</span>
        <button
          class="step"
          type="button"
          aria-label="Next week"
          disabled={!canGoForward}
          onclick={() => shiftWeek(1)}>→</button
        >
      </div>
      <span class="meta compare" data-testid="week-compare">
        vs last week
        <span class="num"
          >{model.delta === null ? '—' : formatSigned(model.delta)}</span
        >
      </span>
    </div>

    <p class="week-score">
      <span class="figure num tone-{tone}" data-testid="week-score"
        >{model.score === null ? '—' : Math.round(model.score)}</span
      >
      <span class="caption">
        <span class="meta">the week so far</span>
        <span class="meta">{model.loggedDays} logged days</span>
      </span>
    </p>

    <section class="block" aria-labelledby="weekly">
      <SectionLabel id="weekly" label="Weekly" count={`${model.weekly.length} metrics`} />

      <ul class="weekly">
        {#each model.weekly as line (line.metric.id)}
          <li class="weekly-row" data-weekly={line.metric.id}>
            <span class="label">{line.metric.label}</span>
            <span class="figure-line">
              {#if line.dots}
                <span class="dots" aria-hidden="true"
                  ><span class="filled">{'●'.repeat(line.dots.filled)}</span
                  >{'○'.repeat(line.dots.total - line.dots.filled)}</span
                >
              {/if}
              <span class="num value">{lineText(line)}</span>
              <span class="status" class:behind={line.status === 'behind'}>{line.status}</span>
              {#if line.extra > 0}
                <span class="meta">+{formatValue(line.extra, line.metric.unit, 0)}</span>
              {/if}
            </span>
          </li>
        {/each}
      </ul>
    </section>

    <section class="block" aria-labelledby="pillars">
      <SectionLabel id="pillars" label="Pillars" count="this week and last" />

      <table class="pillars">
        <caption class="visually-hidden">Pillar scores, this week and last week</caption>
        <thead>
          <tr>
            <th scope="col"><span class="visually-hidden">Pillar</span></th>
            <th scope="col" class="meta">7-day</th>
            <th scope="col" class="meta">prev</th>
            <th scope="col" class="meta">change</th>
          </tr>
        </thead>
        <tbody>
          {#each model.pillars as row (row.pillar)}
            <tr data-pillar={row.pillar}>
              <th scope="row">{row.label}</th>
              <td class="num">{row.score === null ? '—' : Math.round(row.score)}</td>
              <td class="num muted">{row.previous === null ? '—' : Math.round(row.previous)}</td>
              <td class="num delta">{row.delta === null ? '—' : formatSigned(row.delta)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="block" aria-labelledby="days">
      <SectionLabel
        id="days"
        label="Days"
        count={`${model.loggedDays} of 7 logged`}
      />

      <ol class="days">
        {#each model.days as cell (cell.date)}
          <li>
            {#if cell.future}
              <div class="day future" aria-disabled="true">
                <span class="dow" aria-hidden="true">{cell.weekday}</span>
                <span class="num day-score">—</span>
                <span class="bar" aria-hidden="true"></span>
              </div>
            {:else}
              <a
                class="day"
                href={resolve(dayHref(cell.date))}
                aria-current={cell.today ? 'date' : undefined}
                aria-label={`${formatDate(cell.date, 'long')}, ${dayScoreText(cell.score)}`}
                data-day={cell.date}
              >
                <span class="dow" aria-hidden="true">{cell.weekday}</span>
                <span class="num day-score" aria-hidden="true"
                  >{cell.score === null ? '—' : Math.round(cell.score)}</span
                >
                <span
                  class="bar"
                  aria-hidden="true"
                  style:opacity={cell.fill === null ? 0 : Math.max(0.12, cell.fill)}
                ></span>
              </a>
            {/if}
          </li>
        {/each}
      </ol>
    </section>

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

  .week-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    flex-wrap: wrap;
  }

  .week-nav {
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }

  .step {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--tap-min);
    min-height: var(--tap-min);
    font-size: var(--fs-16);
    color: var(--ink);
    transition: color var(--t-fast) var(--ease);
  }

  .step:hover:not(:disabled) {
    color: var(--accent);
  }

  .step:disabled {
    color: var(--ink-faint);
    cursor: default;
  }

  .range {
    font-size: var(--fs-14);
  }

  .compare {
    display: inline-flex;
    align-items: baseline;
    gap: var(--s-1);
  }

  .week-score {
    display: flex;
    align-items: baseline;
    gap: var(--s-3);
    margin-top: var(--s-4);
  }

  .figure {
    font-family: var(--font-figures);
    font-variant-numeric: tabular-nums;
    font-size: var(--fs-56);
    line-height: var(--lh-tight);
    color: var(--ink-muted);
  }

  .tone-accent {
    color: var(--accent);
  }

  .tone-ink {
    color: var(--ink);
  }

  .tone-warn {
    color: var(--warn);
  }

  .tone-bad {
    color: var(--bad);
  }

  .tone-muted {
    color: var(--ink-muted);
  }

  .caption {
    display: flex;
    flex-direction: column;
  }

  .block {
    border-top: var(--bw-hair) solid var(--rule);
    padding-top: var(--s-5);
    margin-top: var(--s-6);
  }

  .weekly {
    display: grid;
    margin-top: var(--s-2);
  }

  .weekly-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    min-height: var(--row-h);
    border-bottom: var(--bw-hair) solid var(--rule);
  }

  .label {
    font-size: var(--fs-14);
    min-width: 0;
  }

  .figure-line {
    display: inline-flex;
    align-items: baseline;
    gap: var(--s-2);
    white-space: nowrap;
  }

  .dots {
    font-size: var(--fs-11);
    color: var(--rule-strong);
    letter-spacing: 0.1em;
  }

  .dots .filled {
    color: var(--accent);
  }

  .value {
    font-size: var(--fs-14);
  }

  .status {
    font-size: var(--fs-11);
    color: var(--ink-muted);
    text-transform: lowercase;
  }

  .status.behind {
    color: var(--ink);
  }

  .pillars {
    width: 100%;
    border-collapse: collapse;
    margin-top: var(--s-2);
  }

  .pillars th,
  .pillars td {
    padding: var(--s-2) 0;
    border-bottom: var(--bw-hair) solid var(--rule);
    text-align: right;
    font-weight: 400;
  }

  .pillars thead th {
    font-size: var(--fs-11);
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: var(--ls-label);
    padding-top: 0;
  }

  .pillars tbody th[scope='row'] {
    text-align: left;
    font-size: var(--fs-14);
  }

  .pillars td {
    font-size: var(--fs-14);
    width: 4.5em;
  }

  .muted {
    color: var(--ink-muted);
  }

  .delta {
    color: var(--ink);
  }

  .days {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--s-2);
    margin-top: var(--s-3);
  }

  .day {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: var(--tap-min);
    padding: var(--s-1) 0;
    color: var(--ink);
    text-decoration: none;
    border-bottom: var(--bw-hair) solid var(--rule);
  }

  .day:hover .dow {
    color: var(--ink);
  }

  .day[aria-current='date'] .dow {
    color: var(--ink);
  }

  .day[aria-current='date'] {
    border-bottom-color: var(--ink);
  }

  .future {
    color: var(--ink-faint);
    cursor: default;
  }

  .dow {
    font-size: var(--fs-11);
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: var(--ls-label);
  }

  .day-score {
    font-size: var(--fs-20);
    line-height: var(--lh-tight);
  }

  .bar {
    display: block;
    height: var(--s-1);
    background: var(--accent);
    transform-origin: left;
  }

  .footer {
    margin-top: var(--s-12);
    padding-top: var(--s-4);
    border-top: var(--bw-hair) solid var(--rule);
  }

  /* 7 × 44 px cells plus 6 × 8 px gaps needs 356 px of content: below a 396 px
     viewport the grid cannot hold seven compliant targets, so it wraps to 4. */
  @media (max-width: 395px) {
    .days {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .week-head {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--s-1);
    }
  }
</style>
