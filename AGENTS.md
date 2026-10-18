# AGENTS.md — operating rules for the implementing agent

> ## ⚠️ Read [`docs/V2.md`](docs/V2.md) first.
> It is the **live brief** and it supersedes the v1 outline. The home screen is now a
> **categorised dashboard of charts**, not a list of rows; v1's list lives on at `/log`.
> **The four things to focus on, in order: design, data display, logging ease, data
> automation.** Do not spend effort on the old milestone plan in `docs/spec/08-build-plan.md`
> (M6–M9 are not planned) and do not treat the other `docs/spec/*` files as a mandate for
> screens — only for **metric values, scoring maths and tokens**, which stay canonical.

You are building **north**, a personal performance dashboard, from the docs in this folder.
The docs are the spec. Your job is execution, not product design.

> Integrity note for a fresh context: the v1 list design is finished and shipped. v2 is a
> deliberate re-design of the *home screen only*. Never delete v1: `/log` must keep working.


---

## 1. Iron rules

- **Do not re-decide locked decisions.** They are listed in `09-decisions.md`. If you believe one
  is wrong, write a note in your final report — do not silently deviate.
- **Never invent metrics, targets, or scores.** `02-metrics.md` is canonical. If a value is
  missing, stop and report; do not guess.
- **Never commit personal data** to the app repo. Demo data only, and it must be labelled.
- **No new runtime dependencies** without a one-line justification in the commit body.
  Banned outright: chart libraries, UI kits, state managers, date libraries, CSS frameworks,
  icon packs, analytics, CDN fonts.
- **No hardcoded colours, sizes, or fonts.** Use the tokens in `05-design.md`.
- **Types before UI.** Define the data model and pure functions first; components consume them.
- **Pure logic is tested.** Scoring, aggregation, date maths, merging and parsing need unit tests
  with the exact table rows from the spec. "Tested manually" is not a thing here.
- **One milestone at a time.** Do not start M(n+1) until every acceptance criterion of M(n) passes.
- **Small commits**, Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).

## 2. Working loop (per milestone)

1. Re-read the milestone in `08-build-plan.md` and the docs it references.
2. State (5 lines max) the files you will create or touch and the tests you will write.
3. Implement the smallest vertical slice a human could actually use.
4. Write the tests named in the milestone.
5. Run `npm run check && npm test && npm run build`. Fix everything you broke.
6. Self-review against the definition of done.
7. Report: what works, what is stubbed, what deviates, what needs deciding.

## 3. Definition of done (every milestone)

- [ ] `npm run check` — zero TypeScript errors, zero Svelte warnings.
- [ ] `npm test` — green, including the new tests.
- [ ] `npm run build` — static output builds with no warnings.
- [ ] Keyboard-only path works for every new interaction.
- [ ] Correct at 320 px and 1440 px wide.
- [ ] No layout shift on load; no console errors; no runtime network requests beyond self-hosted font.
- [ ] New UI uses tokens only; no magic numbers.
- [ ] Acceptance criteria pass literally, not approximately.
- [ ] `README.md` build instructions still accurate.

## 4. Performance budget (hard)

| Budget | Limit |
|---|---|
| JS + CSS gzipped, first load | ≤ 90 KB |
| Fonts | ≤ 60 KB total, self-hosted, `font-display: swap` |
| LCP on a 4× throttled phone | ≤ 1.2 s |
| Perceived latency per logged value | ≤ 50 ms (optimistic write) |
| Lighthouse | ≥ 95 performance, 100 accessibility, 100 best practices |

If a feature costs more than ~8 KB, it does not ship in V1.

## 5. Anti-patterns — reject on sight

- A save button, a form submit, or a modal for daily logging.
- Countdown timers, pomodoro timers, or stopwatches for study tracking.
- Calorie or macro tracking, body-fat percentage, water intake, mood scores.
- Shaming progress bars, streak-loss fireworks, guilt copy.
- Toast spam, confetti, emoji in the interface, icons where a word fits.
- Dark patterns: pre-checked values, silent defaults, auto-filling a missed day.
- Any load-time network request beyond the self-hosted font and optional sync.

## 6. Escalate (stop and report)

- Two docs contradict each other.
- A number you need is not in `02-metrics.md`.
- An acceptance criterion cannot be tested as written.
- The change would require a server, account, or paid service not already listed.

Otherwise decide, implement, and note the decision in your report. Prefer the simpler option.

## 7. Orientation for a fresh context

The project is **built and shipped**; you are not starting from zero. Do not scaffold anything.

```
src/routes/          +layout.svelte (shell, nav, theme, keyboard)
                     +page.svelte    the home screen — v2 dashboard
                     log/            v1's list (the full logger; must keep working)
                     week/  trends/  settings/
src/lib/metrics/     types, registry (canonical values), score, aggregate, dates, resolve
src/lib/store/       IndexedDB, days, settings, export, demo seed, session.svelte.ts (all state)
src/lib/ui/          the widget library: CellGroup/ChoiceRow/TriState/Bins/NumberField,
                     Row, ScoreHeader, Sparkline, HeatGrid, MetricChart, Sheet, Toast
src/styles/          tokens.css (the only place a value may be hardcoded), base.css
server/              serve.py (stdlib static server + ingest) and its tests
tests/unit/          pure logic, Vitest.  tests/e2e/  user-visible behaviour, Playwright
```

Everything you display comes from `resolveMetrics(settings)` plus a pure function in
`src/lib/`. If a figure on the dashboard cannot be traced to one of those, it is invented —
which the iron rules forbid.

### Working loop for V2

1. Re-read the part of [`docs/V2.md`](docs/V2.md) that covers what you are about to build.
2. State (5 lines max) the files you will touch and the tests you will write.
3. Build the smallest vertical slice a human could actually read at a glance.
4. Unit-test the pure logic; when you are unsure the tests are trustworthy, break the code to
   watch them fail, then fix it.
5. `npm run check && npm run lint && npm test && npm run build && npm run e2e` — all clean.
6. Look at it. Screenshot at 320 / 390 / 1440, light and dark, and judge it as a designer.
7. Update the README's status line, commit small, push.
