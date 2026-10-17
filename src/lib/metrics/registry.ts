/* src/lib/metrics/registry.ts
   THE canonical registry. Transcribed from 02-metrics.md §3 — values, weights,
   curves, levers, help and evidence are copied exactly. Do not edit at runtime:
   settings overrides live in Settings.overrides and are merged by resolve.ts
   (06-architecture.md §4). */

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
    evidence: 'AASM/SRS: 7+ hours per night for adults.'
  },
  {
    id: 'sleep_consistency', pillar: 'body', label: 'Sleep regularity', short: 'Regular', unit: 'min',
    cadence: 'daily', widget: 'number', step: 5, decimals: 0,
    score: { curve: 'range', target: 30, good: 30, bad: 90 },
    weight: 0.03, source: 'derived', countsTowardCoverage: false,
    visible: true,
    lever: 'Shift bedtime in 15-minute steps toward a single anchor time. Regularity beats duration.',
    help: 'Standard deviation of your sleep start over the last 7 nights.',
    evidence: 'UK Biobank: sleep regularity predicts mortality more strongly than duration.'
  },
  {
    id: 'protein', pillar: 'body', label: 'Protein anchors', short: 'Protein', unit: '×32 g',
    cadence: 'daily', widget: 'counter',
    score: (s: Settings) => ({
      curve: 'counter',
      target: Math.max(3, Math.round((s.proteinGPerKg * s.bodyweightKg) / 32)),
      stretch: Math.round((2.0 * s.bodyweightKg) / 32)
    }),
    weight: 0.06, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Anchor protein to meals, not to willpower: 32 g at breakfast, lunch, dinner, plus one snack.',
    help: 'One tap per 32 g of protein. Not a diary — a count.',
    evidence: 'Morton 2018: ~1.6 g/kg/day maximises resistance-training gains; more is not better.'
  },
  {
    id: 'creatine', pillar: 'body', label: 'Creatine', short: 'Creatine', unit: '',
    cadence: 'daily', widget: 'toggle', score: { curve: 'step', target: 1 },
    weight: 0.02, source: 'manual', countsTowardCoverage: true, autoField: 'supplements.creatine',
    visible: true,
    lever: 'Put the tub where you make your first drink of the day. Consistency beats timing.',
    help: '3–5 g, any time of day.',
    evidence: 'ISSN: 3–5 g/day maintains elevated muscle creatine; timing is irrelevant.'
  },
  {
    id: 'greens', pillar: 'body', label: 'Greens & fruit', short: 'Greens', unit: 'servings',
    cadence: 'daily', widget: 'counter',
    score: { curve: 'counter', target: 5, max: 7 },
    weight: 0.02, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Buy fruit that needs no preparation. The barrier is friction, not appetite.',
    help: 'One tap per 80 g serving. Beans and juice count once, not twice.',
    evidence: 'WHO: ≥ 400 g (5 servings)/day; mortality benefit plateaus at five.'
  },
  {
    id: 'alcohol', pillar: 'body', label: 'Alcohol-free', short: 'No alcohol', unit: '',
    cadence: 'daily', widget: 'toggle', score: { curve: 'step', target: 1 },
    weight: 0.04, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Make the default drink a non-alcoholic one. Zero is the target, not "less".',
    help: 'Tap if you drank no alcohol today.',
    evidence: 'WHO 2023: no safe level of alcohol consumption for cancer risk.'
  },
  {
    id: 'steps', pillar: 'body', label: 'Steps', short: 'Steps', unit: 'k',
    cadence: 'daily', widget: 'number', step: 100, decimals: 0,
    score: { curve: 'ramp', zeroAt: 2500, target: 7000, stretch: 10000 },
    weight: 0.02, source: 'health', countsTowardCoverage: false,
    autoField: 'activity.steps', visible: true,
    lever: 'One 20-minute walk after a meal clears most of the gap.',
    help: 'Daily step count from Apple Health.',
    evidence: 'Lancet Public Health 2025: 7,000 steps/day ≈ 47 % lower all-cause mortality vs 2,000.'
  },
  {
    id: 'strength_sessions', pillar: 'body', label: 'Gym sessions', short: 'Gym', unit: '/wk',
    cadence: 'weekly', widget: 'counter', score: { curve: 'counter', target: 2, stretch: 3, max: 5 },
    weight: 0.05, source: 'health', countsTowardCoverage: false,
    autoField: 'activity.strengthSessions', visible: true,
    lever: 'Book the two sessions as appointments with fixed times. Two is the target, three is plenty.',
    help: 'Resistance sessions this week, counted from Apple Health workouts.',
    evidence: 'WHO/US PAG: muscle-strengthening on 2+ days per week.'
  },
  {
    id: 'daylight_days', pillar: 'body', label: 'Daylight days', short: 'Daylight', unit: 'days',
    cadence: 'weekly', widget: 'counter', score: { curve: 'counter', target: 5, max: 7 },
    weight: 0.03, source: 'derived', countsTowardCoverage: false,
    autoField: 'daylight.minutes', visible: true,
    lever: 'Take one call or one coffee outside before noon. Midday light is the point.',
    help: 'Days this week with 20+ minutes of daylight, from Apple Health.',
    evidence: '5–30 min of midday sun is sufficient for vitamin D synthesis; treat the watch value as a proxy.'
  },
  {
    id: 'weight_trend', pillar: 'body', label: 'Weight trend', short: 'Weight', unit: '%/wk',
    cadence: 'weekly', widget: 'number', step: 0.1, decimals: 1,
    score: (s: Settings) => ({ curve: 'trend', target: 0, mode: s.weightMode }),
    weight: 0.03, source: 'health', countsTowardCoverage: false,
    autoField: 'body.weightKg', visible: true,
    lever: 'Weigh in on the same morning every week, fasted, and read only the 28-day trend.',
    help: 'Slope of the 28-day EMA of your weight, compared with your goal.',
    evidence: '0.5–1 % of bodyweight per week preserves lean mass while cutting.'
  },

  /* ─── MIND ────────────────────────────────────────────────────────────── */
  {
    id: 'deep_blocks', pillar: 'mind', label: 'Deep blocks', short: 'Blocks', unit: '×45 min',
    cadence: 'daily', widget: 'segmented', score: { curve: 'counter', target: 2, stretch: 4, max: 4 },
    weight: 0.13, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Start the first block before opening anything with a feed in it.',
    help: 'Undistracted 45-minute blocks. No timer: count them at the end of the day.',
    evidence: 'Deliberate practice research: elite performers cap at ~4 h/day of intense work.'
  },
  {
    id: 'learned', pillar: 'mind', label: 'Learned something', short: 'Learned', unit: '',
    cadence: 'daily', widget: 'toggle',
    score: { curve: 'step', target: 1 },   // special: note-dependent, see 03-scoring.md §1.6
    weight: 0.09, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Write one line about the thing you learned. The note is the metric; the tick is not.',
    help: 'Tap if you learned something today. Add one line: what it was.',
    evidence: 'Input metrics are gameable; a written artifact is not.'
  },
  {
    id: 'read', pillar: 'mind', label: 'Read 10+ min', short: 'Reading', unit: '',
    cadence: 'daily', widget: 'toggle', score: { curve: 'step', target: 1 },
    weight: 0.06, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Keep the Kindle where you sit down, not where you sleep.',
    help: 'A book, not a feed. 10 minutes is the floor; 30 is the target.',
    evidence: 'Yale 2016: 30 min of book reading per day ≈ 20 % lower mortality over 12 years.'
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
      { label: '5h+', value: 6 }
    ],
    lever: 'Move the two worst apps off the home screen. Bins, not minutes — precision here is fake.',
    help: 'From iOS Screen Time, rounded to a bin.',
    evidence: 'There is no public API for iOS screen time; coarse bins are deliberate.'
  },
  {
    id: 'social_min', pillar: 'attention', label: 'Social media', short: 'Social', unit: 'min',
    cadence: 'daily', widget: 'bins',
    score: { curve: 'range', target: 30, good: 30, bad: 90 },
    weight: 0.07, source: 'manual', countsTowardCoverage: true, visible: true,
    bins: [
      { label: '≤ 30m', value: 15 }, { label: '30–60m', value: 45 },
      { label: '1–2h', value: 90 }, { label: '2h+', value: 150 }
    ],
    lever: 'The 30-minute ceiling has the best evidence behind it of anything on this screen.',
    help: 'Total time on social apps today, from iOS Screen Time.',
    evidence: 'Restricting use to 30 min/day improved wellbeing in randomised trials.'
  },
  {
    id: 'distraction_min', pillar: 'attention', label: 'Distraction', short: 'Leaks', unit: 'min',
    cadence: 'daily', widget: 'number', step: 15, decimals: 0,
    score: { curve: 'range', target: 90, good: 90, bad: 240 },
    weight: 0.05, source: 'collector', countsTowardCoverage: true,
    autoField: 'pc.distractionMinutes', visible: true,
    lever: 'Block the top three distracting domains at the DNS or hosts level, not by intention.',
    help: 'Minutes in the distracting category on your computer, measured locally.',
    evidence: 'Measured behaviour beats recall; the collector never leaves the category totals.'
  },
  {
    id: 'adult', pillar: 'attention', label: 'Clean day', short: 'Clean', unit: '',
    cadence: 'daily', widget: 'toggle', score: { curve: 'step', target: 1 },
    weight: 0.05, source: 'collector', countsTowardCoverage: true,
    autoField: 'pc.cleanDay', visible: true,
    lever: 'Remove the trigger, not the resolve: block at the network layer and keep the phone out of the room.',
    help: 'No adult content today. Computed locally by the collector; nothing is uploaded.',
    evidence: 'A hard zero is the only honest target for this one.'
  },

  /* ─── CAPITAL ─────────────────────────────────────────────────────────── */
  {
    id: 'savings_rate', pillar: 'capital', label: 'Savings rate', short: 'Saved', unit: '%',
    cadence: 'monthly', widget: 'number', step: 1, decimals: 0,
    score: { curve: 'ramp', zeroAt: 0, target: 20, stretch: 30 },
    weight: 0.07, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Automate the transfer on payday. A rate you have to remember is not a rate.',
    help: "Share of this month's net income that you did not spend.",
    evidence: '50/30/20: 20 % of net income to savings and investment.'
  },
  {
    id: 'invested', pillar: 'capital', label: 'Invested this month', short: 'Invested', unit: '',
    cadence: 'monthly', widget: 'toggle', score: { curve: 'step', target: 1 },
    weight: 0.03, source: 'manual', countsTowardCoverage: true, visible: true,
    lever: 'Put the contribution on an automatic schedule so the decision is made once.',
    help: 'Tap if money went into an investment this month.',
    evidence: 'Consistency of contribution dominates timing.'
  }
];

/* Derived masses from 02-metrics.md §4 — used by aggregate.ts. Kept here so the
   registry and its sums can never drift apart; asserted in registry.test.ts. */
export const CADENCE_MASS = {
  daily: 0.79,
  weekly: 0.11,
  monthly: 0.10
} as const;

export const PILLARS = ['body', 'mind', 'attention', 'capital'] as const;

export const PILLAR_LABEL: Record<(typeof PILLARS)[number], string> = {
  body: 'Body',
  mind: 'Mind',
  attention: 'Attention',
  capital: 'Capital'
};
