<script lang="ts">
  /* `/` — the v2.1 dashboard (docs/V2.1.md §3). All of the screen lives in
     `DashboardView`, which `/preview` shares; this file is only the wiring to
     the store: which day is being viewed, and where a tap goes. */
  import { formatValue } from '$lib/format';
  import { deviceGaps } from '$lib/metrics/derived';
  import type { ResolvedMetric, Value } from '$lib/metrics/types';
  import { demoFingerprint } from '$lib/store/demo';
  import { session, setNote, writeValue } from '$lib/store/session.svelte';
  import { canEditDay } from '$lib/today';
  import DashboardView from '$lib/ui/DashboardView.svelte';
  import { showToast } from '$lib/ui/toast.svelte';

  /* 04-ux.md §1: a past day can be corrected for 30 days, then it is read-only. */
  const readOnly = $derived(session.ready && !canEditDay(session.date, session.today));

  /* A watch that has not synced is worth saying out loud: the scores below it are
     less trustworthy, and no amount of colour makes up for that (04-ux.md §9). */
  const gapDays = $derived(
    session.today
      ? deviceGaps(session.days, session.today).reduce((worst, gap) => Math.max(worst, gap.days), 0)
      : 0
  );
  const banner = $derived(
    session.ready && gapDays >= 3
      ? `Watch data missing for ${gapDays} days. Scores are less reliable.`
      : null
  );

  function write(metric: ResolvedMetric, value: Value): void {
    if (readOnly) return;
    void writeValue(metric.id, value);
    showToast(
      value === null
        ? `${metric.label} cleared`
        : `${metric.label} ${formatValue(value, metric.unit, metric.decimals)}`
    );
  }
</script>

<DashboardView
  date={session.date}
  day={session.day}
  days={session.days}
  settings={session.settings}
  ready={session.ready}
  {readOnly}
  note={session.day?.note ?? ''}
  marker={session.demo ? 'demo data' : 'local only'}
  demo={session.demo}
  fingerprint={session.demo ? demoFingerprint(session.days) : ''}
  demoDays={session.days.length}
  {banner}
  onwrite={write}
  onnote={(note) => void setNote(note)}
/>
