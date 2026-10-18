/* src/lib/format.ts — display formatting. Numbers are rounded only here,
   never inside the scoring maths (03-scoring.md §1.6). */

import type { Value } from './metrics/types';

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/** Human value for a metric row. `unset` is a state, not a zero. */
export function formatValue(value: Value, unit = '', decimals?: number): string {
  if (value === null || value === undefined) return 'unset';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') {
    const text = formatNumber(value, decimals ?? (Number.isInteger(value) ? 0 : 1));
    return unit ? `${text} ${unit}` : text;
  }
  return value;
}

/** `7.4 h`, `8.2 k` — compact figures for the automatic strip. */
export function formatCompact(value: number, unit = ''): string {
  if (unit === 'k') return `${formatNumber(value / 1000, 1)}k`;
  return formatNumber(value, Number.isInteger(value) ? 0 : 1);
}

/**
 * A signed comparison: `+6`, `−4`, `0` (04-ux.md §5: the direction is stated in
 * words, never left to an arrow). Uses the typographic minus the docs use.
 */
export function formatSigned(value: number, decimals = 0): string {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  if (Math.abs(rounded) < 1 / factor / 2) return formatNumber(0, decimals);
  const text = formatNumber(Math.abs(rounded), decimals);
  return `${rounded > 0 ? '+' : '−'}${text}`;
}
