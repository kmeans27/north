# north

A local-first personal performance dashboard. One screen, twenty seconds a day.
Self-hosted static site. **No server state, no account, no analytics.** Personal data lives in a
separate private repo; this repo contains code and demo data only.

> You log roughly nine taps a day. The watch and the computer fill in the rest.
> The home screen reads at a glance; the log is for filling the gaps.

**Status: v2.1.** v1 was a flat list of rows — a form, not a dashboard. v2 replaced the home
screen with a categorised dashboard of charts and kept the old list at `/log`. v2.1 is the look:
full width, tiles sized by how much a metric matters, real colour, and a hand path for Apple
Health data (no server, no automation). `/preview` renders the same board with a finished day of
sample data. **[`docs/V2.md`](docs/V2.md) and [`docs/V2.1.md`](docs/V2.1.md) are the live briefs;
read them first.**

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
| Automation (Apple Health, Screen Time collectors) | Not built, and not needed: Apple Health arrives **by hand** (V2.1 §6) — a `north.health.v1` file from `server/health_export.py`, dropped into Settings. Screen Time stays manual. |
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
| V2.1 | The look: tile grid, colour, `/preview`, Apple Health by hand | **done** — see below |

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

Last gate (V2): `npm run check` 0 errors / 0 warnings · 388 unit tests green · lint clean ·
build clean · 99 e2e pass + 1 skipped · 12 server tests green.

### V2.1 — the look, and Apple Health by hand (see [`docs/V2.1.md`](docs/V2.1.md))

The owner's brief was "it looks kinda bland… utilize the full width in nice graphs in differing
sizes, more important fields should be bigger. also add a little colour." V2.1 answers it with the
board and nothing else: the structure, the metrics and the maths are untouched.

- **Tile grid, sized by weight.** One 12-column grid; a tile's span is its metric's canonical
  weight (`02-metrics.md` §4), so the biggest charts belong to the metrics that matter most, and
  hiding a metric in Settings hands its columns to its neighbours deterministically. The layout is
  a pure table (`BOARD` in `src/lib/dashboard.ts`), unit-tested row by row.
- **Four pillar hues.** `--pillar-{body,mind,attention,capital}` name the categories — body pine,
  mind indigo, attention teal, capital plum — on the band's name, its rule and the tile's edge.
  They are *semantic*: the hue says which part of life, the band tone still says how it is going,
  and the word is always beside the colour. Every hue is ≥ 4.5:1 on its surface in both themes.
- **Charts you can read.** The hero is a ring plus a 30-day area with the band rules drawn at
  60/75/90; tiles carry 14-day bars coloured by their own day's tone with the target as a
  hairline, or a sparkline when there is no room. All hand-written SVG on tokens.
- **`/preview` — a finished day.** The same board from `src/lib/sample.ts`: 120 days, all 19
  metrics, no gaps, nothing stored. Reachable at `/preview`, with `G P`, and from Settings.
- **`learned` asks what you learned again.** Ticking it on the board opens the one-line note
  inside the tile, which is what its score has always depended on.
- **Apple Health by hand.** The contract is `north.health.v1` — the same JSON a future iOS app
  would write. `server/health_export.py` (stdlib, streaming) turns Apple's 900 MB `export.xml`
  into it; Settings → Your data → Apple Health previews the plan, then writes it locally. A
  missing day stays a gap and a value you entered by hand is never overwritten.
- **Two display bugs fixed on the way.** A typed number (steps) printed `4000` where it should
  print `4 k`, because the row asked for cells it does not have; and a tile could print its unit
  twice (`Daylight days days`). Both now have unit tests.

Last gate (V2.1): `npm run check` 0 errors / 0 warnings · 428 unit tests green · lint clean ·
build clean · 127 e2e pass + 1 skipped · 27 server tests green.
Budget, first load (the gzipped responses the page actually requests, served by `serve.py`):
**73.0 KB JS + CSS on the dashboard, 74.2 KB on `/preview`, 69.9 KB on the log, 58.8 KB on
Settings** (limit 90 KB) · **font 30.0 KB** (limit 60 KB). V2.1 cost about 7 KB gzipped — the tile
board, the three chart components and the sample — so the headroom is now 17 KB, not 24 KB. Worth
knowing before the next feature.
Known deviation: at 1440 × 900 the board is 1173 px tall (1250 with the sample banner) — one short
scroll, not the zero the brief asked for. What is left is either a smaller chart or a target under
44 px; both are refused. Reported, not hidden (`docs/V2.1.md` §3).

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

The site is a prerendered static bundle served by `server/serve.py`.

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

Tests for the server (stdlib `unittest`):

```bash
uv run python -m unittest discover -s server
```

There is no CI and no hosting pipeline. The repository is source; the machine that serves the
build is the only machine that runs it.

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

The repository is source, not hosting. Nothing is published anywhere: no Pages site, no
workflow, no `github.io` URL. GitHub holds the code; the machine at home holds the app.

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
