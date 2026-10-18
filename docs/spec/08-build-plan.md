# 08 — Build plan

Twelve milestones, ordered. **Do not begin M(n+1) until every acceptance line of M(n) passes.**
Estimates assume a competent agent working with these docs; they are not deadlines.

| # | Milestone | Est. | Ends with |
|---|---|---|---|
| M0 | Scaffold and deploy | 0.5 d | A live Pages URL with a parchment page |
| M1 | Data layer and dates | 1 d | Days persist across reloads |
| M2 | Registry, scoring, aggregation | 1 d | Green table-driven test suite, no UI |
| M3 | Today, widgets, keyboard | 2 d | A full manual log in under 20 s |
| M4 | Week, Trends, insights | 1.5 d | The Sunday review works |
| M5 | Settings, onboarding, presets | 1 d | Nothing is hardcoded |
| M6 | Sync | 1.5 d | Two devices converge |
| M7 | Automation | 1.5 d | Watch and PC fill the strip themselves |
| M8 | PWA, offline, print, a11y | 1 d | Works in a tunnel |
| M9 | Release | 0.5 d | Tagged v1.0, documented |

---

## M0 — Scaffold and deploy

**Deliverables**

- SvelteKit + TS strict + `adapter-static` + Vitest + Playwright.
- `src/styles/tokens.css` and `base.css` exactly as in `05-design.md`.
- `src/lib/metrics/types.ts` and `registry.ts` with all 19 metrics from `02-metrics.md` §3.
- `store/demo.ts` deterministic 120-day seed, reachable with `?demo=1`.
- `tests/unit/registry.test.ts` asserting the weight sum and the curve validity of every entry.
- `deploy.yml`, Pages enabled, `robots.txt`, noindex meta.

**Acceptance**

1. `npm run check && npm test && npm run build` are all clean, in CI as well as locally.
2. The Pages URL renders the token palette: 620 px column, hairline rules, no shadows.
3. `registry.test.ts`: `Σ weight === 1.00` (±1e-9); every metric's ids are unique; every metric has
   `lever`, `help`, `evidence`; weights match the table in `02-metrics.md` §4 exactly.
4. `?demo=1` renders 120 days deterministically (same output on two consecutive runs).
5. Lighthouse ≥ 95 on the deployed URL with only the demo screen.

**Out of scope:** any real metric UI.

---

## M1 — Data layer and dates

**Deliverables**

- `store/db.ts` (IndexedDB wrapper), `store/days.ts` (read/write/undo), `store/settings.ts`,
  `store/migrate.ts`, `store/export.ts`.
- `metrics/dates.ts`: `logicalDate`, `weekKey`, `monthKey`, `formatDate`, `parseDate`.
- Root layout loads settings + today's day on mount; a `?d=` param opens a past day.

**Acceptance**

1. `dates.test.ts` passes every row of `03-scoring.md` §8.4, including both year boundaries.
2. Log a value → reload → the value is still there and shows `src: 'manual'` and `locked: true`.
3. `write()` twice on the same field keeps the last value and pushes two undo entries.
4. Export JSON → wipe IndexedDB → import → byte-identical day documents.
5. CSV export has one row per day and one column per metric, `date` first.
6. A day written at 03:59 local lands on the previous logical date; at 04:01 on today.
7. Migration harness runs from version 1 → 2 with a fixture and is a no-op when current.

---

## M2 — Registry resolution, scoring, aggregation

**Deliverables**

- `resolve.ts` (registry + settings overrides → `ResolvedMetric[]`).
- `score.ts`, `aggregate.ts`, `derived.ts` — pure, no Svelte imports.
- `insights/rules.ts` with the five rules.

**Acceptance**

1. Every row of `03-scoring.md` §8.1, §8.2, §8.3 and §8.4 exists as a test and passes.
2. Property tests over 500 generated days: no `NaN`, no `Infinity`, no score outside `[0, 100]`,
   no score above 100 even with absurd overshoot.
3. Changing `proteinGPerKg` from 1.6 to 2.0 changes the protein target from 4 to 5 anchors and
   re-scores a fixed fixture day to a lower value.
4. `merge`-free: these modules never read the clock except through an injected `now` argument.
5. Insight rules: no card renders below the stated `n`; `insights.test.ts` covers the n=7 boundary.

---

## M3 — Today, widgets, keyboard

**Deliverables**

- All widgets from `04-ux.md` §3, `ScoreHeader`, `Sparkline`, `AutoCell`, `Toast`, `Banner`.
- Row ordering rule, dimming of logged rows, `+ n more` expander.
- `keyboard.ts` with the full map from `04-ux.md` §4 and the undo stack.
- `aria-live` score announcements; radiogroup semantics.

**Acceptance**

1. Playwright: from first paint, 9 simulated interactions complete a full manual log in **< 20 s**.
2. At 390 × 844 with 9 unlogged rows, the last unlogged row is reachable without scrolling, or the
   expander is fully inside the viewport. (Assert `boundingBox` of the last element vs viewport.)
3. Every interactive target is ≥ 44 × 44 px (assert all matching elements).
4. Keyboard-only: log a complete day without a mouse, then undo the last write with `⌘Z`.
5. Tri-state semantics: `null` → excluded and shown as unset; `false` → scored 0 and shown as `✗`.
   Assert the score differs between the two cases.
6. Tapping a logged row does not reorder the list within the same mount.
7. Toast appears once per write, auto-dismisses in 4 s, and is keyboard-reachable.
8. Zero network requests during the session (Playwright request listener).

---

## M4 — Week, Trends, insights

**Deliverables**

- `/week`: weekly metric lines with `met / on pace / behind`, pillar table with last week's delta,
  day grid, `+6 / −4` worded comparisons.
- `/trends`: sparkline per metric grouped by pillar, 30/90 toggle, consistency grid, insight cards.
- Day detail via `/?d=`, with read-only enforcement beyond 30 days.

**Acceptance**

1. Week score equals the hand-computed worked example in `03-scoring.md` §3 (±0.05), asserted in a test.
2. Removing the weigh-in from a fixture week changes the denominator from 0.90 to 0.87.
3. Charts are pure SVG: assert no `<canvas>` and no chart library in `package.json`.
4. Selecting a point renders its value in the row header and requires no hover.
5. Insight cards: each shows its `n`; the "because" word appears nowhere in the codebase
   (grep assertion in the test suite).
6. Changing a target in `settings` changes the Trends hit-rates on the next render.

---

## M5 — Settings, onboarding, presets

**Deliverables**

- Every `MetricDef` field except `id` editable; `hidden` list; weight editing; the `gentle/standard/strict`
  presets; theme and density; day cutoff; week start; export/import; delete-everything.
- Onboarding wizard with the 9 steps from `04-ux.md` §8.

**Acceptance**

1. Every editable field round-trips through IndexedDB and through a JSON export.
2. Changing a target shows `Re-scoring 412 days.` and the header score changes within one frame.
3. `strict` preset raises protein to 2.0 g/kg, social good to 20 min, distraction good to 60 min,
   and touches no weight.
4. Reset-to-defaults restores the registry values while keeping days untouched.
5. Onboarding is re-runnable from Settings; skipping leaves the registry defaults and shows the
   muted `using default targets — review` line.
6. Delete-everything requires typing `delete` and leaves the app in a clean onboarding state.

---

## M6 — Sync

**Deliverables**

- `sync/github.ts`, `sync/merge.ts`, `sync/queue.ts`, the PAT flow, the conflict sheet, the ledger.
- Settings → Automation shows last sync, pending count, token expiry and a `Sync now` action.

**Acceptance**

1. `merge.test.ts` covers: local-only, remote-only, newer-wins, lock-beats-newer, equal timestamps
   (deterministic tie-break by source precedence), and idempotent re-merge.
2. Simulated two-device test: device A logs `sleep_hours`, device B logs `protein`, both sync →
   both days contain both fields with correct `src`.
3. A manual edit on A is not overwritten by an ingest on B.
4. Offline write → reload offline → reconnect → the day is pushed exactly once (assert one commit).
5. `401` shows `Token expired — replace it in Settings` and never drops local data.
6. `403` with `X-RateLimit-Remaining: 0` backs off 60 s and retries once.

---

## M7 — Automation

**Deliverables**

- `automation/health/import.ts` (streaming `export.xml` → ingest files) with a fixture test.
- `collector/activitywatch.ts` + `categories.yaml` + systemd units.
- `automation/shortcuts/*.md`: the five recipes from `07-automation.md` §4.
- Ingest reader in the app: reads `ingest/**`, merges by precedence, writes the ledger, shows the
  last 10 ingests in Settings.

**Acceptance**

1. A 30-day fixture `export.xml` (≈ 2 MB, committed under `tests/fixtures/`) imports to exactly
   the expected per-day values, asserted row by row, including a session that crosses midnight.
2. Re-importing the same file changes nothing (idempotent), asserted by a deep-equal of the ledger.
3. The collector, run twice against a fixture ActivityWatch payload, produces identical output.
4. The collector's output contains exactly five keys and no string longer than 24 characters
   (assertion that no title/URL ever leaks).
5. An ingest that conflicts with a locked field is skipped and reported in the ledger.
6. Widgets show the source dot: `--ink-faint` for auto, `--warn` for overridden.

---

## M8 — PWA, offline, print, accessibility

**Deliverables**

- `manifest.webmanifest`, icon, service worker caching the shell and fonts only.
- `print.css`, a printable week page.
- Full a11y pass; the contrast unit test; 200 % zoom pass.

**Acceptance**

1. After one visit, offline logging works; a value written offline survives a reload offline.
2. Lighthouse: 100 accessibility, 100 best practices, ≥ 95 performance.
3. `axe` reports zero critical or serious issues on all six routes.
4. Contrast unit test passes for every token pair used for text, in both themes.
5. Print preview of `/week` is one page, black on white, no controls, footer present.
6. Root font-size 200 % causes no clipped or overlapping text at 320 px width.

---

## M9 — Release

**Deliverables**

- Public `north` repo with README (install, configure, deploy, automation setup), MIT licence,
  screenshots from demo data only.
- `north-data` created and documented in the README, with the PAT setup steps.
- Tag `v1.0.0`; a `CHANGELOG.md`; a one-page `SETUP.md` a human can follow in 20 minutes.

**Acceptance**

1. Fresh clone → `npm ci && npm run build` → deploys with no manual steps.
2. `SETUP.md` walked end to end on a clean machine by someone who has not read the other docs.
3. The README states the privacy model in one paragraph and links to `09-decisions.md`.
4. No personal data anywhere in the app repo (grep for a known real value returns nothing).

---

## Definition of done for v1.0

- [ ] All acceptance criteria above pass.
- [ ] 30 consecutive days of real logging with coverage ≥ 85 % (the user's own test).
- [ ] Median manual log time ≤ 20 s, measured in the app's own `elapsedMs` for a week.
- [ ] A full export exists in the repo's release assets or on disk.
- [ ] The user can explain the day score in one sentence without opening the app.

## Risks

| Risk | Mitigation |
|---|---|
| The score becomes a source of anxiety | Bands + coverage + rest days + weekly-over-daily framing (`01-brief.md` §3) |
| Logging fatigue after two weeks | The 2-tap rule and the auto strip; measure criterion 3 at day 30 |
| Health Auto Export changes its template | The `export.xml` importer is the durable fallback; the envelope is documented |
| ActivityWatch categorisation drifts | `categories.yaml` is user-editable and the ledger shows what was skipped |
| Scope creep toward a full health app | `09-decisions.md` V2 list; nothing enters V1 without removing something |
| Over-tuned targets that feel arbitrary | Targets are editable in Settings and the evidence line is shown next to each |
