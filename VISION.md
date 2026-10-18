# north — vision and logging spec

This file is the product owner's direction, written down, plus the per-metric
logging and display spec derived from the canonical docs (`02-metrics.md`,
`04-ux.md`). It exists so that a context reset never loses the *why*.

---

## 1. What north is (owner's words, 2026-10-18)

> A simple performance dashboard used to monitor and track performance from
> different fields — basically from the most important parts of one's life.
>
> The logging must be **really, really fast and satisfying** to do. Compared to
> a habit tracker it should **outclass** them, because habit trackers are built
> to track *habits* — not the overall performance of the small, important parts
> that affect our performance in life.
>
> Logging must be **fast, simple but effective**. By monitoring all the
> performances, one should clearly see **at one grasp** what is going on and
> what needs doing.
>
> **Focus on the basics first:** nail how every performance is *logged* and how
> it is *displayed* on the site, before adding weekly plans and the rest.
> **Give the UI big work.**
>
> Tooling: owner prefers **uv + self-hosted Python** over the current
> npm + GitHub Pages setup. See §5 — recorded as an open decision, not yet
> acted on.

**The one-line test of every change:** does it make the daily log faster, more
satisfying, or more glanceable? If not, it is not the next thing.

---

## 2. The two moments

| Moment | Where | Budget |
|---|---|---|
| Daily log | Phone, ~21:30 | ≤ 20 s, ≤ 2 taps per metric, 1 tap in the common case |
| Weekly review | Desktop, Sunday | One grasp: score, pillars, one thing to fix |

Automatic metrics (watch, computer) must never ask for a tap. Manual metrics
must never ask for a second one.

---

## 3. How every metric is logged

Source: `src/lib/metrics/registry.ts` (= `02-metrics.md` §3) and `04-ux.md` §3.
Values are canonical; nothing here is invented.

| Pillar | Metric | Cadence | Widget | How you log it | Taps |
|---|---|---|---|---|---|
| Body | Sleep | daily | NumberField | Steppers (±0.1 h) or type; auto from Apple Health | auto |
| Body | Sleep regularity | daily | NumberField | Derived from 7 nights; read-only in practice | auto |
| Body | Protein anchors | daily | ChoiceRow | Tap one cell `0 1 2 3 4 5` (one per 32 g) | 1 |
| Body | Creatine | daily | TriState | Tap `✓`; tap `·` to clear | 1 |
| Body | Greens & fruit | daily | ChoiceRow | Tap one serving cell `0…5` | 1 |
| Body | Alcohol-free | daily | TriState | Tap `✓` on a dry day | 1 |
| Body | Steps | daily | NumberField | Auto from Apple Health; editable | auto |
| Body | Gym sessions | weekly | ChoiceRow | Tap session count for the week | 1 |
| Body | Daylight days | weekly | ChoiceRow | Derived (20+ min daylight days) | auto |
| Body | Weight trend | weekly | NumberField | Weekly weigh-in; 28-day EMA slope | 1/wk |
| Mind | Deep blocks | daily | Segmented | Tap `0 1 2 3+` (`3+` stores 3.5) | 1 |
| Mind | Learned something | daily | TriState + NoteField | Tap `✓`, then one line of text | 1 + note |
| Mind | Read 10+ min | daily | TriState | Tap `✓` | 1 |
| Attention | Phone time | daily | Bins | Tap the bin `≤2h … 5h+` | 1 |
| Attention | Social media | daily | Bins | Tap the bin `≤30m … 2h+` | 1 |
| Attention | Distraction | daily | NumberField | Auto from the PC collector; ±15 min | auto |
| Attention | Clean day | daily | TriState | Auto from the collector | auto |
| Capital | Savings rate | monthly | NumberField | Type this month's % once | 1/mo |
| Capital | Invested this month | monthly | TriState | Tap `✓` | 1/mo |

**Rules that make it fast** (`04-ux.md` §2–§3):

- Order: unlogged manual rows first, in registry order; logged rows dim in place.
  **Nothing re-orders under your finger.**
- One tap sets an absolute value — never incremental, never a slider, never a
  dropdown, never a date picker.
- A tap writes optimistically in ≤ 16 ms and settles visually in 180 ms.
- Undo is a 4 s toast bottom-left; `⌘Z` works; never a modal.

---

## 4. How every metric is displayed

The same registry drives the display, so logging and display can never drift.

| Surface | Shows | Rule |
|---|---|---|
| Today header | day score, 7-day average, streak, 30-day sparkline | One honest number in ~one glance |
| Today rows | label + the control (logged rows show the value, dimmed) | The value *is* the control |
| Automatic strip | `Sleep 7.4h · Steps 8.2k · Daylight 34m · Leaks 71m · Weight −0.4%/wk` | Source dot per item; tap opens a 200 px sheet |
| Weakest link | pillar · score — one sentence on what to fix | Never a shaming bar |
| Week | week score, `●` dots per counter, pillar table, 7-day grid | `met / on pace / behind`, quoted as a word |
| Trends | 30/90-day sparkline per metric, insight cards with `n` | Keyword stepping, no hover-only data |

**Hard display rules** (`01-brief.md`, `05-design.md`):

- Missing data is **never** zero — an absent value leaves a gap, not a dip to 0.
- Auto vs manual is always visibly different (source dot / `--ink-muted`).
- Words, not colour alone: a band is always spelled out (`Strong`, `Slipping`).
- No emoji, no confetti, no XP, no streak-loss fireworks, no guilt copy.
- Tokens only — no hardcoded colour, size or font (`05-design.md`).

---

## 5. Open decisions (do not act without the owner)

1. **Stack: npm/SvelteKit vs uv/Python.** The spec (`06-architecture.md`) and
   four shipped milestones are SvelteKit + TypeScript with zero runtime
   dependencies, deployed statically. The owner leans toward uv + self-hosted
   Python. Recorded here; the current stack keeps shipping until the owner
   decides. A Python rewrite would discard M0–M4 and the ≤ 90 KB budget story.
2. **Milestone order.** The build plan puts Week/Trends (M4) before Settings
   (M5). The owner's direction is "basics and display first," so the next large
   investment should be the **Today log + display polish**, not weekly plans.
   M4 is already written; it lands as a checkpoint, then the focus shifts back
   to the daily log.
