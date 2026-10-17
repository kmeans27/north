# north

A local-first personal performance dashboard. One screen, twenty seconds a day.
Static site on GitHub Pages. **No server, no account, no analytics.** Personal data lives in a
separate private repo; this repo contains code and demo data only.

> You log roughly nine taps a day. The watch and the computer fill in the rest.
> You get one honest number, the four pillars behind it, and one thing to fix.

---

## Quick start

```bash
npm ci
npm run dev          # http://localhost:5173
```

```bash
npm run check        # svelte-check, zero errors and zero warnings
npm test             # Vitest unit suite
npm run e2e          # Playwright (builds and previews first)
npm run build        # static output in build/
```

The demo seed is deterministic: open `/?demo=1` to see 120 days of plausible history without
writing anything to storage. Demo data is in memory only and is clearly labelled.

## Build status

| Milestone | Scope | Status |
|---|---|---|
| M0 | Scaffold, tokens, registry, demo seed, deploy | done |
| M1 | Data layer: IndexedDB, dates, export | next |
| M2 | Scoring, aggregation, insights | — |
| M3 | Today, widgets, keyboard | — |
| M4 | Week, Trends | — |
| M5 | Settings, onboarding, presets | — |
| M6 | Sync | — |
| M7 | Automation | — |
| M8 | PWA, offline, print, a11y | — |
| M9 | Release | — |

The build order and the acceptance criteria for every milestone are in
[`08-build-plan.md`](08-build-plan.md). A milestone is finished only when every line of its
acceptance list passes.

## Deploy

The `deploy` workflow runs lint, type-check, unit tests and the static build on every push to
`main`, then publishes `build/` to GitHub Pages with `BASE_PATH=/north`.

```bash
gh repo create north --public --source=. --push
gh api -X POST repos/{owner}/north/pages -f build_type=workflow
```

Locally, reproduce the deployed path with:

```bash
BASE_PATH=/north npm run build && npm run preview
```

## Privacy model

Everything is stored in this browser's IndexedDB. Nothing leaves the device unless you turn on
sync, which writes to a private git repository you own using a token scoped to that repository
alone. There are no third-party requests at runtime — the font is self-hosted, the charts are
hand-written SVG, and there is no analytics, telemetry or error reporting. The PC collector, when
enabled, sends aggregates only: minutes per category and a clean-day boolean, never window titles,
URLs, app names or file paths. The app repo never contains personal data.

## Non-negotiables

1. **Fast.** A full manual daily log in ≤ 20 seconds and ≤ 2 interactions per metric.
2. **Honest.** Missing data is never zero. Auto vs manual is always visible.
3. **Small.** Static, no server, no accounts, no third-party requests at runtime.
4. **Quiet.** Paper and ink, hairline rules, one accent, no emoji, no confetti, no XP.
5. **Configurable.** Every target, weight and label lives in one registry plus an override layer.
6. **Yours forever.** Full JSON and CSV export in one click.
7. **Accessible.** Keyboard-complete, screen-reader labelled, AA contrast, reduced motion honoured.

Performance budget: ≤ 90 KB gzipped first load, ≤ 60 KB of fonts, LCP ≤ 1.2 s on a throttled
phone, Lighthouse ≥ 95 / 100 / 100.

## Stack

SvelteKit 2 · Svelte 5 (runes) · TypeScript strict (`noUncheckedIndexedAccess`) · `adapter-static` ·
plain CSS custom properties · hand-written SVG · Vitest · Playwright · GitHub Pages.

Runtime dependencies: none. Every package is a devDependency.

## Documents

The specification is the contract. Read in this order:

| File | Read it for |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Operating rules for the implementing agent |
| [`01-brief.md`](01-brief.md) | Why this exists, what it is not, success criteria |
| [`02-metrics.md`](02-metrics.md) | **Canonical registry** — every metric, target, weight, curve |
| [`03-scoring.md`](03-scoring.md) | Exact scoring maths, aggregation, edge cases, test tables |
| [`04-ux.md`](04-ux.md) | Screens, widgets, keyboard map, flows, microcopy |
| [`05-design.md`](05-design.md) | Tokens, type, layout, charts, motion, accessibility |
| [`06-architecture.md`](06-architecture.md) | Stack, file tree, data model, storage, sync, deployment |
| [`07-automation.md`](07-automation.md) | Apple Health, ActivityWatch, Shortcuts, ingest contract |
| [`08-build-plan.md`](08-build-plan.md) | M0–M9 with testable acceptance criteria |
| [`09-decisions.md`](09-decisions.md) | Locked decisions, open questions, V2 backlog, risks |

## Licence

MIT. See [`LICENSE`](LICENSE).
