# 02 — Metric registry (canonical)

This file is the single source of truth for **what** is tracked, **what good looks like**, and
**how much each metric matters**. Nothing here may be invented elsewhere in the codebase.

19 metrics. 14 daily, 3 weekly, 2 monthly. Four pillars: **Body · Mind · Attention · Capital**.

---

## 1. Audit of the original list — what changed and why

| # | Original idea | Problem | Optimised metric | Default | Evidence |
|---|---|---|---|---|---|
| 1 | Time spent studying | Rewards passive sitting; timers get forgotten | `deep_blocks` (45-min undistracted blocks) + `learned` (proof) | 2 blocks/day; 1 learning event/day | ~4 h/day is the ceiling for deliberate practice (Ericsson; Newport) |
| 2 | Nutrition | Calorie tracking is a second job | `protein` (32 g anchors), `creatine`, `greens` (servings), `alcohol` | 4 anchors (≈1.6 g/kg at 80 kg), 5 servings, 0 drinks | Morton 2018; ISSN (3–5 g/day); WHO (≥400 g fruit+veg); WHO (no safe alcohol level) |
| 3 | Sleep | Duration alone misses the stronger lever | `sleep_hours` + `sleep_consistency` (7-day SD of bedtime) | 7.5 h; SD ≤ 30 min | AASM/SRS ≥ 7 h; UK Biobank: regularity predicts mortality better than duration |
| 4 | Activity | A daily gym goal is not a real goal | `strength_sessions` (per week) + `steps` (passive floor) | 2 sessions/wk; 7,000 steps | WHO/US PAG: ≥ 2 strength days; Lancet Public Health 2025: 7,000 steps ≈ −47 % mortality vs 2,000 |
| 5 | Kindle reading | No API exists; scrapers rot | `read` (boolean at ≥ 10 min) | 10 min floor, 30 min ideal | Yale 2016: 30 min/day ≈ −20 % mortality |
| 6 | Phone time | Total time is a weak signal | `phone_total` (bins) + `social_min` (bins), scored separately | ≤ 2.5 h; ≤ 30 min | 30-min restriction trials ↑ wellbeing; adult cohort break-point ≈ 150 min |
| 7 | Sunlight | Weather makes a daily goal unfair | `daylight_days` — weekly hit-rate of days with ≥ 20 min | 5 of 7 days | 5–30 min midday is sufficient for vitamin D synthesis |
| 8 | Weight | Daily weigh-ins are noise | `weight_trend` — 28-day EMA slope vs goal, weekly weigh-in | −0.5 %/wk (cut) | 0.5–1 %/wk preserves lean mass |
| 9 | Skill development | "Did you learn?" is unmeasurable alone | `learned` boolean + **one-line note** (the artifact) + auto coding minutes | 1/day | — |
| 10 | PC screen time | Hours are not the risk; leaks are | `distraction_min` (lower better) + `adult` (clean day) + productive minutes for display | ≤ 90 min; clean | — |
| 11 | Finances | Must never appear as a daily failure | `savings_rate` + `invested`, monthly | ≥ 20 % | 50/30/20 rule |

**Deliberately excluded:** calories, macros, protein grams as a daily number, body-fat %, mood,
water, HRV, resting heart rate, supplements beyond creatine, "productivity points", any
leaderboard or comparison metric.

**Deliberately added:** `coverage` (did I log?), `rest_day`, `sleep_consistency`, `savings_rate`.

---

## 2. Types

```ts
// src/lib/metrics/types.ts
export type Pillar = 'body' | 'mind' | 'attention' | 'capital';
export type Cadence = 'daily' | 'weekly' | 'monthly';
export type Widget = 'toggle' | 'counter' | 'segmented' | 'bins' | 'number' | 'note';
export type Curve = 'ramp' | 'step' | 'counter' | 'range' | 'trend';
export type Source = 'manual' | 'health' | 'collector' | 'derived';
export type MetricId =
  | 'sleep_hours' | 'sleep_consistency' | 'protein' | 'creatine' | 'greens' | 'alcohol'
  | 'steps' | 'strength_sessions' | 'daylight_days' | 'weight_trend'
  | 'deep_blocks' | 'learned' | 'read'
  | 'phone_total' | 'social_min' | 'distraction_min' | 'adult'
  | 'savings_rate' | 'invested';

export type Value = number | boolean | string | null;

export interface Bin { label: string; value: number }

export interface ScoreSpec {
  curve: Curve;
  target: number;            // the value that scores 100 for counter/step/ramp
  zeroAt?: number;           // ramp: value scoring 0
  good?: number;             // range: value at/under which score is 100
  bad?: number;              // range: value at/over which score is 0
  stretch?: number;          // display only: "above target" framing
  max?: number;              // counter: ignore values above this
  mode?: 'cut' | 'maintain' | 'bulk'; // trend, from settings
}

export interface MetricDef {
  id: MetricId;
  pillar: Pillar;
  label: string;             // "Protein anchors"
  short: string;             // ≤ 14 chars, used in compact strips
  unit: string;              // 'h' | 'g' | 'min' | 'servings' | 'blocks' | '%' | ''
  cadence: Cadence;
  widget: Widget;
  score: ScoreSpec | ((s: Settings) => ScoreSpec); // function only where derived from body metrics
  weight: number;            // global weight; see §4
  source: Source;
  countsTowardCoverage: boolean;
  autoField?: string;        // dotted path into the ingest payload, see 07-automation.md
  bins?: Bin[];
  step?: number;             // number widget increment
  decimals?: number;
  maxHint?: string;          // shown as a muted "ideal" note in Settings
  visible: boolean;
  lever: string;             // shown when this is the weakest link
  help: string;              // one line, Settings screen
  evidence: string;          // one line, Settings screen, collapsible
}
```

---

## 3. The registry

```ts
// src/lib/metrics/registry.ts
import type { MetricDef, Settings } from './types';

export const REGISTRY: MetricDef[] = [
  /* ─── BODY ────────────────────────────────────────────────────────────── */
  {
    id: 'sleep_hours', pillar: 'body', label: 'Sleep', short: 'Sleep', unit: 'h',
    cadence: 'daily', widget: 'number', step: 0.1, decimals: 1,
    score: { curve: 'ramp', zeroAt: 5.5, target: 7.5, stretch: 8.5 },
    weight: 0.10, source: 'health', countsTowardCoverage: false,
    autoField: 'sleep.asleepHours', visible: true,
    lever: 'Protect a fixed bedtime for three nights; do not try to fix the wake-up time first.',
    help: 'Total sleep per night, from Apple Health.',
    evidence: 'AASM/SRS: 7+ hours per night for adults.',
  },
  {
    id: 'sleep_consistency', pillar: 'body', label: 'Sleep regularity', short: 'Regular', unit: 'min',
    cadence: 'daily', widget: 'number', step: 5, decimals: 0,
    score: { curve: 'range', target: 30, good: 30, bad: 90 },
    weight: 0.03, source: 'derived', countsTowardCoverage: false,
    visible: true,
    lever: 'Shift bedtime in 15-minute steps toward a single anchor time. Regularity beats duration.',
    help: 'Standard deviation of your sleep start over the last 7 nights.',
    evidence: 'UK Biobank: sleep regularity predicts mortality more strongly than duration.',
  },
  {
    id: 'protein', pillar: 'body', label: 'Protein anchors', short: 'Protein', unit: '×32 g',
    cadence: 'daily', widget: 'counter',
    score: (s: Settings) => ({
      curve: 'counter',
      target: Math.max(3, Math.round((s.proteinGPerKg * s.bodyweightKg) / 32)),
      stretch: Math.round((2.0 * s.bodyweightKg) / 32),
    }),
    weight: 0.06, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Anchor protein to meals, not to willpower: 32 g at breakfast, lunch, dinner, plus one snack.',
    help: 'One tap per 32 g of protein. Not a diary — a count.',
    evidence: 'Morton 2018: ~1.6 g/kg/day maximises resistance-training gains; more is not better.',
  },
  {
    id: 'creatine', pillar: 'body', label: 'Creatine', short: 'Creatine', unit: '',
    cadence: 'daily', widget: 'toggle', score: { curve: 'step', target: 1 },
    weight: 0.02, source: 'manual', countsTowardCoverage: true, autoField: 'supplements.creatine',
    visible: true,
    lever: 'Put the tub where you make your first drink of the day. Consistency beats timing.',
    help: '3–5 g, any time of day.',
    evidence: 'ISSN: 3–5 g/day maintains elevated muscle creatine; timing is irrelevant.',
  },
  {
    id: 'greens', pillar: 'body', label: 'Greens & fruit', short: 'Greens', unit: 'servings',
    cadence: 'daily', widget: 'counter',
    score: { curve: 'counter', target: 5, max: 7 },
    weight: 0.02, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Buy fruit that needs no preparation. The barrier is friction, not appetite.',
    help: 'One tap per 80 g serving. Beans and juice count once, not twice.',
    evidence: 'WHO: ≥ 400 g (5 servings)/day; mortality benefit plateaus at five.',
  },
  {
    id: 'alcohol', pillar: 'body', label: 'Alcohol-free', short: 'No alcohol', unit: '',
    cadence: 'daily', widget: 'toggle', score: { curve: 'step', target: 1 },
    weight: 0.04, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Make the default drink a non-alcoholic one. Zero is the target, not "less".',
    help: 'Tap if you drank no alcohol today.',
    evidence: 'WHO 2023: no safe level of alcohol consumption for cancer risk.',
  },
  {
    id: 'steps', pillar: 'body', label: 'Steps', short: 'Steps', unit: 'k',
    cadence: 'daily', widget: 'number', step: 100, decimals: 0,
    score: { curve: 'ramp', zeroAt: 2500, target: 7000, stretch: 10000 },
    weight: 0.02, source: 'health', countsTowardCoverage: false,
    autoField: 'activity.steps', visible: true,
    lever: 'One 20-minute walk after a meal clears most of the gap.',
    help: 'Daily step count from Apple Health.',
    evidence: 'Lancet Public Health 2025: 7,000 steps/day ≈ 47 % lower all-cause mortality vs 2,000.',
  },
  {
    id: 'strength_sessions', pillar: 'body', label: 'Gym sessions', short: 'Gym', unit: '/wk',
    cadence: 'weekly', widget: 'counter', score: { curve: 'counter', target: 2, stretch: 3, max: 5 },
    weight: 0.05, source: 'health', countsTowardCoverage: false,
    autoField: 'activity.strengthSessions', visible: true,
    lever: 'Book the two sessions as appointments with fixed times. Two is the target, three is plenty.',
    help: 'Resistance sessions this week, counted from Apple Health workouts.',
    evidence: 'WHO/US PAG: muscle-strengthening on 2+ days per week.',
  },
  {
    id: 'daylight_days', pillar: 'body', label: 'Daylight days', short: 'Daylight', unit: 'days',
    cadence: 'weekly', widget: 'counter', score: { curve: 'counter', target: 5, max: 7 },
    weight: 0.03, source: 'derived', countsTowardCoverage: false,
    autoField: 'daylight.minutes', visible: true,
    lever: 'Take one call or one coffee outside before noon. Midday light is the point.',
    help: 'Days this week with 20+ minutes of daylight, from Apple Health.',
    evidence: '5–30 min of midday sun is sufficient for vitamin D synthesis; treat the watch value as a proxy.',
  },
  {
    id: 'weight_trend', pillar: 'body', label: 'Weight trend', short: 'Weight', unit: '%/wk',
    cadence: 'weekly', widget: 'number', step: 0.1, decimals: 1,
    score: (s: Settings) => ({ curve: 'trend', target: 0, mode: s.weightMode }),
    weight: 0.03, source: 'health', countsTowardCoverage: false,
    autoField: 'body.weightKg', visible: true,
    lever: 'Weigh in on the same morning every week, fasted, and read only the 28-day trend.',
    help: 'Slope of the 28-day EMA of your weight, compared with your goal.',
    evidence: '0.5–1 % of bodyweight per week preserves lean mass while cutting.',
  },

  /* ─── MIND ────────────────────────────────────────────────────────────── */
  {
    id: 'deep_blocks', pillar: 'mind', label: 'Deep blocks', short: 'Blocks', unit: '×45 min',
    cadence: 'daily', widget: 'segmented', score: { curve: 'counter', target: 2, stretch: 4, max: 4 },
    weight: 0.13, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Start the first block before opening anything with a feed in it.',
    help: 'Undistracted 45-minute blocks. No timer: count them at the end of the day.',
    evidence: 'Deliberate practice research: elite performers cap at ~4 h/day of intense work.',
  },
  {
    id: 'learned', pillar: 'mind', label: 'Learned something', short: 'Learned', unit: '',
    cadence: 'daily', widget: 'toggle',
    score: { curve: 'step', target: 1 },   // special: note-dependent, see the note below
    weight: 0.09, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Write one line about the thing you learned. The note is the metric; the tick is not.',
    help: 'Tap if you learned something today. Add one line: what it was.',
    evidence: 'Input metrics are gameable; a written artifact is not.',
  },
  {
    id: 'read', pillar: 'mind', label: 'Read 10+ min', short: 'Reading', unit: '',
    cadence: 'daily', widget: 'toggle', score: { curve: 'step', target: 1 },
    weight: 0.06, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Keep the Kindle where you sit down, not where you sleep.',
    help: 'A book, not a feed. 10 minutes is the floor; 30 is the target.',
    evidence: 'Yale 2016: 30 min of book reading per day ≈ 20 % lower mortality over 12 years.',
  },

  /* ─── ATTENTION ───────────────────────────────────────────────────────── */
  {
    id: 'phone_total', pillar: 'attention', label: 'Phone time', short: 'Phone', unit: '',
    cadence: 'daily', widget: 'bins',
    score: { curve: 'range', target: 2.5, good: 2.5, bad: 4.5 },
    weight: 0.05, source: 'manual', countsTowardCoverage: true, visible: true,
    bins: [
      { label: '≤ 2h', value: 1.5 }, { label: '2–3h', value: 2.5 },
      { label: '3–4h', value: 3.5 }, { label: '4–5h', value: 4.5 },
      { label: '5h+', value: 6 },
    ],
    lever: 'Move the two worst apps off the home screen. Bins, not minutes — precision here is fake.',
    help: 'From iOS Screen Time, rounded to a bin.',
    evidence: 'There is no public API for iOS screen time; coarse bins are deliberate.',
  },
  {
    id: 'social_min', pillar: 'attention', label: 'Social media', short: 'Social', unit: 'min',
    cadence: 'daily', widget: 'bins',
    score: { curve: 'range', target: 30, good: 30, bad: 90 },
    weight: 0.07, source: 'manual', countsTowardCoverage: true, visible: true,
    bins: [
      { label: '≤ 30m', value: 15 }, { label: '30–60m', value: 45 },
      { label: '1–2h', value: 90 }, { label: '2h+', value: 150 },
    ],
    lever: 'The 30-minute ceiling has the best evidence behind it of anything on this screen.',
    help: 'Total time on social apps today, from iOS Screen Time.',
    evidence: 'Restricting use to 30 min/day improved wellbeing in randomised trials.',
  },
  {
    id: 'distraction_min', pillar: 'attention', label: 'Distraction', short: 'Leaks', unit: 'min',
    cadence: 'daily', widget: 'number', step: 15, decimals: 0,
    score: { curve: 'range', target: 90, good: 90, bad: 240 },
    weight: 0.05, source: 'collector', countsTowardCoverage: true,
    autoField: 'pc.distractionMinutes', visible: true,
    lever: 'Block the top three distracting domains at the DNS or hosts level, not by intention.',
    help: 'Minutes in the distracting category on your computer, measured locally.',
    evidence: 'Measured behaviour beats recall; the collector never leaves the category totals.',
  },
  {
    id: 'adult', pillar: 'attention', label: 'Clean day', short: 'Clean', unit: '',
    cadence: 'daily', widget: 'toggle', score: { curve: 'step', target: 1 },
    weight: 0.05, source: 'collector', countsTowardCoverage: true,
    autoField: 'pc.cleanDay', visible: true,
    lever: 'Remove the trigger, not the resolve: block at the network layer and keep the phone out of the room.',
    help: 'No adult content today. Computed locally by the collector; nothing is uploaded.',
    evidence: 'A hard zero is the only honest target for this one.',
  },

  /* ─── CAPITAL ─────────────────────────────────────────────────────────── */
  {
    id: 'savings_rate', pillar: 'capital', label: 'Savings rate', short: 'Saved', unit: '%',
    cadence: 'monthly', widget: 'number', step: 1, decimals: 0,
    score: { curve: 'ramp', zeroAt: 0, target: 20, stretch: 30 },
    weight: 0.07, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Automate the transfer on payday. A rate you have to remember is not a rate.',
    help: 'Share of this month\'s net income that you did not spend.',
    evidence: '50/30/20: 20 % of net income to savings and investment.',
  },
  {
    id: 'invested', pillar: 'capital', label: 'Invested this month', short: 'Invested', unit: '',
    cadence: 'monthly', widget: 'toggle', score: { curve: 'step', target: 1 },
    weight: 0.03, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Put the contribution on an automatic schedule so the decision is made once.',
    help: 'Tap if money went into an investment this month.',
    evidence: 'Consistency of contribution dominates timing.',
  },
];
```

**Special case — `learned` and its note.** The tick alone is not proof. Implement
`scoreMetric` so that `learned` returns: `100` when the day has a non-empty note, `40` when ticked
with no note, `0` when explicitly unticked, `null` when unset. This is the only metric with a
note-dependent score, and it is the reason the daily note field exists.

**Other notes on the code above**

- `score` is a function only for the three body-derived metrics (`protein`, `weight_trend`).
  Everything else is a literal so it can be copy-reviewed against this document.
- `Settings` must carry at minimum: `bodyweightKg`, `proteinGPerKg`, `goalWeightKg`,
  `weightMode`, `dayCutoffHour`, `weekStartsOn`.
- Settings overrides are stored **outside** this file and merged at load (`06-architecture.md` §5).
  Never mutate `REGISTRY` at runtime.

---

## 4. Weights

Weights are global and sum to **1.00**. They drive the composite score, normalised over the
metrics that are present. Pillar scores are computed separately by normalising within the pillar,
and are for diagnosis only (never multiply pillar weight × metric weight — one weighting only).

| Pillar | Metrics and weights | Pillar total |
|---|---|---|
| **Body** | sleep_hours .10 · sleep_consistency .03 · protein .06 · creatine .02 · greens .02 · alcohol .04 · steps .02 · strength_sessions .05 · daylight_days .03 · weight_trend .03 | **0.40** |
| **Mind** | deep_blocks .13 · learned .09 · read .06 | **0.28** |
| **Attention** | phone_total .05 · social_min .07 · distraction_min .05 · adult .05 | **0.22** |
| **Capital** | savings_rate .07 · invested .03 | **0.10** |

Present-weight sums used by the aggregation: daily = **0.79**, weekly = **0.11**, monthly = **0.10**.

Rationale, so nobody "fixes" these later: sleep and deep work are the two highest-leverage inputs
in the user's stated goal (muscle + studying) and carry the most weight. Alcohol sits at .04
because it is a hard zero with outsized downstream effects. Capital is deliberately small — it is
monthly, and de-motivating someone for a month over 15 % instead of 20 % saved is bad design.

---

## 5. Derived metrics

Computed on read; never stored. All are pure functions over `Day[]`.

| Derived | Formula | Used by |
|---|---|---|
| `logicalDate(now, cutoffHour=4)` | `now.hour < cutoff ? date - 1d : date` in the user's local tz | every write |
| `coverage(day)` | `Σ weight of present metrics with countsTowardCoverage / Σ weight of those same metrics` | day/week/month |
| `sleepConsistency(days)` | `stdevMinute(sleep start time)` over the last 7 logical days with sleep data | `sleep_consistency` |
| `weekKey(date)` | ISO week, but shifted so the week starts on `settings.weekStartsOn` (default Monday) | weekly metrics |
| `strengthSessions(week)` | count of workouts whose `HKWorkoutActivityType` ∈ {FunctionalStrengthTraining, TraditionalStrengthTraining, CrossTraining, HighIntensityIntervalTraining} | `strength_sessions` |
| `daylightDays(week)` | days in the week with `daylight.minutes ≥ 20` | `daylight_days` |
| `weightEma(days)` | EMA over weigh-ins with α = 2/(28+1) | `weight_trend` |
| `weightSlopePctPerWeek(days)` | `(ema[last] − ema[last−14]) / ema[last−14] / 4 weeks × 100` using EMA values 14 days apart | `weight_trend` |
| `weightStale(days)` | days since last weigh-in ≥ 10 | UI nudge; metric excluded |
| `habitStreak(metricId)` | consecutive logical days meeting the metric, reset by any miss **and** by a `partial` day | streaks |
| `deviceGap(metricId)` | no auto value for ≥ 3 consecutive days | banner + marks days `partial` |
| `restDay(date)` | flag stored on the day; restricts the metric set for scoring to sleep_hours, protein, greens, read | scoring |
| `dayScore`, `weekScore`, `monthScore` | see `03-scoring.md` | headers |

**Device-gap rule.** Pure-auto metrics (`sleep_hours`, `sleep_consistency`, `steps`,
`strength_sessions`, `daylight_days`, `weight_trend`) have `countsTowardCoverage: false`, so a
missing watch never tanks the score. To stop that becoming a hiding place, a 3-day gap raises a
persistent banner ("Watch data missing for 3 days — scores are less reliable") and marks the
affected days `partial`, which excludes them from streaks and insights.

---

## 6. Insights engine

Deterministic rules over the user's own history. Maximum **five** cards, ordered by importance.
Every card states its sample size. Nothing is generated, summarised, or phrased by a model.

| # | Rule | Condition to render | Copy shape |
|---|---|---|---|
| 1 | **Weakest link** | always (28-day window) | `Weakest link: Attention · 58` + the `lever` of the lowest-scoring metric inside that pillar |
| 2 | **Momentum** | pillar 7d − prior 7d ≥ 4 points, top 2 by absolute delta | `Mind is up 9 points on last week` |
| 3 | **Lagged association** | for driver ∈ {sleep_hours, alcohol, phone_total, social_min, strength_sessions} × outcome ∈ {deep_blocks, dayScore}: ≥ 7 days in each bucket, difference ≥ 10 % (or ≥ 8 points) | `On days after 7 h+ of sleep you average 2.1 deep blocks; after under 7 h, 0.9. (n = 34 days. Correlation, not causation.)` |
| 4 | **Slipping habit** | habit hit-rate over 30 days < 70 % | `Greens met 12 of 30 days. The lever: keep fruit on the counter.` |
| 5 | **Record** | a new best week, longest streak, or 28-day weight milestone | `Best week so far: 8–14 October · 84` |

Rules for the engine:

- Never render a card without its `n`.
- Never claim causation. The word "because" is banned; use "on days when".
- Never show a card that would make a single bad day feel like a verdict.
- If there is not enough history, show one card: `Not enough history yet — insights appear after 14 logged days.`

---

## 7. Evidence appendix

| Claim | Source |
|---|---|
| Protein ~1.6 g/kg/day maximises resistance-training gains | Morton et al., *BJSM* 2018 (meta-analysis, 49 studies) |
| 1.5–1.6 g/kg/day also optimal for strength | Nunes et al. 2022; *J Strength Cond Res* dose-response meta-analysis |
| Creatine 3–5 g/day maintains elevated muscle stores | ISSN position stands (2007, 2017) |
| No safe level of alcohol consumption for cancer risk | WHO, *Lancet Public Health* 2023; IARC Group 1 carcinogen |
| ≥ 400 g / 5 servings of fruit and vegetables per day | WHO healthy diet guidance; BMJ 2014 (threshold at five servings) |
| Adults need 7+ hours of sleep per night | AASM/SRS joint consensus, 2015 |
| Sleep regularity predicts mortality better than duration | UK Biobank, *SLEEP* 2023 (60,977 participants) |
| Muscle-strengthening on 2+ days per week | WHO 2020 guidelines; US Physical Activity Guidelines 2nd ed. |
| 7,000 steps/day ≈ 47 % lower all-cause mortality vs 2,000 | *Lancet Public Health* 2025 (57 studies) |
| 0.5–1 % bodyweight loss per week preserves lean mass | Nutrition reviews 2018/2021; CDC weight-loss guidance |
| 30 min of book reading/day ≈ 20 % lower mortality | Bavishi et al., Yale, *Social Science & Medicine* 2016 |
| 30 min/day social media ceiling | Hunt et al. 2018; Iowa State 2023 RCT |
| ~4 h/day is the ceiling for deliberate practice | Ericsson; Newport, *Deep Work* |
| 20 % of net income to savings | 50/30/20 rule (Warren & Tyagi) |
