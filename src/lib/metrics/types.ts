/* src/lib/metrics/types.ts
   The data model. Transcribed from 02-metrics.md §2 and 06-architecture.md §4.
   Nothing here may be invented elsewhere: 02-metrics.md is canonical. */

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

export interface Bin {
  label: string;
  value: number;
}

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
  label: string;             // "Protein"
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

/* ─── Stored documents (06-architecture.md §4) ──────────────────────────── */

export interface DayValue {
  v: Value;                    // number | boolean | string | null
  src: 'manual' | 'auto' | 'import';
  t: number;                   // ms epoch of the write
  editedAt?: number;           // set on any later change
  locked?: boolean;            // true once a human edited it; automation must never overwrite
  overridden?: boolean;        // a human edited an auto value; src stays 'auto' (03-scoring.md §7)
}

export interface Day {
  date: string;                // 'YYYY-MM-DD' logical date, no timezone offset
  tz: string;                  // IANA zone at logging time
  restDay?: boolean;
  note?: string;               // one optional line, 400 chars
  extras?: Record<string, number | string>;   // non-metric inputs, e.g. sleepStart: '23:41'
  values: Partial<Record<MetricId, DayValue>>;
}

/* The writable score fields a person may retarget (06-architecture.md §4:
   "any writable field of a MetricDef (`target`, `weight`, `good`, `bad`, `max`,
   `lever`, `help`, `visible`)"). The score numbers are flattened to the top
   level so a preset reads `{ target: 20 }`, not `{ score: { target: 20 } }`. */
export type ScoreOverride = Pick<ScoreSpec, 'target' | 'zeroAt' | 'good' | 'bad' | 'max' | 'stretch'>;

export type MetricOverride = Omit<Partial<MetricDef>, 'score'> & Partial<ScoreOverride>;

export interface Settings {
  version: number;             // settings schema version
  bodyweightKg: number;
  proteinGPerKg: number;       // default 1.6
  goalWeightKg: number | null;
  weightMode: 'cut' | 'maintain' | 'bulk';
  dayCutoffHour: number;       // default 4
  weekStartsOn: 0 | 1;         // default 1 (Monday)
  eveningPrompt: string;       // 'HH:MM'
  theme: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact';
  overrides: Partial<Record<MetricId, MetricOverride>>;
  hidden: MetricId[];
  automation: { health: boolean; collector: boolean; sync: boolean; repo: string | null };
}

/* A MetricDef with registry + settings overrides merged. Produced by resolve.ts;
   nothing else in the app reads REGISTRY directly (06-architecture.md §4).
   `score` is always a literal spec here — the function form is already applied. */
export type ResolvedMetric = Omit<MetricDef, 'score'> & { score: ScoreSpec };
