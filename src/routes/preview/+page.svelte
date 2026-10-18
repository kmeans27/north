<script lang="ts">
  /* `/preview` — one finished day, from `sample.ts` (docs/V2.1.md §4).
     A mirror of `/`: the same `DashboardView`, the same taps, the same charts —
     but the days come from a fixed seed and every write lands in this
     component's own state. Nothing here is stored, and nothing here is real, so
     the design can be judged at its best without touching the owner's data. */
  import { logicalDate } from '$lib/metrics/dates';
  import type { Day, ResolvedMetric, Value } from '$lib/metrics/types';
  import { generateSampleDays, SAMPLE_DAYS, SAMPLE_SEED } from '$lib/sample';
  import { DEFAULT_SETTINGS, mergeSettings } from '$lib/store/settings';
  import DashboardView from '$lib/ui/DashboardView.svelte';

  const settings = mergeSettings(DEFAULT_SETTINGS);
  const today = logicalDate(new Date(), settings.dayCutoffHour);

  let days = $state<Day[]>(
    generateSampleDays({ end: today, days: SAMPLE_DAYS, seed: SAMPLE_SEED })
  );

  const day = $derived(days[days.length - 1] ?? null);

  /** The one write that exists here: into the sample, in memory, for this view. */
  function write(metric: ResolvedMetric, value: Value): void {
    const view = days[days.length - 1];
    if (!view) return;
    if (value === null) delete view.values[metric.id];
    else view.values[metric.id] = { v: value, src: 'manual', t: 0 };
  }

  function writeNote(note: string): void {
    const view = days[days.length - 1];
    if (view) view.note = note;
  }
</script>

<svelte:head>
  <title>north — preview</title>
</svelte:head>

<DashboardView
  date={day?.date ?? today}
  {day}
  {days}
  {settings}
  ready
  readOnly={false}
  note={day?.note ?? ''}
  marker="sample data"
  banner="Sample data — one finished day, from a fixed seed. Nothing here is saved; reload to reset."
  onwrite={write}
  onnote={writeNote}
/>
