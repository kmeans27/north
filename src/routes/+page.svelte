<script lang="ts">
  /* `/` — Today (04-ux.md §2). The row order is frozen once per visit (D18);
     everything inside a row is live, so the header number updates with no
     animation while the list never moves under your finger. */
  import { untrack } from 'svelte';
  import { formatValue } from '$lib/format';
  import type { PeriodValues } from '$lib/metrics/aggregate';
  import { addDays, diffDays, formatDate, startOfWeek } from '$lib/metrics/dates';
  import { deviceGaps, sleepConsistency, weeklyValues } from '$lib/metrics/derived';
  import { resolveMetrics } from '$lib/metrics/resolve';
  import type { MetricId, ResolvedMetric, Source, Value } from '$lib/metrics/types';
  import { provideRowContext, type KeyAction } from '$lib/keyboard';
  import { demoFingerprint } from '$lib/store/demo';
  import { session, setNote, writeValue } from '$lib/store/session.svelte';
  import {
    TODAY_ROW_LIMIT,
    aboveTarget,
    autoValue,
    controlFor,
    optionsOf,
    rowValue,
    scoreHeader,
    scoreTone,
    todayOrder,
    weakestLink,
    type OrderedRows,
    type TodayOptions
  } from '$lib/today';
  import AutoCell from '$lib/ui/AutoCell.svelte';
  import Banner from '$lib/ui/Banner.svelte';
  import Bins from '$lib/ui/Bins.svelte';
  import ChoiceRow from '$lib/ui/ChoiceRow.svelte';
  import NoteField from '$lib/ui/NoteField.svelte';
  import NumberField from '$lib/ui/NumberField.svelte';
  import Row from '$lib/ui/Row.svelte';
  import ScoreHeader from '$lib/ui/ScoreHeader.svelte';
  import SectionLabel from '$lib/ui/SectionLabel.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import TriState from '$lib/ui/TriState.svelte';
  import { showToast } from '$lib/ui/toast.svelte';

  const SOURCE_LABEL: Record<Source, string> = {
    manual: 'you',
    health: 'watch',
    collector: 'this computer',
    derived: 'computed'
  };

  let rowsEl = $state<HTMLElement | null>(null);
  let noteInput = $state<HTMLInputElement | null>(null);
  let focusedId = $state<MetricId | null>(null);
  let sheetFor = $state<MetricId | null>(null);
  let expanded = $state(false);

  /* ─── The day's context ──────────────────────────────────────────────────── */

  const metrics = $derived(resolveMetrics(session.settings));
  const metricById = $derived(new Map(metrics.map((metric) => [metric.id, metric])));
  const history = $derived(session.days.filter((day) => !session.date || day.date <= session.date));

  const weekDays = $derived.by(() => {
    if (!session.date) return [];
    const start = startOfWeek(session.date, session.settings.weekStartsOn);
    const end = addDays(start, 6);
    return history.filter((day) => day.date >= start && day.date <= end);
  });

  const weekly = $derived(weeklyValues({ week: weekDays, history }));

  const derivedValues = $derived.by(() => {
    const out: PeriodValues = {};
    const consistency = sleepConsistency(history);
    if (consistency.value !== null) out.sleep_consistency = consistency.value;
    return out;
  });

  const todayOptions = $derived<TodayOptions>({
    day: session.day,
    days: history,
    metrics,
    settings: session.settings,
    weekly,
    derived: derivedValues
  });

  const header = $derived(scoreHeader(todayOptions));
  const tone = $derived(
    header.day === null ? 'muted' : scoreTone(header.day, header.recent)
  );
  const link = $derived(weakestLink(todayOptions));

  const gaps = $derived(session.today ? deviceGaps(session.days, session.today) : []);
  const gapDays = $derived(gaps.reduce((worst, gap) => Math.max(worst, gap.days), 0));

  const restDay = $derived(session.day?.restDay === true);
  const dayNumber = $derived(history.length > 0 && session.date
    ? diffDays(history[0]!.date, session.date) + 1
    : 0);
  const fingerprint = $derived(session.demo ? demoFingerprint(session.days) : '');

  /* ─── The frozen order (D18) ─────────────────────────────────────────────── */

  let frozen = $state<OrderedRows | null>(null);
  let frozenKey = '';

  $effect(() => {
    const key = session.ready ? session.date : '';
    if (!key || key === frozenKey) return;
    frozenKey = key;
    frozen = untrack(() => todayOrder(todayOptions));
  });

  interface ShownRow {
    metric: ResolvedMetric;
    value: ReturnType<typeof rowValue>;
  }

  const rows = $derived<ShownRow[]>(
    (frozen?.order ?? []).flatMap((id) => {
      const metric = metricById.get(id);
      if (!metric) return [];
      return [{ metric, value: rowValue(session.day, metric, session.settings) }];
    })
  );

  const shownRows = $derived(expanded ? rows : rows.slice(0, TODAY_ROW_LIMIT));
  const hiddenCount = $derived(Math.max(0, rows.length - TODAY_ROW_LIMIT));

  const autoRows = $derived(
    (frozen?.auto ?? []).flatMap((id) => {
      const metric = metricById.get(id);
      if (!metric) return [];
      return [{ metric, value: autoValue(todayOptions, id) }];
    })
  );

  const sheetMetric = $derived(sheetFor ? (metricById.get(sheetFor) ?? null) : null);
  const sheetValue = $derived(
    sheetMetric ? rowValue(session.day, sheetMetric, session.settings) : null
  );

  /* ─── Writing ────────────────────────────────────────────────────────────── */

  function write(metric: ResolvedMetric, value: Value): void {
    void writeValue(metric.id, value);
    showToast(
      value === null
        ? `${metric.label} cleared`
        : `${metric.label} ${formatValue(value, metric.unit, metric.decimals)}`
    );
  }

  function applyNote(note: string): void {
    void setNote(note);
  }

  function historyFor(metric: ResolvedMetric): { date: string; value: Value }[] {
    return history
      .slice(-14)
      .flatMap((day) => {
        const entry = day.values[metric.id];
        const value = entry ? (entry.v ?? null) : null;
        return value === null ? [] : [{ date: day.date, value }];
      })
      .reverse();
  }

  /* ─── Keyboard (04-ux.md §4) ─────────────────────────────────────────────── */

  const focusedMetric = $derived(focusedId ? (metricById.get(focusedId) ?? null) : null);

  function focusTarget(row: HTMLElement): HTMLElement | null {
    return (
      row.querySelector<HTMLElement>('[role="radio"][tabindex="0"]') ??
      row.querySelector<HTMLElement>('button, input')
    );
  }

  function moveFocus(direction: 1 | -1): void {
    const nodes = rowsEl ? [...rowsEl.querySelectorAll<HTMLElement>('[data-row]')] : [];
    if (nodes.length === 0) return;
    const index = nodes.findIndex((node) => node.contains(document.activeElement));
    const next =
      index === -1
        ? direction === 1
          ? 0
          : nodes.length - 1
        : Math.min(nodes.length - 1, Math.max(0, index + direction));
    const target = nodes[next];
    if (!target) return;
    focusTarget(target)?.focus();
  }

  function handleRowAction(action: KeyAction): void {
    if (action.type === 'move') {
      moveFocus(action.direction === 'down' ? 1 : -1);
      return;
    }
    if (action.type === 'editNote') {
      noteInput?.focus();
      return;
    }

    const metric = focusedMetric;
    if (!metric) return;
    const current = rowValue(session.day, metric, session.settings);
    const options = optionsOf(metric);

    switch (action.type) {
      case 'option': {
        const option = options[action.index];
        if (option) write(metric, option.value);
        return;
      }
      case 'clear': {
        if (current.logged) write(metric, null);
        return;
      }
      case 'primary': {
        // Space is "next option", so one key walks a row without the digits.
        if (options.length === 0) return;
        const index = options.findIndex((option) => option.value === current.value);
        const next = options[(index + 1) % options.length];
        if (next) write(metric, next.value);
        return;
      }
      default:
        return;
    }
  }

  function trackFocus(event: FocusEvent): void {
    const row = (event.target as HTMLElement | null)?.closest('[data-row]');
    focusedId = (row?.getAttribute('data-row') as MetricId | null) ?? null;
  }

  function dropFocus(event: FocusEvent): void {
    const container = event.currentTarget as HTMLElement;
    const next = event.relatedTarget as HTMLElement | null;
    if (!next || !container.contains(next)) focusedId = null;
  }

  function canEditNote(): boolean {
    const metric = focusedMetric;
    if (!metric || metric.id !== 'learned') return false;
    return rowValue(session.day, metric, session.settings).value === true;
  }

  $effect(() => {
    provideRowContext({
      state: () => ({
        optionCount: focusedMetric ? optionsOf(focusedMetric).length : 0,
        canEditNote: canEditNote(),
        sheetOpen: sheetFor !== null
      }),
      onAction: handleRowAction
    });
    return () => provideRowContext(null);
  });

  $effect(() => {
    if (sheetFor !== null && !sheetMetric) sheetFor = null;
  });
</script>

<svelte:head>
  <title>north — today</title>
</svelte:head>

{#if session.ready && gapDays >= 3}
  <Banner message={`Watch data missing for ${gapDays} days. Scores are less reliable.`} />
{/if}

<div class="shell page">
  <div class="date-line">
    <span class="date">{session.ready && session.date ? formatDate(session.date) : 'Today'}</span>
    <span class="meta" data-testid="mode-marker">
      {#if dayNumber > 0}<span class="num">day {dayNumber}</span> · {/if}
      {#if restDay}rest day · {/if}
      <span data-testid="logical-date">{session.date || '—'}</span>
      · {session.demo ? 'demo data' : 'local only'}
      <span hidden data-testid="demo-fingerprint">{fingerprint}</span>
      <span hidden data-testid="demo-days">{session.demo ? session.days.length : 0}</span>
    </span>
  </div>

  <ScoreHeader {header} {tone} />

  <section class="block" aria-labelledby="needs-you">
    <SectionLabel
      id="needs-you"
      label="Needs you"
      count={`${frozen?.needsYouCount ?? 0} items`}
    />

    <div class="rows" bind:this={rowsEl} onfocusin={trackFocus} onfocusout={dropFocus}>
      {#each shownRows as row (row.metric.id)}
        <Row metric={row.metric} value={row.value.value} logged={row.value.logged}>
          <div class="control-stack">
            {#if controlFor(row.metric.widget) === 'triState'}
              <TriState
                metric={row.metric}
                legendId={`row-${row.metric.id}`}
                value={row.value.value}
                onpick={(value) => write(row.metric, value)}
              />
            {:else if controlFor(row.metric.widget) === 'choice'}
              <ChoiceRow
                metric={row.metric}
                legendId={`row-${row.metric.id}`}
                value={row.value.value}
                onpick={(value) => write(row.metric, value)}
              />
            {:else if controlFor(row.metric.widget) === 'segmented'}
              <Segmented
                metric={row.metric}
                legendId={`row-${row.metric.id}`}
                value={row.value.value}
                onpick={(value) => write(row.metric, value)}
              />
            {:else if controlFor(row.metric.widget) === 'bins'}
              <Bins
                metric={row.metric}
                legendId={`row-${row.metric.id}`}
                value={row.value.value}
                onpick={(value) => write(row.metric, value)}
              />
            {/if}

            {#if row.metric.id === 'learned' && row.value.value === true}
              <NoteField
                value={session.day?.note ?? ''}
                onchange={applyNote}
                input={(element) => (noteInput = element)}
              />
            {/if}
          </div>
        </Row>
      {/each}
    </div>

    {#if hiddenCount > 0}
      <button
        class="expander"
        type="button"
        aria-expanded={expanded}
        data-testid="expander"
        onclick={() => (expanded = !expanded)}
      >
        {expanded ? 'Show fewer' : `+ ${hiddenCount} more`}
      </button>
    {/if}
  </section>

  <section class="block" aria-labelledby="automatic">
    <SectionLabel id="automatic" label="Automatic" count={`${autoRows.length} values`} />
    {#if autoRows.length === 0}
      <p class="prose">Nothing arrived from a device yet.</p>
    {:else}
      <ul class="strip">
        {#each autoRows as row (row.metric.id)}
          <li>
            <AutoCell
              metric={row.metric}
              value={row.value}
              source={session.day?.values[row.metric.id]?.src ?? 'auto'}
              overridden={session.day?.values[row.metric.id]?.overridden === true}
              onopen={() => (sheetFor = row.metric.id)}
            />
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if link}
    <section class="block" aria-labelledby="weakest-link">
      <SectionLabel id="weakest-link" label="Weakest link" count={`${link.n} days`} />
      <p class="prose">
        <span class="link-head"
          >{link.pillarLabel} · <span class="num">{Math.round(link.score)}</span></span
        >
        — {link.label}: {link.lever}
      </p>
    </section>
  {/if}

  <footer class="footer">
    <span class="meta">north · local-first · no server, no accounts, no analytics</span>
  </footer>
</div>

<Sheet
  open={sheetMetric !== null}
  title={sheetMetric?.label ?? ''}
  onclose={() => (sheetFor = null)}
>
  {#if sheetMetric && sheetValue}
    <p class="meta">source: {SOURCE_LABEL[sheetMetric.source]}</p>
    <p class="meta">
      {sheetValue.score === null ? 'no score' : `${Math.round(sheetValue.score)} of 100`}
      {#if aboveTarget(sheetMetric, sheetValue.value)}
        · {aboveTarget(sheetMetric, sheetValue.value)}
      {/if}
    </p>

    <div class="sheet-control">
      {#if controlFor(sheetMetric.widget) === 'triState'}
        <TriState
          metric={sheetMetric}
          legendId={`sheet-${sheetMetric.id}`}
          value={sheetValue.value}
          onpick={(value) => write(sheetMetric, value)}
        />
      {:else}
        <NumberField
          metric={sheetMetric}
          value={typeof sheetValue.value === 'number' ? sheetValue.value : null}
          note={aboveTarget(sheetMetric, sheetValue.value)}
          onchange={(value) => write(sheetMetric, value)}
        />
      {/if}
    </div>

    <h3 class="section-label history-title">Last 14 days</h3>
    <dl class="history">
      {#each historyFor(sheetMetric) as entry (entry.date)}
        <div class="history-row">
          <dt class="meta">{formatDate(entry.date, 'short')}</dt>
          <dd class="num">{formatValue(entry.value, sheetMetric.unit, sheetMetric.decimals)}</dd>
        </div>
      {:else}
        <div class="history-row"><dt class="meta">nothing yet</dt><dd></dd></div>
      {/each}
    </dl>
  {/if}
</Sheet>

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

  .block {
    border-top: var(--bw-hair) solid var(--rule);
    padding-top: var(--s-5);
    margin-top: var(--s-6);
  }

  .rows {
    /* The one grid the rows subgrid: a shared label track and a shared control
       track, so the cells line up down the column (05-design.md §3). */
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: var(--s-4);
  }

  .control-stack {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--s-1);
  }

  .control-stack :global(.note) {
    min-width: var(--spark-w);
  }

  .expander {
    display: flex;
    align-items: center;
    min-height: var(--tap-min);
    margin-top: var(--s-2);
    font-size: var(--fs-13);
    color: var(--accent);
    text-decoration: underline;
    text-decoration-thickness: var(--bw-hair);
    text-underline-offset: 2px;
  }

  .strip {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }

  .link-head {
    color: var(--ink);
  }

  .footer {
    margin-top: var(--s-12);
    padding-top: var(--s-4);
    border-top: var(--bw-hair) solid var(--rule);
  }

  .sheet-control {
    margin: var(--s-5) 0;
  }

  .history-title {
    margin-bottom: var(--s-2);
  }

  .history {
    display: grid;
    gap: var(--s-1);
  }

  .history-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-4);
    padding: var(--s-1) 0;
    border-bottom: var(--bw-hair) solid var(--rule);
  }

  .history-row dd {
    font-size: var(--fs-13);
  }

  @media (max-width: 379px) {
    .rows {
      grid-template-columns: minmax(0, 1fr);
    }

    .date-line {
      flex-direction: column;
      gap: var(--s-1);
    }

    .control-stack {
      align-items: flex-start;
    }
  }
</style>
