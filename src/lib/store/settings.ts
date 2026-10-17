/* src/lib/store/settings.ts — defaults, load, merge (06-architecture.md §4, 04-ux.md §8).
 *
 * Overrides are stored separately from the registry so an app update can never
 * wipe personalisation, and "reset to defaults" stays a one-liner.
 */

import type { Settings } from '../metrics/types';
import type { KeyValueStore } from './db';

export const SETTINGS_VERSION = 1;
const SETTINGS_KEY = 'settings';

/**
 * Registry defaults plus the onboarding defaults from 04-ux.md §8.
 * `bodyweightKg: 80` is the pre-onboarding fallback (02-metrics.md §1 uses the
 * same 80 kg for the protein example); onboarding replaces it in M5 and the
 * Settings screen shows "using default targets — review" until then.
 */
export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  bodyweightKg: 80,
  proteinGPerKg: 1.6,
  goalWeightKg: null,
  weightMode: 'maintain',
  dayCutoffHour: 4,
  weekStartsOn: 1,
  eveningPrompt: '21:30',
  theme: 'system',
  density: 'comfortable',
  overrides: {},
  hidden: [],
  automation: { health: false, collector: false, sync: false, repo: null }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function positive(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Merge stored settings over the defaults and validate them. Unknown keys are
 * dropped; a corrupt field falls back to its default instead of breaking boot.
 */
export function mergeSettings(stored?: Partial<Settings> | null): Settings {
  const source: Record<string, unknown> = isRecord(stored) ? stored : {};
  const defaults = DEFAULT_SETTINGS;

  const weightMode =
    source.weightMode === 'cut' || source.weightMode === 'bulk' || source.weightMode === 'maintain'
      ? source.weightMode
      : defaults.weightMode;

  const theme =
    source.theme === 'light' || source.theme === 'dark' || source.theme === 'system'
      ? source.theme
      : defaults.theme;

  const density =
    source.density === 'compact' || source.density === 'comfortable'
      ? source.density
      : defaults.density;

  const automation = isRecord(source.automation) ? source.automation : {};
  const hidden = Array.isArray(source.hidden)
    ? source.hidden.filter((id): id is Settings['hidden'][number] => typeof id === 'string')
    : [];

  return {
    version: SETTINGS_VERSION,
    bodyweightKg: positive(source.bodyweightKg, defaults.bodyweightKg),
    proteinGPerKg: positive(source.proteinGPerKg, defaults.proteinGPerKg),
    goalWeightKg:
      typeof source.goalWeightKg === 'number' && source.goalWeightKg > 0
        ? source.goalWeightKg
        : null,
    weightMode,
    dayCutoffHour: clampInt(source.dayCutoffHour, 0, 23, defaults.dayCutoffHour),
    weekStartsOn: clampInt(source.weekStartsOn, 0, 1, defaults.weekStartsOn) === 0 ? 0 : 1,
    eveningPrompt:
      typeof source.eveningPrompt === 'string' && /^\d{2}:\d{2}$/.test(source.eveningPrompt)
        ? source.eveningPrompt
        : defaults.eveningPrompt,
    theme,
    density,
    overrides: isRecord(source.overrides) ? (source.overrides as Settings['overrides']) : {},
    hidden,
    automation: {
      health: automation.health === true,
      collector: automation.collector === true,
      sync: automation.sync === true,
      repo: typeof automation.repo === 'string' && automation.repo.trim() ? automation.repo : null
    }
  };
}

export async function loadSettings(store: KeyValueStore): Promise<Settings> {
  const stored = await store.get<Partial<Settings>>('meta', SETTINGS_KEY);
  return mergeSettings(stored);
}

export async function saveSettings(store: KeyValueStore, settings: Settings): Promise<void> {
  await store.put('meta', SETTINGS_KEY, mergeSettings(settings));
}
