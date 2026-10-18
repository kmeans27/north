# north

A local-first personal performance dashboard. One screen, twenty seconds a day.
Static site on GitHub Pages. **No server, no account, no analytics.** Personal data lives in a
separate private repo; this repo contains code and demo data only.

> You log roughly nine taps a day. The watch and the computer fill in the rest.
> You get one honest number, the four pillars behind it, and one thing to fix.

**Why north exists.** Habit trackers track *habits*; north tracks the small,
important parts of life that decide how well you perform — sleep, food, focus,
attention, money. The logging has to be fast and satisfying enough that you
actually do it, and the display has to let you see at one grasp what is going on
and what needs doing. The basics — how each thing is logged and how it is shown —
come first; weekly plans come later. See [`VISION.md`](VISION.md).

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
uv run server/serve.py  # serve build/ at http://127.0.0.1:8080
```

The demo seed is deterministic: open `/?demo=1` to see 120 days of plausible history without
writing anything to storage. Demo data is in memory only and is clearly labelled.

## Build status

| Milestone | Scope | Status |
|---|---|---|
| M0 | Scaffold, tokens, registry, demo seed, deploy | **done** |
| M1 | Data layer: IndexedDB, dates, export | **done** |
| M2 | Scoring, aggregation, insights | **done** |
| M3 | Today, widgets, keyboard | **done** |
| M4 | Week, Trends | **done** |
| M5 | Settings, onboarding, presets | next |
| M6 | Sync | — |
| M7 | Automation | — |
| M8 | PWA, offline, print, a11y | — |
| M9 | Release | — |

Last gate (M4 + polish): `npm run check` 0 errors / 0 warnings · 361 unit tests green ·
lint clean · build clean · 63 e2e pass + 1 skipped · 12 server tests green.
Budgeted at M4: **JS + CSS gzipped 76.8 KB** (limit 90 KB) · **font 30.8 KB** (limit 60 KB).
Served by `server/serve.py` (see [Deploy](#deploy--self-hosted)); no hosted URL until you point a
domain at it.

The build order and the acceptance criteria for every milestone are in
[`08-build-plan.md`](08-build-plan.md). A milestone is finished only when every line of its
acceptance list passes.

### Polish pass (after M4)

The owner's priority is that logging feels fast and the screen reads at a glance, so Today,
Week and Trends were tightened before starting M5:

- **Rows stack on phones.** `04-ux.md` §2 draws the label and its cells side by side in a 52 px
  row. At the 390 px viewport that is not possible without breaking the 44 × 44 tap floor: a
  six-cell choice row is 6 × 44 px plus gaps (~300 px), leaving ≈ 65 px for the label, which
  wraps every label mid-phrase. Below 480 px the label now sits **above** its control in a tight
  two-line row, so labels read on one line and the cells keep their size. All six rows and the
  `+ 3 more` expander still fit inside the 844 px viewport, so the M3 acceptance holds.
- **The empty-score placeholder no longer reads as a redaction bar.** With no score yet the
  56 px em-dash looked like a solid black bar; it is now drawn at 24 px inside the same 56 px
  line box, so the number can appear without shifting the page.
- **Count strings read correctly.** `pluralUnit` / `plural` in `src/lib/format.ts` turn
  `days` → `day` and `servings` → `serving` for one, so Week shows `+1 day`, never `+1 days`;
  the section counts use the same helper (`1 item`, `5 values`, `3 metrics`).
- **Thousands are printed as thousands.** Steps stores its value in steps with the unit `k`
  (`02-metrics.md` §3), so the raw figure printed beside a `k` read as millions — Trends showed
  `9,400 k`. `formatValue` and `formatCompact` now scale the `k` unit and drop a bare `.0`:
  `9.4 k`, target `7 k`.
- **An insight card does not repeat itself.** Rule 1's canonical sentence opens with
  `Weakest link: …` and rule 3's ends with `(n = 98 days. …)`, so the card heading (rule 1) and
  the sample-size footer (rule 3) are rendered only when the sentence does not already carry
  them. The card copy itself is unchanged.
- **The auto-cell sheet labels its score.** The sheet showed a bare `80 of 100`; it now reads
  `score 80 of 100` next to `source: watch`.

## Deploy — self-hosted

The site is a prerendered static bundle served from a real server, not GitHub Pages.

```bash
npm run build                    # static output in build/, served from the root
uv run server/serve.py --port 8080
```

`server/serve.py` is a standard-library-only `uv` script (no environment to
create, no packages to install). It exists because a stock file server is not
enough: `/week` has to resolve to `week.html`, `.woff2` and `.webmanifest` need
real MIME types, hashed assets must be immutable while HTML must revalidate, and
the payload has to be gzipped to stay inside the performance budget.

| Flag | Default | Meaning |
|---|---|---|
| `--host` | `127.0.0.1` | Interface. Use `0.0.0.0` to reach it from the LAN. |
| `--port` | `8080` | Port. |
| `--root` | `build/` | Directory to serve. |
| `/healthz` | — | Returns `200 ok`; for a process supervisor. |

Put a TLS reverse proxy in front for a public address. With Caddy, one line is
the whole configuration (Caddy handles the certificate and compression):

```caddyfile
north.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

`/fonts` and `/_app` are absolute paths, so the site must be served from the root
of its domain. To serve it under a sub-path instead, build with `BASE_PATH`:

```bash
BASE_PATH=/north npm run build
```

Tests for the server (stdlib `unittest`, also run in CI):

```bash
uv run python -m unittest discover -s server
```

CI runs lint, `svelte-check`, the unit suite, the build and the server tests on
every push to `main` (`.github/workflows/ci.yml`). It does not publish anything —
deployment is yours.

> **Note:** GitHub Actions is currently locked on this account ("your account is
> locked due to a billing issue"), so CI cannot run until billing is fixed. The
> self-hosted server does not depend on it.

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
plain CSS custom properties · hand-written SVG · Vitest · Playwright · a standard-library Python
static server (`uv`) · self-hosted.

Runtime dependencies: none. Every npm package is a devDependency, and the server uses only the
Python standard library.

## Documents

The specification is the contract. Read in this order:

| File | Read it for |
|---|---|
| [`VISION.md`](VISION.md) | Owner's direction + logging/display spec |
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
