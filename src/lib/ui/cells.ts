/* src/lib/ui/cells.ts — the shape a cell row passes around (05-design.md §4).
   A plain module so both the component and its wrappers share one type. */

import type { ResolvedMetric, Value } from '$lib/metrics/types';
import type { RowOption } from '$lib/today';

/** One cell: the same shape `optionsOf` returns (05-design.md §4). */
export type CellOption = RowOption;

/** The props every cell row takes: the metric is the source of truth for the label. */
export interface CellRowProps {
  metric: ResolvedMetric;
  /** The id of the element that names this group (its label). */
  legendId: string;
  value: Value;
  onpick: (value: Value) => void;
  onfocus?: () => void;
}
