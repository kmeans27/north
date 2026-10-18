# 09 — Decisions, open questions, backlog, risks

Locked decisions are binding. If you disagree with one, implement it anyway and argue in your report.

---

## 1. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Count blocks, never run timers | A forgotten stopwatch produces worse data than a retrospective count; measurement must survive real life |
| D2 | Coarse bins for phone and social, precision only for sleep and weight | False precision is friction; iOS exposes no API anyway |
| D3 | Missing is not zero; missing reduces coverage | Otherwise the user learns to log flattering lies |
| D4 | Toggles are tri-state: unset / yes / no | Distinguishes "did not do it" from "did not log it" |
| D5 | Weekly metrics never enter the daily score | Monday cannot fail a weekly goal |
| D6 | Three score levels only: day, week, month | More granularity invites over-reading noise |
| D7 | No metric may exceed 100 | Overshoot is not virtue; 11 h of sleep is not better than 8 |
| D8 | Coverage < 70 % marks the day `partial` and excludes it from streaks and insights | Puts the pressure on logging honestly, not on perfect days |
| D9 | Pure-auto metrics do not count toward coverage, but a 3-day gap raises a banner and marks days `partial` | Protects against watch failures without creating a hiding place |
| D10 | The composite is a weighted mean of present metrics; pillars are diagnostic only | One weighting, one number, no double-counting |
| D11 | Weights: Body 0.40 · Mind 0.28 · Attention 0.22 · Capital 0.10 | Matches the stated goals (muscle, studying) without letting money dominate |
| D12 | `learned` requires a written one-line note to be meaningful; the tick alone is worth 40 % of the metric | Input metrics are gameable; the artifact is the proof |
| D13 | Nutrition is four counters: protein anchors, creatine, greens, alcohol | The only four things that change the outcome for this goal |
| D14 | Alcohol target is exactly zero; a nonzero day is a hard zero for that metric | WHO: no safe level; "less" invites drift |
| D15 | Day cutoff defaults to 04:00 | Logging at 00:30 belongs to the day you just lived |
| D16 | Tri-state cells, absolute-value choice rows, no sliders, no dropdowns, no date pickers | The 2-tap rule |
| D17 | No save button anywhere; every write is optimistic with undo | A save button is a decision; there is no decision to make |
| D18 | Rows never reorder within a session | Fluidity beats cleverness |
| D19 | One accent colour, one font, two weights, no icons, no emoji | Timelessness is achieved by subtraction |
| D20 | Charts are hand-written SVG with a fixed zero baseline | Auto-zooming is how dashboards lie |
| D21 | No XP, badges, points, or leaderboards; only per-habit streaks and hit-rates | Anti-Goodhart: gamification corrupts self-reported data |
| D22 | Red appears only after 3 consecutive days below 40, or on the two hard-zero metrics | Shame is a bad feedback signal |
| D23 | Local-first IndexedDB; git is the sync layer; no server, no accounts | Free, private, versioned, works offline |
| D24 | Data repo is separate and private; app repo holds no personal data | Publishing the app must never publish the person |
| D25 | Collectors send aggregates only, never titles, URLs, or app names | Privacy is architectural, not a setting |
| D26 | Insight engine is deterministic rules with stated sample sizes; no generated text | A model that invents a correlation is worse than no insight |
| D27 | No date library, no chart library, no CSS framework, no state library | Every dependency is a future break and a byte budget loss |
| D28 | First paint must show data (demo seed in dev, real data in prod) | Nobody designs well against an empty screen |
| D29 | Kindle reading and phone screen time stay manual | No API exists; scrapers cost more than the tap saves |
| D30 | Targets are editable and every target shows its evidence line | A number the user disagrees with is worse than no number |

---

## 2. Open questions (need the human, do not block M0–M6)

| # | Question | Recommended | Impact if deferred |
|---|---|---|---|
| Q1 | Apple Health: Health Auto Export (paid, one-time) or the free `export.xml` import? | Paid app for sleep; the importer for the 12-month backfill | Without it, sleep — the highest-weighted metric — becomes manual. M7 only. |
| Q2 | GitHub account plan: is GitHub Pro available (Pages on a private repo)? | If yes: both repos private. If no: public app repo + private data repo | Affects README and `gh` commands in M9. No code impact. |

Everything else is decided.

---

## 3. V2 backlog (explicitly out of scope for v1.0)

Ordered by value per unit of complexity.

1. **Custom metrics UI** — add/remove metrics from Settings using the existing `MetricDef` schema.
   The schema already supports it; only the editor is missing.
2. **Obsidian daily-note export** — write a one-way Markdown note per week into the user's vault
   (`99_Log/`), containing the score, pillars, and the learning lines. Read-only, no writes back.
3. **Weekly review flow** — a guided 5-question Sunday walkthrough that writes a 3-line review note
   and, if the user wants, adjusts one target.
4. **Bank CSV import** for `savings_rate`, plus a category-rule editor.
5. **Android collector** (Digital Wellbeing is as closed as iOS; use the usage-stats API).
6. **Screen-time OCR shortcut** — screenshot → text extraction → event file. Only if the manual
   bins annoy after a month.
7. **Share-image export** of the week card (canvas, 1080 × 1350, demo-safe).
8. **CSV bulk import** for backfilling historical weight and sleep.
9. **Multi-profile support** — a profile switcher over the same storage, so the app is not
   single-user by construction.
10. **Correlation explorer** — a proper screen for the lagged-association rule, still
    deterministic and still labelled "correlation".

## 4. Explicitly rejected (do not build, ever)

- Calorie, macro, or food-diary tracking.
- Body-fat percentage, HRV dashboards, readiness scores, "biological age".
- AI coaching, LLM-generated summaries of the user's week.
- Social features, leaderboards, sharing streaks.
- Notifications that nag, reminders inside the app, email digests.
- Any backend, account system, or third-party analytics.
- Anything that requires the user to type the same number twice.

---

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Two weeks of enthusiasm, then abandonment | High | Fatal | 2-tap rule, auto strip, coverage over perfection, weekly framing |
| Score anxiety / over-optimising | Medium | High | `01-brief.md` §3 doctrine; rest days; red gated behind 3 days |
| Automation silently stops (expired PAT, watch not worn) | High | Medium | Ingest ledger, device-gap banner, `Test` buttons in Settings |
| Health app template drift | Medium | Medium | The `export.xml` importer is the durable path |
| Privacy leak via the collector | Low | High | Aggregates-only contract + the "no long strings" test in M7 |
| Data loss | Low | High | Git history, JSON export, no destructive pulls, no auto-delete |
| Over-engineering the sync layer | Medium | Medium | Per-field last-write-wins; no CRDTs, no vector clocks, no merge UI beyond a sheet |
| The dashboard becomes the distraction it measures | Medium | Medium | It is one screen with no feed, no content, and nothing to do except leave |

---

## 6. Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-17 | Initial specification. 19 metrics, 4 pillars, 10 milestones. |
