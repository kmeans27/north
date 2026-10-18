# 03 — Scoring

Pure functions. No UI concerns. Every rule here is unit-tested with the tables at the end.
Implementation lives in `src/lib/metrics/score.ts` and must not import Svelte or any browser API.

---

## 1. Curve primitives

`clamp(x, 0, 1)` returns `x` limited to `[0, 1]`.

### 1.1 ramp — higher is better, with a floor

```
scoreRamp(v, zeroAt, target) =
  if target == zeroAt:  v >= target ? 100 : 0
  else:                 100 × clamp((v − zeroAt) / (target − zeroAt), 0, 1)
```

Values above `target` score 100. Overshoot never earns more than 100 — the `stretch` value is
shown as text only ("1.2 h above target").

### 1.2 step — binary

```
scoreStep(v) = (v === true || v === 1) ? 100 : 0
```

### 1.3 counter — count toward a target

```
scoreCounter(v, target) = 100 × clamp(v / target, 0, 1)
```

### 1.4 range — lower is better

`good` must be < `bad`.

```
scoreRange(v, good, bad) =
  if good == bad:      v <= good ? 100 : 0
  else if v <= good:   100
  else if v >= bad:    0
  else:                100 × (1 − (v − good) / (bad − good))
```

### 1.5 trend — weight, weekly

`slope` is the 28-day EMA slope in **percent of bodyweight per week**, rounded to 2 decimals.
`mode` comes from `settings.weightMode`.

```
scoreTrend(slope, mode):

  mode = 'cut'          // goal: lose fat, keep muscle
    slope <= -2.0                       → 40
    -2.0 <  slope <  -1.0               → 70 + 30 × (slope + 2.0) / 1.0     // 70 → 100
    -1.0 <= slope <= -0.2               → 100
    -0.2 <  slope <   0.4               → 100 × (0.4 − slope) / 0.6          // 100 → 0
    slope >= 0.4                        → 0

  mode = 'maintain'     // goal: stay put
    |slope| <= 0.3                      → 100
    0.3 < |slope| < 1.2                 → 100 × (1.2 − |slope|) / 0.9        // 100 → 0
    |slope| >= 1.2                      → 0

  mode = 'bulk'         // goal: gain lean mass slowly
    slope < -0.2                        → 0
    -0.2 <= slope < 0.1                 → 100 × (slope + 0.2) / 0.3          // 0 → 100
    0.1 <= slope <= 0.5                 → 100
    0.5 <  slope < 1.0                  → 100 × (1.0 − slope) / 0.5          // 100 → 0
    slope >= 1.0                        → 0
```

### 1.6 Dispatch

```
scoreMetric(metric: MetricDef, value: Value, settings: Settings): number | null
  if (value === null || value === undefined) return null
  if (metric.widget === 'toggle' && typeof value !== 'boolean') return null
  const spec = resolveSpec(metric, settings)          // handle the function form
  switch (spec.curve) {
    case 'ramp':    return scoreRamp(value, spec.zeroAt, spec.target)
    case 'step':    return scoreStep(value)
    case 'counter': return scoreCounter(value, spec.target)
    case 'range':   return scoreRange(value, spec.good, spec.bad)
    case 'trend':   return scoreTrend(value, spec.mode)
  }
```

**Special case — `learned`.** The only note-dependent score in the system:

```
if (metric.id === 'learned')
  return value === null ? null
       : value === true  ? (day.note && day.note.trim().length > 0 ? 100 : 40)
       : 0
```

Rationale in `02-metrics.md` §3 and decision D12: the artifact is the proof, the tick is not.

Numbers are returned as floats in `[0, 100]`. Rounding happens only at display time
(`Math.round` half-up). Never round inside the maths — a week of 89.4 must not silently become 89.

---

## 2. Presence, coverage, and the tri-state rule

**A toggle has three states, not two:**

| State | Stored | Scores | Counts as present |
|---|---|---|---|
| Not logged | `null` | excluded | no |
| Yes | `true` | 100 (40 for `learned` with no note, §1.6) | yes |
| No | `false` | 0 | yes |

A metric is **present** when its value is not `null`. `0`, `false`, and `''` are present.
This is what makes "missing is not zero" real instead of aspirational.

```
coverageWeights = daily metrics where countsTowardCoverage === true
                     → sum = 0.79 (§4 of 02-metrics.md)

coverage(day) = Σ weight of present metrics among coverageWeights
              / 0.79
```

| Coverage | Label | Consequences |
|---|---|---|
| ≥ 0.70 | `ok` | counts in averages, streaks, insights |
| 0.25 – 0.69 | `partial` | displayed; excluded from averages, streaks, insights |
| < 0.25 | `insufficient` | `dayScore = null`; shown as "not enough data" |

`dayScore = null` when `Σ weight of present daily metrics < 0.25`.

---

## 3. Aggregation

Three levels, one principle: **a metric only enters the denominator when it has a value.**

```
DAILY_MASS  = 0.79   // sum of daily weights
WEEKLY_MASS = 0.11   // sum of weekly weights
MONTHLY_MASS= 0.10   // sum of monthly weights

dayScore(day):
  present = daily metrics with a value, minus those excluded by restDay
  if Σ weight(present) < 0.25 → null
  return Σ (weight × scoreMetric) / Σ weight

weekScore(week):
  days      = logical days in the week with coverage >= 0.70
  dailyPart = (days.length ? mean(dayScore(days)) : null) × DAILY_MASS
  weekly    = weekly metrics with data in that week           // rate for that week
  weeklyPart= Σ (weight × scoreMetric)  over weekly
  denominator = (days.length ? DAILY_MASS : 0) + Σ weight(weekly present)
  return denominator ? (dailyPart + weeklyPart) / denominator : null

monthScore(month):
  same as weekScore, but weekly metrics are evaluated as their
  average per week across the weeks intersecting the month,
  and monthly metrics are added (MONTHLY_MASS).
  denominator includes DAILY_MASS + Σ weekly present + Σ monthly present
```

Weekly metrics are **rate metrics**. For any period, they are evaluated as "per week inside that
period" with the same curve. A single week is the trivial case.

Worked example — a good week:

```
day scores (Mon–Sun): 82 76 88 64 90 79 84      mean = 80.43
weekly: strength_sessions = 2 (target 2) → 100 × 0.05
        daylight_days     = 4 (target 5) →  80 × 0.03
        weight_trend      = -0.42 %/wk cut → 100 × 0.03

dailyPart  = 80.43 × 0.79              = 63.54
weeklyPart = (100×.05) + (80×.03) + (100×.03) = 5.00 + 2.40 + 3.00 = 10.40
denominator= 0.79 + 0.11 = 0.90
weekScore  = (63.54 + 10.40) / 0.90    = 82.2  → displayed as 82
```

If `weight_trend` has no weigh-in that week, it drops out of the numerator **and** denominator:
`(63.54 + 7.40) / 0.87 = 81.5`. The metric never silently contributes zero.

---

## 4. Bands

| Score | Band | Colour token | Rule |
|---|---|---|---|
| 90–100 | Excellent | `--accent` | — |
| 75–89 | Strong | `--ink` | — |
| 60–74 | Steady | `--ink` | — |
| 40–59 | Slipping | `--warn` | — |
| 0–39 | Off track | `--bad` | only after **3 consecutive days** < 40; otherwise `--warn` |

A single metric that is a hard zero by definition (`alcohol`, `adult`) may use `--bad`
immediately for that row only — never for the day score on the first day.

---

## 5. Streaks

Only for binary habits: `creatine`, `alcohol`, `read`, `learned`, plus the global `log` streak.

| Streak | Definition |
|---|---|
| Habit streak | consecutive logical days where the metric is present **and** scores 100 |
| Habit streak break | a present day that scores 0, **or** a `partial` day, **or** a gap of 2+ days |
| Neutral day | a `rest_day` excludes the metric from the streak entirely — it neither breaks nor extends |
| Log streak | consecutive logical days with `coverage ≥ 0.70` |

Streak display caps at 365 (`365+`). No fireworks, no "don't break the chain", no notification.

---

## 6. Logical date and time

```
logicalDate(now: Date, cutoffHour = 4, tz = Intl.DateTimeFormat().resolvedOptions().timeZone):
  local = now in tz
  return local.hour < cutoffHour ? local.date − 1 day : local.date
```

- Stored as `YYYY-MM-DD` **without** timezone offset.
- The timezone at logging time is stored on the day (`tz`) for audit.
- Weeks start on `settings.weekStartsOn` (default Monday). Week key: `YYYY-Www` of the
  *shifted* week (compute from the ISO week of the week's Thursday).
- Month key: `YYYY-MM`.
- Future logical dates are not editable and not scorable, with one exception: after the cutoff
  the "today" screen targets the new logical date immediately.

Dependency note: **no date library.** ISO week maths is ~40 lines and must be unit-tested across
year boundaries (2026-12-31, 2027-01-01, a Sunday-start configuration, and a leap year).

---

## 7. Rest days and edits

- `rest_day` (stored as `restDay: true`) restricts the day's metric set to
  `sleep_hours`, `protein`, `greens`, `read`. Everything else is dropped from numerator and
  denominator for that day. The day displays a small `rest` marker.
- Editing a past day is allowed at any time. Each write records `editedAt`.
- An auto value that has been manually overridden keeps `src: 'auto'` plus `overridden: true`,
  and the automation must not overwrite it again for that date+field.
- Editing does not change history for streaks retroactively — streaks are recomputed from raw
  days on every read, so an edit does change them. That is correct and intended: the data is the
  data.

---

## 8. Test table (required)

These rows must exist as tests. Implement as a table-driven suite
(`score.test.ts`, `aggregate.test.ts`, `dates.test.ts`).

### 8.1 Curves

| Function | Input | Expected |
|---|---|---|
| scoreRamp | v = 5.5, zeroAt 5.5, target 7.5 | 0 |
| scoreRamp | v = 6.5, zeroAt 5.5, target 7.5 | 50 |
| scoreRamp | v = 7.5, zeroAt 5.5, target 7.5 | 100 |
| scoreRamp | v = 9.0, zeroAt 5.5, target 7.5 | 100 (never > 100) |
| scoreRamp | v = 4.0, zeroAt 5.5, target 7.5 | 0 (never < 0) |
| scoreCounter | v = 0, target 2 | 0 |
| scoreCounter | v = 1, target 2 | 50 |
| scoreCounter | v = 2, target 2 | 100 |
| scoreCounter | v = 3.5, target 2 | 100 |
| scoreRange | v = 2.0, good 2.5, bad 4.5 | 100 |
| scoreRange | v = 3.5, good 2.5, bad 4.5 | 50 |
| scoreRange | v = 4.5, good 2.5, bad 4.5 | 0 |
| scoreRange | v = 6.0, good 2.5, bad 4.5 | 0 |
| scoreStep | true | 100 |
| scoreStep | false | 0 |
| scoreStep | 1 | 100 |
| learned | true, note `"Bayes vs frequentist"` | 100 |
| learned | true, note empty | 40 |
| learned | false, note `"x"` | 0 |
| learned | null, note `"x"` | null (excluded) |

### 8.2 Trend

| slope %/wk | mode | Expected |
|---|---|---|
| −0.5 | cut | 100 |
| −1.5 | cut | 85 |
| −2.5 | cut | 40 |
| 0.1 | cut | 50 |
| 0.4 | cut | 0 |
| 0.5 | cut | 0 |
| 0.2 | maintain | 100 |
| 0.75 | maintain | 50 |
| 1.2 | maintain | 0 |
| 0.3 | bulk | 100 |
| −0.05 | bulk | 50 |
| −0.2 | bulk | 0 |
| 0.75 | bulk | 50 |
| 1.0 | bulk | 0 |

### 8.3 Aggregation and presence

| Case | Expected |
|---|---|
| Day with every daily metric present and scoring 100 | dayScore 100 |
| Day where `creatine` is `false` and everything else 100 | < 100, and `creatine` counts as present |
| Day where `creatine` is `null` | score unchanged; `creatine` excluded from numerator and denominator |
| Day where protein = 0 (logged as zero) | contributes 0, present |
| Day with only `deep_blocks` present (weight 0.13) | `dayScore === null` (Σw < 0.25) |
| Week with all days `partial` | `weekScore === null`, no crash |
| Week where `weight_trend` is missing | denominator 0.87, not 0.90 |
| Month with 4 weeks and a savings rate of 20 % | includes `savings_rate` at 100 |
| Month with no monthly data | denominator excludes `MONTHLY_MASS` |
| Union of all curves | no result is ever `NaN`, `Infinity`, negative, or > 100 |
| Any period | `identical inputs → identical output` (pure, no clock reads inside) |

### 8.4 Dates

| Case | Expected |
|---|---|
| `logicalDate(2026-10-17T03:59)` with cutoff 4 | `2026-10-16` |
| `logicalDate(2026-10-17T04:00)` with cutoff 4 | `2026-10-17` |
| `logicalDate(2026-10-17T23:30)` | `2026-10-17` |
| Week key for Thursday 2026-10-15 | `2026-W42` |
| Week key for 2027-01-01 (a Friday) | `2026-W53` |
| Week key with `weekStartsOn: 0` for a Sunday | the week containing that Sunday |
| `weightSlopePctPerWeek` with two identical EMA points | `0` |
| `sleepConsistency` with 3 nights only | computed, `n = 3`, flagged `lowSample` in the UI |

### 8.5 Invariants (property-style tests over 500 generated days)

- `0 ≤ score ≤ 100` for every metric, every curve.
- `Σ metric weights === 1.00` (float tolerance 1e-9).
- `coverage` ∈ [0, 1] always.
- Removing a value from a day never increases the denominator.
- Shuffling the order of metrics in the registry never changes any score.
