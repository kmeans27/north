# north

A local-first personal performance dashboard. One screen, twenty seconds a day.
Self-hosted static site. **No server state, no account, no analytics.** Personal data lives in a
separate private repo; this repo contains code and demo data only.

> You log roughly nine taps a day. The watch and the computer fill in the rest.
> The home screen reads at a glance; the log is for filling the gaps.

**Status: v2.** v1 was a flat list of rows — a form, not a dashboard. v2 replaces the home
screen with a categorised dashboard of charts, keeps the old list at `/log`, and puts the nine
daily taps on the dashboard itself. The Apple Health pipeline is designed and is next.
**[`docs/V2.md`](docs/V2.md) is the live brief; read it first.**

**Why north exists.** Habit trackers track *habits*; north tracks the small,
important parts of life that decide how well you perform — sleep, food, focus,
attention, money. The logging has to be fast and satisfying enough that you
actually do it, and the display has to let you see at one grasp what is going on
and what needs doing. See [`docs/spec/vision-v1.md`](docs/spec/vision-v1.md) for what each
metric means.

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

## Scope

north is a personal tool, not a product. The owner's brief: **one view that shows how your
private life is actually going** — business-intelligence for one person, simple but effective.

It is feature-complete. What is deliberately **not** built, and will not be:

| Not built | Why |
|---|---|
| Sync, accounts, any server-side data | The app is local-first. Your data stays in the browser; changing device is a JSON export/import. |
| Automation (Apple Health, Screen Time collectors) | Not built yet. The pipeline is designed in [`docs/V2.md`](docs/V2.md) §5; every auto metric stays hand-enterable until it lands. |
| Onboarding wizard, `gentle/standard/strict` presets | Nine steps to set nine defaults. Settings has the values that matter, and shows what they derive. |
| Per-metric target editing | Every target lives in one registry plus an override layer; the Settings screen covers the ones that actually move. |
| PWA, install prompts, print stylesheet | A second lifetime of caching bugs for a page you open once a day. |
| More screens | Three is already one more than the brief asked for. |

The line is: **logging must stay the fastest thing in the app.** Everything above would add a step
to the daily loop, or a moving part that can break it.

## Build status

| Milestone | Scope | Status |
|---|---|---|
| M0 | Scaffold, tokens, registry, demo seed, deploy | **done** |
| M1 | Data layer: IndexedDB, dates, export | **done** |
| M2 | Scoring, aggregation, insights | **done** |
| M3 | Today, widgets, keyboard | **done** |
| M4 | Week, Trends | **done** |
| M5 | Settings and data export (cut down, see below) | **done** |
| M6–M9 | Sync, automation, PWA, release | **not planned** (see [Scope](#scope)) |
| V2 | Dashboard home + inline logging | **done** — see below |

### V2 — the dashboard (see [`docs/V2.md`](docs/V2.md))

The home screen is now a dashboard, not a list. `/` shows the day's composite over 30 days, then
one panel per part of life — Attention, Mind, Body, Capital, weakest figure first — each with its
pillar score, its 30-day shape, every metric of that pillar, and a chart where the shape carries
the meaning. The nine things you log by hand are one tap each, on the dashboard, in place.

- **v1 is frozen, not deleted.** The old list moved to `/log` and its behaviour, keyboard model
  and tests are unchanged; `[` and `]` browse days on both screens. The shell's four links are
  `log · week · trends · set`, and the wordmark is home.
- **Charts are hand-written SVG on tokens** (`src/lib/ui/Bars.svelte`, `AreaChart.svelte`): 14 days
  of bars with the target as a hairline, or the hero's 30-day area on a fixed 0–100 scale. No
  chart library, no gradient literals, no new dependency.
- **A gap stays a gap.** Every series is `(number | null)[]`; a missing day draws no bar.
- **The maths did not move.** `src/lib/dashboard.ts` is pure and unit-tested; every figure in it
  comes from `aggregate.ts` or the registry.

Last gate (V2): `npm run check` 0 errors / 0 warnings · 380 unit tests green · lint clean ·
build clean · 99 e2e pass + 1 skipped · 12 server tests green.
Budget, first load (the gzipped responses the page actually requests, served by `serve.py`):
**65.9 KB JS + CSS on the dashboard, 68.2 KB on the log** (limit 90 KB) · **font 30.0 KB**
(limit 60 KB).

**M5 was cut to two things**, because those were the only parts that were actually missing:
the handful of values every score is computed from (`bodyweightKg` was stuck at the 80 kg
default, so a lighter or heavier person got the wrong protein target) and a way to get your data
out (`export.ts` was written and tested in M1 but nothing in the UI called it). The nine-step
wizard, the presets and the per-metric target editor are not built, and that is a deliberate
departure from `docs/spec/08-build-plan.md` §M5 — reported, and recorded in [`docs/spec/vision-v1.md`](docs/spec/vision-v1.md) §5.

Gate at M5: `npm run check` 0 errors / 0 warnings · 364 unit tests green · lint clean ·
build clean · 79 e2e pass + 1 skipped · 12 server tests green.
Budgeted at M4: **JS + CSS gzipped 76.8 KB** (limit 90 KB) · **font 30.8 KB** (limit 60 KB).
Served by `server/serve.py` (see [Deploy](#deploy--self-hosted)); no hosted URL until you point a
domain at it.

The build order and the acceptance criteria for every milestone are in
[`docs/spec/08-build-plan.md`](docs/spec/08-build-plan.md). A milestone is finished only when every line of its
acceptance list passes.

### Polish pass (after M4)

The owner's priority is that logging feels fast and the screen reads at a glance, so Today,
Week and Trends were tightened before starting M5:

- **Rows stack on phones.** `docs/spec/04-ux.md` §2 draws the label and its cells side by side in a 52 px
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
  (`docs/spec/02-metrics.md` §3), so the raw figure printed beside a `k` read as millions — Trends showed
  `9,400 k`. `formatValue` and `formatCompact` now scale the `k` unit and drop a bare `.0`:
  `9.4 k`, target `7 k`.
- **An insight card does not repeat itself.** Rule 1's canonical sentence opens with
  `Weakest link: …` and rule 3's ends with `(n = 98 days. …)`, so the card heading (rule 1) and
  the sample-size footer (rule 3) are rendered only when the sentence does not already carry
  them. The card copy itself is unchanged.
- **The auto-cell sheet labels its score.** The sheet showed a bare `80 of 100`; it now reads
  `score 80 of 100` next to `source: watch`.
- **A row now says what a tap means.** `Protein anchors` was jargon: nothing on the screen
  explained that the count is in 32 g units, so `Protein 2` was a number with no meaning. The
  label is now `Protein`, and a row prints its unit — `Protein ×32 g`, `Greens & fruit servings`,
  `Deep blocks ×45 min` — muted, after the label. Rows whose bins already carry the unit
  (`≤ 30m 30–60m 1–2h 2h+`) suppress it rather than repeat themselves. The metric's `help`
  sentence ("One tap per 32 g of protein. Not a diary — a count.") is the row label's `title`
  on hover, and it stays in the accessible name, so the screen reader announces
  `Protein ×32 g, 3 of 5`. Two more jargon short-names went with it: `Regular` →
  `Regularity`, `Leaks` → `Distraction`. `docs/spec/02-metrics.md`, `docs/spec/04-ux.md`, `docs/spec/vision-v1.md` and the
  registry were all updated together.
- **One minus glyph.** Week's comparison printed `−22` (U+2212) while Today's auto cells printed
  `-0.1 %/wk` (ASCII hyphen). `formatNumber` now uses the typographic minus, so both screens
  agree: `Weight −0.1 %/wk`.
- **Units hug their slash.** `Gym 0 /wk` read like two tokens; a unit that starts with `/` is
  now joined without a space (`0/wk`), while `7.4 h` and `94 %` keep theirs.

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

### Keep it running

A user service is enough for a machine that is always on:

```ini
# ~/.config/systemd/user/north.service
[Unit]
Description=north

[Service]
WorkingDirectory=%h/north
ExecStart=/usr/bin/env uv run server/serve.py --host 127.0.0.1 --port 8080
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now north
systemctl --user status north
```

The server exposes `/healthz` for exactly this: `curl -fsS localhost:8080/healthz`.

### Relationship to GitHub

The repository is source, not hosting. `gh-pages` has been deleted and no
workflow publishes anything, so nothing is served from `github.io`. GitHub
refused programmatic deactivation of the Pages site
(`422 Deactivating GitHub pages for this repository is not allowed`) — with the
branch gone it has nothing to serve; switch it off permanently in
**Settings → Pages** when convenient.

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

**[`docs/V2.md`](docs/V2.md) is the live brief — read it first.** It replaced the v1 list design
with a dashboard, and it decides what gets worked on. Everything under `docs/spec/` is the v1
outline: still canonical for metrics and scoring maths, no longer a mandate for the screens.

| File | Read it for |
|---|---|
| [`docs/V2.md`](docs/V2.md) | **The live brief.** Dashboard philosophy, focus order, Apple Health pipeline |
| [`AGENTS.md`](AGENTS.md) | Operating rules for the implementing agent |
| [`docs/spec/vision-v1.md`](docs/spec/vision-v1.md) | Owner's v1 brief — clearest per-metric description |
| [`docs/spec/02-metrics.md`](docs/spec/02-metrics.md) | **Canonical registry** — every metric, target, weight, curve |
| [`docs/spec/03-scoring.md`](docs/spec/03-scoring.md) | Exact scoring maths, aggregation, edge cases, test tables |
| [`docs/spec/05-design.md`](docs/spec/05-design.md) | Tokens, type, layout, charts, motion, accessibility |
| [`docs/spec/09-decisions.md`](docs/spec/09-decisions.md) | Locked decisions, anti-patterns, risks |
| [`docs/spec/01-brief.md`](docs/spec/01-brief.md) | Why this exists, what it is not |
| [`docs/spec/04-ux.md`](docs/spec/04-ux.md) | v1 screens, widgets, keyboard map |
| [`docs/spec/06-architecture.md`](docs/spec/06-architecture.md) | Stack, data model, storage |
| [`docs/spec/07-automation.md`](docs/spec/07-automation.md) | Ingest contract (V2 extends this for Health) |
| [`docs/spec/08-build-plan.md`](docs/spec/08-build-plan.md) | M0–M5 as delivered; M6–M9 not planned |
| [`docs/README.md`](docs/README.md) | Index, and what the spec is still authoritative for |

## Licence

MIT. See [`LICENSE`](LICENSE).
