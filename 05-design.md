# 05 — Design system

Concept: **a quiet printed page.** Ink on paper, hairline rules, one accent, generous whitespace,
tabular figures. No shadows, no gradients, no glass, no icons where a word fits, no emoji.
The numbers are the ornament.

Everything here is a token. `AGENTS.md` forbids hardcoded colours, sizes, and fonts.

---

## 1. Tokens

`src/styles/tokens.css` — copy verbatim.

```css
:root {
  /* palette — light (default) */
  --paper:        #FAF9F6;
  --paper-sunken: #F3F1EC;
  --ink:          #16171A;
  --ink-muted:    #6B6A66;
  --ink-faint:    #A9A7A0;
  --rule:         #E4E1DA;
  --rule-strong:  #CFCBC2;
  --accent:       #2F5D50;   /* pine */
  --accent-soft:  #DCE6E2;
  --warn:         #9A6B2F;   /* ochre */
  --bad:          #8C3B32;   /* brick */

  /* spacing — 4 px base */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 20px; --s-6: 24px; --s-8: 32px; --s-10: 40px; --s-12: 48px; --s-16: 64px;

  /* type */
  --font-ui:      'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-figures: ui-monospace, 'SF Mono', 'JetBrains Mono', monospace;
  --fs-11: 11px; --fs-12: 12px; --fs-13: 13px; --fs-14: 14px;
  --fs-16: 16px; --fs-20: 20px; --fs-24: 24px; --fs-56: 56px;
  --ls-label: 0.08em;
  --lh-tight: 1.15; --lh-body: 1.5;

  /* geometry */
  --r-0: 0px; --r-1: 2px; --r-2: 4px;
  --bw-hair: 1px;
  --row-h: 52px;
  --tap-min: 44px;
  --measure: 620px;

  /* motion */
  --t-fast: 120ms; --t-base: 180ms; --t-slow: 240ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);

  color-scheme: light;
}

:root[data-theme='dark'] {
  --paper:        #111214;
  --paper-sunken: #17181B;
  --ink:          #E8E6E1;
  --ink-muted:    #9A9892;
  --ink-faint:    #6A6963;
  --rule:         #26282C;
  --rule-strong:  #3A3D42;
  --accent:       #7FB3A0;
  --accent-soft:  #1E2A27;
  --warn:         #C99A5B;
  --bad:          #C47066;
  color-scheme: dark;
}

@media (prefers-reduced-motion: reduce) {
  :root { --t-fast: 0ms; --t-base: 0ms; --t-slow: 0ms; }
}
```

Rules:

- `--accent` is the only saturated colour and it appears at most twice per screen.
- `--warn` and `--bad` appear only per `03-scoring.md` §4.
- Never use pure black or pure white.
- Never put text in `--ink-faint`.

## 2. Type

Self-hosted **Inter** variable, latin subset, ≤ 32 KB woff2, `font-display: swap`, in `public/fonts/`.
Figures use the system monospace stack so numerals are tabular and cost nothing.

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-var-latin.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
}
```

| Role | Size | Weight | Font | Extra |
|---|---|---|---|---|
| Day score | 56 px | 400 | figures | tabular, `--lh-tight` |
| Secondary score | 20 px | 400 | figures | — |
| Section label | 11 px | 500 | ui | uppercase, `--ls-label`, `--ink-muted` |
| Row label | 14 px | 400 | ui | — |
| Row value | 14 px | 400 | figures | `font-variant-numeric: tabular-nums` |
| Prose | 13 px | 400 | ui | `--lh-body`, max-width 62ch |
| Meta / source dot | 11 px | 400 | ui | `--ink-muted` |

No italics except the date line (`Thursday, 17 October` may be roman — italics are optional and
must never be applied to numerals). Two weights only: 400 and 500.

## 3. Layout

- Single column, `max-width: var(--measure)` (620 px), centred, `padding: 0 var(--s-5)`.
- Sections separated by a `1px solid var(--rule)` full-bleed rule, with `var(--s-6)` above and below.
- No cards. No boxes. No border-radius above 4 px.
- 8 px vertical rhythm; label-to-content gap is always `var(--s-2)`.
- Left-aligned labels, right-aligned values in the same row; the control column is a fixed grid
  track so cells align across rows.
- Top bar 56 px, hairline bottom rule, wordmark `north` in 14 px/500 lower-case.
- Desktop (> 900 px): the same single column, but the score header and the weakest link sit
  side by side in a 2-column grid with a vertical hairline between.

## 4. Components

| Component | Spec |
|---|---|
| `Rule` | `border-top: 1px solid var(--rule)` |
| `SectionLabel` | 11 px, uppercase, `--ls-label`, `--ink-muted`, `letter-spacing`, with a right-aligned meta count |
| `Row` | `min-height: var(--row-h)`, `display: grid`, `grid-template-columns: 1fr auto`, `align-items: center`, hairline bottom rule. Logged rows: label and value in `--ink-muted`. |
| `TriState` | 3 cells, 36 × 36, 1 px rule between, `--r-1`. States: empty `·` (`--ink-faint`), `✓` (`--accent`), `✗` (`--bad`). Selected cell gets `--paper-sunken` fill and a 1 px `--ink` outline. |
| `ChoiceRow` | N cells, 36 px tall, min-width 34 px, growing to fit. Selected: `--paper-sunken` + 1 px `--ink` outline + `--ink` text; unselected: `--ink-muted`. |
| `Bins` | Same as `ChoiceRow` but cells are auto-width with 13 px labels and 12 px horizontal padding. |
| `NumberField` | `−` / `+` 44 × 44 buttons with 1 px outline, value between them in figures, tap value to type. `inputmode="decimal"`. |
| `NoteField` | 1 line, no visible border except a bottom hairline, placeholder `what did you learn`, 400 char cap |
| `AutoCell` | 11 px label above a 14 px figure, plus a 4 px source dot (`--accent` manual, `--ink-faint` auto, `--warn` overridden) |
| `ScoreHeader` | Three figures with 11 px labels beneath, plus a 100 × 24 sparkline to the right on desktop |
| `Sparkline` | SVG, `viewBox` normalised, 1 px `--accent` stroke, no axis, optional target hairline in `--rule-strong`, target zone tinted `--accent-soft` at 40 % opacity using a `fill` rect |
| `HeatGrid` | 7 columns × n rows of 10 × 10 px cells, 2 px gap, fill opacity = score/100 in `--accent`, empty cells `--rule` |
| `Toast` | bottom-left, 13 px, `--paper` background, 1 px `--rule`, max width 280 px, auto-dismiss 4 s, one undo link |
| `Sheet` | bottom sheet on mobile, right-side panel on desktop, 1 px top/left rule, no shadow, 180 ms transform |
| `Banner` | full-width, `--paper-sunken`, 13 px, with an optional inline link; used only for device gap and sync error |
| `PrimaryAction` | there is no primary action. The app has no submit buttons anywhere. |

Icons: none. Where a control needs a symbol, use `·` `✓` `✗` `−` `+` `←` `→`. Nothing else.

## 5. Charts

- All charts are hand-written SVG. No library, no canvas except a future share-image export.
- One chart, one idea: a line, a grid, or a bar. No dual axes, no pies, no gauges, no donuts.
- Vertical scale always starts at the metric's `zeroAt` or 0, never auto-zoomed to make noise
  look dramatic. If a range would be misleading, use a grid instead of a line.
- Target is always a hairline `--rule-strong` rule with a 11 px `target 7.5` label at the right end.
- Hover tooltips are forbidden. A pointer/tap selects the nearest point and renders the value in
  the row's header line.
- Axis labels only at the first and last point, 11 px `--ink-faint`. No gridlines except the
  target rule and, on the week view, a baseline.
- Empty span: a flat hairline with a gap, never an interpolation across missing days.

## 6. Motion

| Event | Motion |
|---|---|
| Write a value | 1 px `--accent` line draws along the row baseline, 180 ms, left → right |
| Score changes | none. The number is replaced instantly. |
| Sheet open/close | translateY 8 px + opacity, 180 ms `--ease` |
| Toast in/out | opacity only, 120 ms |
| Route change | 120 ms crossfade, no slide |
| Reduced motion | everything above becomes 0 ms; no transitions are load-bearing |

Nothing animates on initial page load except a single 400 ms opacity fade of the score header.
Numbers never roll, count up, or tick.

## 7. Print

`src/styles/print.css` — one page for the Sunday review:

- `@page { margin: 14mm }`, white background, black ink, no nav, no interactive controls.
- Score header, pillar table, weekly metric lines, and the day grid.
- Footer: `north · week of 13 October 2026`.
- Charts render at print resolution; sparklines keep their strokes at 0.5 pt.

## 8. Accessibility rules baked into the design

- Every interactive cell is ≥ 44 × 44 px including padding (verified with a Playwright size assertion).
- Focus ring token: `outline: 2px solid var(--accent); outline-offset: 2px;` — never removed.
- The band word is always rendered; colour is decoration.
- `--ink-faint` is for rules and dots only, never for text.
- Contrast floor: body text ≥ 4.5:1 in both themes; verify with a unit test that computes contrast
  for every token pair used.
- Layout must survive 200 % browser zoom and `font-size: 200 %` on the root without clipping.
