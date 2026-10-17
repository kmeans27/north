<script lang="ts">
  /* M0 foundation page. This is the design-system specimen, not the product:
     Today supersedes it at M3 (08-build-plan.md). It exists so the deployed URL
     can be checked against 05-design.md before any metric UI is written. */
  import { onMount } from 'svelte';
  import { PILLARS, PILLAR_LABEL, REGISTRY } from '$lib/metrics/registry';
  import { demoFingerprint, generateDemoDays } from '$lib/store/demo';
  import { session } from '$lib/store/session.svelte';
  import { formatDate } from '$lib/metrics/dates';
  import { formatValue } from '$lib/format';
  import type { Day } from '$lib/metrics/types';

  const PALETTE = [
    '--paper', '--paper-sunken', '--ink', '--ink-muted', '--ink-faint',
    '--rule', '--rule-strong', '--accent', '--accent-soft', '--warn', '--bad'
  ] as const;

  const TYPE_ROLES = [
    { role: 'Day score', sample: '82', spec: '56 / 400 · figures', cls: 'score' },
    { role: 'Secondary score', sample: '79', spec: '20 / 400 · figures', cls: 'secondary' },
    { role: 'Section label', sample: 'NEEDS YOU', spec: '11 / 500 · uppercase', cls: 'label' },
    { role: 'Row label', sample: 'Protein anchors', spec: '14 / 400 · ui', cls: 'row' },
    { role: 'Row value', sample: '3 of 5', spec: '14 / 400 · figures', cls: 'value' },
    { role: 'Prose', sample: 'One honest number', spec: '13 / 400 · ui', cls: 'prose' }
  ] as const;

  let hexes = $state<Record<string, string>>({});
  let demoDays = $state<Day[] | null>(null);
  let fingerprint = $state('');
  let repeatable = $state(false);

  const byPillar = $derived(
    PILLARS.map((p) => ({ key: p, label: PILLAR_LABEL[p], n: REGISTRY.filter((m) => m.pillar === p).length }))
  );

  /** Stored fields for the viewed day, in registry order — the data layer, visible. */
  const loggedRows = $derived(
    REGISTRY.filter((metric) => session.day?.values[metric.id]).map((metric) => {
      const value = session.day?.values[metric.id];
      return {
        id: metric.id,
        label: metric.label,
        pillar: PILLAR_LABEL[metric.pillar],
        display: formatValue(value?.v ?? null, metric.unit, metric.decimals),
        source: value?.src ?? 'manual',
        locked: value?.locked === true
      };
    })
  );

  onMount(() => {
    const style = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};
    for (const token of PALETTE) next[token] = style.getPropertyValue(token).trim();
    hexes = next;

    if (new URLSearchParams(window.location.search).get('demo') === '1') loadDemo();
  });

  function loadDemo(): void {
    const first = generateDemoDays();
    const second = generateDemoDays();
    demoDays = first;
    fingerprint = demoFingerprint(first);
    repeatable = demoFingerprint(second) === fingerprint;
  }
</script>

<svelte:head>
  <title>north — today</title>
</svelte:head>

<div class="shell page">
  <h1 class="visually-hidden">north — today</h1>

  <div class="masthead">
    <span class="date-line">{session.ready ? formatDate(session.date) : 'Today'}</span>
    <span class="meta" data-testid="mode-marker">
      <span data-testid="logical-date">{session.date || '—'}</span>
      · {session.demo ? 'demo data' : 'local only'}
    </span>
  </div>

  <section class="section" aria-labelledby="day-title">
    <div class="section-head">
      <h2 id="day-title" class="section-label">Stored day</h2>
      <span class="meta">{loggedRows.length} of {REGISTRY.length} fields</span>
    </div>

    {#if !session.ready}
      <p class="prose">Reading local storage.</p>
    {:else if session.error}
      <p class="prose">Storage is unavailable: {session.error}</p>
    {:else if loggedRows.length === 0}
      <p class="prose">Not enough logged yet.</p>
    {:else}
      <ul class="type-list">
        {#each loggedRows as row (row.id)}
          <li class="type-row">
            <span class="type-role">{row.label}</span>
            <span class="type-spec">
              {row.pillar} · {row.source}{row.locked ? ' · locked' : ''}
            </span>
            <span class="type-sample num" data-testid={`day-value-${row.id}`}>{row.display}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <p class="meta storage-line">
      {session.days.length} day{session.days.length === 1 ? '' : 's'} stored ·
      {session.undoCount} undo{session.undoCount === 1 ? '' : 's'} ·
      cutoff {String(session.settings.dayCutoffHour).padStart(2, '0')}:00 ·
      week starts {session.settings.weekStartsOn === 1 ? 'Monday' : 'Sunday'}
    </p>
  </section>

  <section class="section" aria-labelledby="palette-title">
    <div class="section-head">
      <h2 id="palette-title" class="section-label">Palette</h2>
      <span class="meta">{PALETTE.length} tokens</span>
    </div>

    <ul class="swatches">
      {#each PALETTE as token (token)}
        <li class="swatch-item">
          <span class="swatch" style="background: var({token})" aria-hidden="true"></span>
          <span class="swatch-name num">{token}</span>
          <span class="meta">{hexes[token] ?? '—'}</span>
        </li>
      {/each}
    </ul>
  </section>

  <section class="section" aria-labelledby="type-title">
    <div class="section-head">
      <h2 id="type-title" class="section-label">Type</h2>
      <span class="meta">two weights · 400 and 500</span>
    </div>

    <ul class="type-list">
      {#each TYPE_ROLES as item (item.role)}
        <li class="type-row">
          <span class="type-role">{item.role}</span>
          <span class="type-spec">{item.spec}</span>
          <span class="type-sample {item.cls}" class:num={item.cls !== 'label'} class:label-sample={item.cls === 'label'}>
            {item.sample}
          </span>
        </li>
      {/each}
    </ul>
  </section>

  <section class="section" aria-labelledby="rhythm-title">
    <div class="section-head">
      <h2 id="rhythm-title" class="section-label">Rhythm</h2>
      <span class="meta">620 px measure</span>
    </div>

    <dl class="facts">
      <div class="fact">
        <dt class="meta">Column</dt>
        <dd>620 px, centred, 20 px gutters</dd>
      </div>
      <div class="fact">
        <dt class="meta">Spacing</dt>
        <dd>4 px base, 8 px rhythm</dd>
      </div>
      <div class="fact">
        <dt class="meta">Rules</dt>
        <dd>1 px hairlines, no shadows, no cards</dd>
      </div>
      <div class="fact">
        <dt class="meta">Registry</dt>
        <dd>{REGISTRY.length} metrics · {PILLARS.length} pillars</dd>
      </div>
    </dl>

    <ul class="pillar-counts">
      {#each byPillar as item (item.key)}
        <li><span class="meta">{item.label}</span> <span class="num">{item.n}</span></li>
      {/each}
    </ul>
  </section>

  {#if demoDays}
    <section class="section" aria-labelledby="demo-title">
      <div class="section-head">
        <h2 id="demo-title" class="section-label">Demo</h2>
        <span class="meta">demo data · never persisted</span>
      </div>

      <dl class="facts">
        <div class="fact">
          <dt class="meta">Days</dt>
          <dd class="num" data-testid="demo-days">{demoDays.length}</dd>
        </div>
        <div class="fact">
          <dt class="meta">First</dt>
          <dd class="num">{demoDays[0]?.date ?? '—'}</dd>
        </div>
        <div class="fact">
          <dt class="meta">Last</dt>
          <dd class="num">{demoDays.at(-1)?.date ?? '—'}</dd>
        </div>
        <div class="fact">
          <dt class="meta">Fingerprint</dt>
          <dd class="num" data-testid="demo-fingerprint">{fingerprint}</dd>
        </div>
        <div class="fact">
          <dt class="meta">Repeatable</dt>
          <dd data-testid="demo-repeatable">{repeatable ? 'identical on two runs' : 'differs between runs'}</dd>
        </div>
      </dl>
    </section>
  {:else}
    <section class="section" aria-labelledby="demo-link-title">
      <div class="section-head">
        <h2 id="demo-link-title" class="section-label">Demo</h2>
        <span class="meta">not loaded</span>
      </div>
      <p class="prose">
        The demo seed is deterministic: 120 days of plausible history, generated from a
        fixed seed.
      </p>
      <button class="text-action" type="button" onclick={loadDemo}>Load demo data</button>
    </section>
  {/if}

  <footer class="footer">
    <span class="meta">north · local-first · no server, no accounts, no analytics</span>
  </footer>
</div>

<style>
  .page {
    padding-top: var(--s-8);
    padding-bottom: var(--s-16);
  }

  .masthead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-4);
  }

  .date-line {
    font-size: var(--fs-13);
    color: var(--ink-muted);
  }

  .section {
    border-top: var(--bw-hair) solid var(--rule);
    padding-top: var(--s-6);
    margin-top: var(--s-6);
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-4);
    margin-bottom: var(--s-4);
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--s-4);
  }

  .swatch-item {
    display: grid;
    gap: var(--s-1);
  }

  .swatch {
    display: block;
    height: var(--s-8);
    border: var(--bw-hair) solid var(--rule-strong);
    border-radius: var(--r-1);
  }

  .swatch-name {
    font-size: var(--fs-12);
    color: var(--ink);
  }

  .type-list {
    display: grid;
  }

  .type-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--s-1) var(--s-4);
    align-items: center;
    padding: var(--s-3) 0;
    border-bottom: var(--bw-hair) solid var(--rule);
  }

  .type-role {
    font-size: var(--fs-13);
    color: var(--ink);
  }

  .type-spec {
    font-size: var(--fs-11);
    color: var(--ink-muted);
  }

  .type-sample {
    grid-column: 2;
    grid-row: 1 / span 2;
    font-size: var(--fs-14);
    text-align: right;
  }

  .type-sample.score {
    font-size: var(--fs-56);
    line-height: var(--lh-tight);
  }

  .type-sample.label-sample {
    font-size: var(--fs-11);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--ls-label);
    color: var(--ink-muted);
  }

  .type-sample.secondary {
    font-size: var(--fs-20);
  }

  .facts {
    display: grid;
    gap: var(--s-3);
  }

  .fact {
    display: grid;
    grid-template-columns: 8rem 1fr;
    gap: var(--s-4);
    align-items: baseline;
  }

  .fact dd {
    font-size: var(--fs-13);
  }

  .pillar-counts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-4);
    margin-top: var(--s-4);
    padding-top: var(--s-3);
    border-top: var(--bw-hair) solid var(--rule);
  }

  .footer {
    margin-top: var(--s-12);
    padding-top: var(--s-4);
    border-top: var(--bw-hair) solid var(--rule);
  }

  .text-action {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap-min);
    margin-top: var(--s-2);
    color: var(--accent);
    font-size: var(--fs-13);
    text-decoration: underline;
    text-decoration-thickness: var(--bw-hair);
    text-underline-offset: 2px;
  }

  .storage-line {
    margin-top: var(--s-4);
  }

  @media (max-width: 480px) {
    .fact {
      grid-template-columns: 1fr;
      gap: var(--s-1);
    }
  }
</style>
