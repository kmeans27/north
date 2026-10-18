<script lang="ts">
  /* `/settings` — the smallest screen that makes the numbers yours (04-ux.md §8).
     Two jobs, and no more: the handful of values every score is computed from,
     and getting your data out of the browser. No wizard, no presets, no
     per-metric target editing. */
  import { resolve } from '$app/paths';
  import { formatHour, formatNumber, joinUnit, plural } from '$lib/format';
  import { formatDate } from '$lib/metrics/dates';
  import { resolveMetrics } from '$lib/metrics/resolve';
  import { buildExport, download, serializeExport, toCSV } from '$lib/store/export';
  import {
    HEALTH_FORMAT,
    parseHealthFile,
    planHealthImport,
    type HealthFile,
    type HealthPlan
  } from '$lib/store/health';
  import { importBackup, importHealth, session, updateSettings } from '$lib/store/session.svelte';
  import type { Settings } from '$lib/metrics/types';
  import NumberField from '$lib/ui/NumberField.svelte';
  import SectionLabel from '$lib/ui/SectionLabel.svelte';

  const settings = $derived(session.settings);
  const metrics = $derived(resolveMetrics(settings));
  /** The protein row recomputes its own target from those two values. */
  const protein = $derived(metrics.find((metric) => metric.id === 'protein'));
  const proteinTarget = $derived(protein?.score.target ?? 0);
  const first = $derived(session.days[0]?.date ?? null);
  const last = $derived(session.days.at(-1)?.date ?? null);

  const GOALS = [
    { value: 'maintain', label: 'maintain' },
    { value: 'cut', label: 'cut' },
    { value: 'bulk', label: 'bulk' }
  ] as const;
  const WEEK_STARTS = [
    { value: 1, label: 'Monday' },
    { value: 0, label: 'Sunday' }
  ] as const;
  const THEMES = [
    { value: 'system', label: 'system' },
    { value: 'light', label: 'light' },
    { value: 'dark', label: 'dark' }
  ] as const;

  /** What just happened, said plainly. Exports and imports both report here. */
  let note = $state<string | null>(null);

  const field = (label: string, step: number, decimals: number) => ({ label, step, decimals });

  /** Every control reports through here, so a storage failure is never silent. */
  async function apply(patch: Partial<Settings>): Promise<void> {
    try {
      await updateSettings(patch);
    } catch (error) {
      note = error instanceof Error ? error.message : 'That change could not be saved.';
    }
  }

  const setBodyweight = (value: number | null): void => {
    if (value !== null) void apply({ bodyweightKg: value });
  };

  const setProtein = (value: number | null): void => {
    if (value !== null) void apply({ proteinGPerKg: value });
  };

  const setCutoff = (value: number | null): void => {
    if (value !== null) void apply({ dayCutoffHour: value });
  };

  function exportJson(): void {
    const name = `north-${session.today}.json`;
    download(name, serializeExport(buildExport(session.days, settings, Date.now())), 'application/json');
    note = `Saved ${name} — ${session.days.length} ${plural(session.days.length, 'day')}.`;
  }

  function exportCsv(): void {
    const name = `north-${session.today}.csv`;
    download(name, toCSV(session.days), 'text/csv');
    note = `Saved ${name} — one row per day.`;
  }

  async function importFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Re-selecting the same file has to fire again.
    input.value = '';
    if (!file) return;
    try {
      const count = await importBackup(await file.text());
      note = `Imported ${count} ${plural(count, 'day')}. Nothing was deleted.`;
    } catch (error) {
      note = error instanceof Error ? error.message : 'That backup could not be read.';
    }
  }

  /* ─── Apple Health, by hand (docs/V2.1.md §6) ───────────────────────────── */

  /** A file that is waiting for a yes: parsed and planned, nothing written. */
  let healthFile = $state<HealthFile | null>(null);
  let healthPlan = $state<HealthPlan | null>(null);
  let healthNote = $state<string | null>(null);

  function fieldCount(plan: HealthPlan): string {
    return `${plan.writes.length} ${plural(plan.writes.length, 'value')}`;
  }

  async function readHealth(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const parsed = parseHealthFile(await file.text());
      healthFile = parsed;
      // Read against the days already here, so the preview is exact.
      healthPlan = planHealthImport(parsed, session.days);
      healthNote = null;
    } catch (error) {
      healthFile = null;
      healthPlan = null;
      healthNote = error instanceof Error ? error.message : 'That health file could not be read.';
    }
  }

  async function confirmHealth(): Promise<void> {
    const waiting = healthFile;
    if (!waiting) return;
    healthFile = null;
    healthPlan = null;
    try {
      const plan = await importHealth(waiting);
      note = `Apple Health: wrote ${fieldCount(plan)} across ${plan.days} ${plural(plan.days, 'day')}.`;
      healthNote =
        plan.kept.length > 0
          ? `${plan.kept.length} ${plural(plan.kept.length, 'value')} you entered by hand were kept.`
          : 'Nothing you entered by hand was touched.';
    } catch (error) {
      healthNote = error instanceof Error ? error.message : 'That health file could not be read.';
    }
  }
</script>

<svelte:head>
  <title>north — settings</title>
</svelte:head>

<h1 class="visually-hidden">Settings</h1>

{#if session.ready}
  <div class="shell page">
    <p class="prose lede">
      Targets are computed from these values, not stored per day: change one and the whole history
      re-scores. Nothing here leaves this device.
    </p>

    <div class="actions">
      <a class="button" href={resolve('/preview')}>See a finished day</a>
      <span class="meta">Sample data: the whole board filled in, nothing stored.</span>
    </div>

    <section class="block" aria-labelledby="you">
      <SectionLabel id="you" label="You" />

      <div class="setting">
        <span class="setting-label" id="bodyweight-label">Bodyweight</span>
        <div class="control" aria-labelledby="bodyweight-label">
          <NumberField
            metric={field('Bodyweight', 0.5, 1)}
            value={settings.bodyweightKg}
            onchange={setBodyweight}
          />
          <span class="meta unit">kg</span>
        </div>
      </div>

      <div class="setting">
        <span class="setting-label" id="protein-label">Protein per kg</span>
        <div class="control" aria-labelledby="protein-label">
          <NumberField
            metric={field('Protein per kg', 0.1, 1)}
            value={settings.proteinGPerKg}
            onchange={setProtein}
          />
          <span class="meta unit">g/kg</span>
        </div>
      </div>

      <p class="meta derived" data-testid="protein-target">
        Protein target
        <span class="num">{joinUnit(formatNumber(proteinTarget), protein?.unit ?? '')}</span>
        a day — {settings.proteinGPerKg} g/kg at {settings.bodyweightKg} kg.
      </p>

      <div class="setting">
        <span class="setting-label" id="goal-label">Weight goal</span>
        <div class="chips" role="radiogroup" aria-labelledby="goal-label">
          {#each GOALS as option (option.value)}
            <label class="chip">
              <input
                type="radio"
                name="weightMode"
                value={option.value}
                checked={settings.weightMode === option.value}
                onchange={() => void apply({ weightMode: option.value })}
              />
              <span>{option.label}</span>
            </label>
          {/each}
        </div>
      </div>
    </section>

    <section class="block" aria-labelledby="day">
      <SectionLabel id="day" label="Day" />

      <div class="setting">
        <span class="setting-label" id="cutoff-label">Day ends at</span>
        <div class="control" aria-labelledby="cutoff-label">
          <NumberField
            metric={field('Day ends at', 1, 0)}
            value={settings.dayCutoffHour}
            onchange={setCutoff}
          />
          <span class="meta unit">h</span>
        </div>
      </div>
      <p class="meta derived">
        The day rolls over at {formatHour(settings.dayCutoffHour)} — logging after midnight counts
        for the evening before.
      </p>

      <div class="setting">
        <span class="setting-label" id="week-label">Week starts on</span>
        <div class="chips" role="radiogroup" aria-labelledby="week-label">
          {#each WEEK_STARTS as option (option.value)}
            <label class="chip">
              <input
                type="radio"
                name="weekStartsOn"
                value={option.value}
                checked={settings.weekStartsOn === option.value}
                onchange={() => void apply({ weekStartsOn: option.value })}
              />
              <span>{option.label}</span>
            </label>
          {/each}
        </div>
      </div>
    </section>

    <section class="block" aria-labelledby="look">
      <SectionLabel id="look" label="Look" />

      <div class="setting">
        <span class="setting-label" id="theme-label">Theme</span>
        <div class="chips" role="radiogroup" aria-labelledby="theme-label">
          {#each THEMES as option (option.value)}
            <label class="chip">
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={settings.theme === option.value}
                onchange={() => void apply({ theme: option.value })}
              />
              <span>{option.label}</span>
            </label>
          {/each}
        </div>
      </div>
    </section>

    <section class="block" aria-labelledby="data">
      <SectionLabel
        id="data"
        label="Your data"
        count={`${session.days.length} ${plural(session.days.length, 'day')}`}
      />

      <p class="meta derived" data-testid="data-range">
        {#if first && last}
          {formatDate(first, 'short')} → {formatDate(last, 'short')} · stored in this browser only
        {:else}
          No days logged yet
        {/if}
      </p>

      <div class="actions">
        <button class="button" type="button" onclick={exportJson}>Export JSON</button>
        <button class="button" type="button" onclick={exportCsv}>Export CSV</button>
      </div>

      <div class="import">
        <label class="setting-label" for="import-file">Restore a backup</label>
        <input
          id="import-file"
          class="file"
          type="file"
          accept="application/json,.json"
          onchange={(event) => void importFile(event)}
        />
      </div>

      <div class="import health">
        <label class="setting-label" for="health-file">Apple Health</label>
        <input
          id="health-file"
          class="file"
          type="file"
          accept="application/json,.json"
          aria-describedby="health-help"
          onchange={(event) => void readHealth(event)}
        />
        <p class="meta" id="health-help">
          A <code>{HEALTH_FORMAT}</code> file. Make one from Apple's own export with
          <code>python3 server/health_export.py</code> — it is read here and never uploaded, and a
          value you entered by hand is never overwritten.
        </p>
      </div>

      {#if healthFile && healthPlan}
        <div class="plan" data-testid="health-plan">
          <p class="meta">
            {healthPlan.days} {plural(healthPlan.days, 'day')}
            {#if healthPlan.from && healthPlan.to}({formatDate(healthPlan.from, 'short')} →
              {formatDate(healthPlan.to, 'short')}){/if}
            · {fieldCount(healthPlan)} to write · {healthPlan.same} already the same
            {#if healthPlan.kept.length}· {healthPlan.kept.length}
              {plural(healthPlan.kept.length, 'value')} yours, kept{/if}
          </p>
          <div class="actions">
            <button class="button" type="button" onclick={() => void confirmHealth()}>
              Import {healthPlan.writes.length} {plural(healthPlan.writes.length, 'value')}
            </button>
            <button
              class="button quiet"
              type="button"
              onclick={() => {
                healthFile = null;
                healthPlan = null;
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}

      {#if healthNote}
        <p class="meta note" role="status" data-testid="health-note">{healthNote}</p>
      {/if}

      {#if note}
        <p class="meta note" role="status" data-testid="settings-note">{note}</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .page {
    padding-top: var(--s-6);
    padding-bottom: var(--s-16);
  }

  .lede {
    color: var(--ink-muted);
    margin-bottom: var(--s-6);
  }

  .block {
    border-top: var(--bw-hair) solid var(--rule);
    padding-top: var(--s-5);
    margin-top: var(--s-6);
  }

  .setting {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--s-3) var(--s-6);
    min-height: var(--row-h);
    border-bottom: var(--bw-hair) solid var(--rule);
  }

  .setting-label {
    font-size: var(--fs-14);
  }

  .control {
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }

  .unit {
    min-width: var(--s-6);
  }

  .derived {
    padding: var(--s-3) 0;
    border-bottom: var(--bw-hair) solid var(--rule);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    padding: var(--s-2) 0;
  }

  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--tap-min);
    min-width: var(--tap-min);
    padding: 0 var(--s-3);
    border: var(--bw-hair) solid var(--rule-strong);
    font-size: var(--fs-13);
    color: var(--ink-muted);
    cursor: pointer;
    transition: border-color var(--t-fast) var(--ease), color var(--t-fast) var(--ease);
  }

  /* The radio *is* the chip: the visible box is the control, so the 44 px tap
     floor is measured on the thing a finger actually hits. */
  .chip input {
    appearance: none;
    position: absolute;
    /* The chip's border is part of the target: `inset: 0` measures the 42 px
       inside a 44 px chip, and the floor is 44. */
    inset: calc(var(--bw-hair) * -1);
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .chip:hover {
    border-color: var(--ink);
  }

  .chip:has(input:checked) {
    border-color: var(--ink);
    color: var(--ink);
    background: var(--paper-sunken);
  }

  .chip:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
    padding-top: var(--s-1);
  }

  /* A link that is an action, so it holds the 44 px floor like the buttons. */
  a.button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--s-4);
    text-decoration: none;
  }

  .button {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap-min);
    padding: 0 var(--s-4);
    border: var(--bw-hair) solid var(--rule-strong);
    font-size: var(--fs-13);
    transition: border-color var(--t-fast) var(--ease);
  }

  .button:hover {
    border-color: var(--ink);
  }

  .import {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-3);
    padding-top: var(--s-4);
  }

  .file {
    font-size: var(--fs-13);
    color: var(--ink-muted);
    max-width: 100%;
  }

  .file::file-selector-button {
    font: inherit;
    color: var(--ink);
    background: var(--paper);
    border: var(--bw-hair) solid var(--rule-strong);
    min-height: var(--tap-min);
    padding: 0 var(--s-4);
    margin-right: var(--s-3);
    cursor: pointer;
    transition: border-color var(--t-fast) var(--ease);
  }

  .file::file-selector-button:hover {
    border-color: var(--ink);
  }

  .note {
    padding-top: var(--s-3);
  }

  /* The health file is a whole paragraph of help, so it gets its own line. */
  .health {
    align-items: flex-start;
  }

  .health .setting-label {
    flex: 0 0 auto;
  }

  .health p {
    flex-basis: 100%;
  }

  .health code {
    font-family: var(--font-figures);
    font-size: var(--fs-12);
  }

  .plan {
    margin-top: var(--s-4);
    padding: var(--s-3);
    border: var(--bw-hair) solid var(--rule-strong);
    background: var(--card);
  }

  .button.quiet {
    color: var(--ink-muted);
  }

  /* Below 480 px the label sits above its control, as the Today rows do. */
  @media (max-width: 479px) {
    .setting {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--s-2);
      padding: var(--s-3) 0;
    }
  }
</style>
