# 01 — Brief

## 1. Who this is for

One person, right now: a man in his twenties who trains for muscle, studies (statistics and
coding), reads on a Kindle, and wants to stop guessing whether he is actually on track.
The dashboard is personal and single-user. Multi-user is explicitly out of scope.

**Context of use — design for these two moments and nothing else:**

| Moment | Device | Duration | Intent |
|---|---|---|---|
| 21:30, end of day | iPhone (PWA) | 20–40 s | Log the manual items before bed |
| Sunday morning | Desktop | 3–5 min | Week review: what moved, what slipped, what to fix |

Everything in this spec serves those two moments. If a feature does not help one of them, it is V2.

## 2. What it is

A dashboard of 19 metrics across four pillars, combining automatic capture (Apple Watch
health data, PC activity) with a handful of manual taps. It produces:

- **One number for today** and a 7-day and 30-day rolling view of it.
- **Four pillar scores** so a single broken area cannot hide behind an average.
- **One "weakest link"** with a concrete lever.
- **Up to five honest findings** drawn from the user's own history (never dressed up as science).
- **Raw history** that is exportable and readable without the app.

## 3. The score doctrine — "a mirror, not a slot machine"

These rules are product requirements, not opinions. Violating them is a bug.

1. **Missing is not zero.** A metric with no value is excluded from the score and reduces
   *coverage*. Coverage is displayed openly next to the score.
2. **Coverage below 70 % marks the day `partial`.** It is excluded from streaks and insights.
3. **No metric can exceed 100.** Sleeping 11 hours is not better than 8. Overshoot is shown as
   text, never as points.
4. **Weekly metrics never appear in the daily score.** Gym 2×/week cannot be "failed on Monday".
5. **No XP, no levels, no badges, no leaderboards, no confetti.** Consistency percentages and
   per-habit streaks are the only motivational affordances permitted.
6. **Red is reserved.** The `bad` colour appears only after 3 consecutive days below 40, or on a
   single hard-zero metric (alcohol, adult content). Never for a normal miss.
7. **Rest days are legitimate.** A `rest day` flag switches the day to a reduced metric set
   (sleep, nutrition, reading) and is never counted as a miss.
8. **Auto data is labelled.** Every value shows whether it came from a manual tap, the watch, or
   the collector. Manual edits always win, and the override is visible.
9. **Nothing is auto-filled retroactively.** Empty stays empty.

## 4. Inputs and outcomes

Hours are a proxy. Every pillar pairs an input metric with a proof metric:

| Pillar | Input (easy to fake) | Proof (hard to fake) |
|---|---|---|
| Mind | deep blocks, reading minutes | "learned something today" + one-line note; the monthly digest of those lines |
| Body | protein anchors, creatine | weekly weigh-in trend, gym sessions logged by the watch |
| Attention | phone/social limits | PC distraction minutes measured by the collector |
| Capital | savings rate | "did I invest this month" |

## 5. Success criteria

Measured after 30 days of real use. If any of these fail, the design failed.

| # | Criterion | Target |
|---|---|---|
| 1 | Median time to complete the manual daily log | ≤ 20 s |
| 2 | Median interactions per manual metric | ≤ 2 |
| 3 | Days with coverage ≥ 70 % | ≥ 85 % |
| 4 | Days where the app is opened twice or more (log then fix) | ≤ 15 % |
| 5 | Full manual log without scrolling on a 390 × 844 viewport | 100 % |
| 6 | Time to answer "is this week better than last week?" | ≤ 10 s, one screen |
| 7 | Number of times a metric target is changed because the default was unusable | ≤ 2 per quarter |

Criterion 3 is the real one. A beautiful dashboard nobody logs into is a failure.

## 6. Explicit non-goals

- Not a calorie or macro tracker. Not a food diary. Nutrition is 4 counters.
- Not a habit tracker with arbitrary user-defined habits (V2 adds a custom-metric form).
- Not a workout logger. Sessions come from Apple Health; the app only counts them.
- Not a journal. One optional line per day, plus the learning note.
- Not a life-coaching or AI product. The insight engine is deterministic rules over your own data.
- Not a social or comparative product. No crowd data, no benchmarks against others.
- Not a mobile app. It is a PWA that works offline.
- Not a multi-device account system. Sync is a private git repo plus a token.

## 7. The one-sentence test

> Would a tired person at 21:30 finish logging this in under twenty seconds, believe the
> number they got, and know the single thing to do better tomorrow?

If the answer is no, change the design, not the person.
