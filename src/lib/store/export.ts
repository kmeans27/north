/* src/lib/store/export.ts — JSON backup and CSV export (06-architecture.md §7).
 *
 * Both formats are generated client-side. JSON is the lossless backup and the
 * only importable format; CSV is one row per day, one column per metric, raw
 * values, `date` first — readable without this app.
 */

import { REGISTRY } from '../metrics/registry';
import type { Day, Settings } from '../metrics/types';
import type { DayStore } from './days';

export const EXPORT_VERSION = 1;

export interface ExportBundle {
  version: number;
  exportedAt: number;
  settings: Settings;
  days: Day[];
}

const byDate = (a: Day, b: Day): number => a.date.localeCompare(b.date);

export function buildExport(days: Day[], settings: Settings, exportedAt: number): ExportBundle {
  return {
    version: EXPORT_VERSION,
    exportedAt,
    settings,
    days: [...days].sort(byDate)
  };
}

export function serializeExport(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parse and validate a backup. Throws a readable error instead of half-importing. */
export function parseExport(text: string): ExportBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON');
  }

  if (!isRecord(parsed)) throw new Error('Backup is not an object');
  if (typeof parsed.version !== 'number') throw new Error('Backup has no version');
  if (parsed.version > EXPORT_VERSION) {
    throw new Error(`Backup version ${parsed.version} is newer than this app`);
  }
  if (!Array.isArray(parsed.days)) throw new Error('Backup has no days array');
  if (!isRecord(parsed.settings)) throw new Error('Backup has no settings object');

  const days = parsed.days.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Day ${index} is not an object`);
    if (typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
      throw new Error(`Day ${index} has an invalid date`);
    }
    if (!isRecord(value.values)) throw new Error(`Day ${value.date} has no values object`);
    return value as unknown as Day;
  });

  return {
    version: parsed.version,
    exportedAt: typeof parsed.exportedAt === 'number' ? parsed.exportedAt : 0,
    settings: parsed.settings as unknown as Settings,
    days
  };
}

/** Write a parsed backup. Re-importing the same bundle is idempotent. */
export async function importBundle(store: DayStore, bundle: ExportBundle): Promise<void> {
  await store.importDays(bundle.days);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** `date` first, then one column per metric in registry order. */
export function toCSV(days: Day[]): string {
  const ids = REGISTRY.map((metric) => metric.id);
  const lines = [['date', ...ids].join(',')];

  for (const day of [...days].sort(byDate)) {
    const cells = ids.map((id) => csvCell(day.values[id]?.v ?? null));
    lines.push([day.date, ...cells].join(','));
  }

  return `${lines.join('\n')}\n`;
}

/** Trigger a client-side download. No server, no dependency. */
export function download(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
