/* src/lib/ui/toast.svelte.ts — the one undo toast (04-ux.md §3).
 *
 * One message at a time, replaced by the next write, gone after four seconds.
 * It never steals focus: the undo is also on ⌘Z, and the toast itself is
 * focusable for anyone tabbing to it.
 */

/** 04-ux.md §3: "a quiet toast appears bottom-left for 4 s". */
export const TOAST_MS = 4000;

export interface ToastMessage {
  id: number;
  message: string;
}

let counter = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export const toast = $state<{ current: ToastMessage | null }>({ current: null });

export function showToast(message: string): void {
  if (timer !== null) clearTimeout(timer);
  toast.current = { id: ++counter, message };
  timer = setTimeout(dismissToast, TOAST_MS);
}

export function dismissToast(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  toast.current = null;
}
