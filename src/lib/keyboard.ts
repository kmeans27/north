/* src/lib/keyboard.ts — the key map of 04-ux.md §4, as a pure function.
 *
 * `resolveKey` is pure and fully tested; `attachKeyboard` is the single document
 * listener that feeds it. Every key that we consume is `preventDefault`ed, and
 * every key we do not recognise is left alone. No key is load-bearing: the whole
 * app works with a pointer.
 */

/** Routes a `G` chord can reach (04-ux.md §4). */
export type RoutePath = '/' | '/week' | '/trends' | '/settings';

export const ROUTE_KEYS: Readonly<Record<string, RoutePath>> = {
  t: '/',
  w: '/week',
  r: '/trends',
  s: '/settings'
};

export type KeyAction =
  | { type: 'none' }
  | { type: 'move'; direction: 'up' | 'down' }
  | { type: 'option'; index: number }
  | { type: 'primary' }
  | { type: 'clear' }
  | { type: 'editNote' }
  | { type: 'undo' }
  | { type: 'goto'; route: RoutePath }
  | { type: 'shiftDay'; delta: -1 | 1 }
  | { type: 'escape' }
  | { type: 'help' }
  /** `G` was pressed; the next key chooses a route. */
  | { type: 'chord' };

export interface KeyInput {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

export interface KeyState {
  /** A `G` is pending: the next key chooses a route. */
  chord: boolean;
  /** Options on the focused row (`0` disables the digit keys). */
  optionCount: number;
  /** The focused row accepts a note (`learned`). */
  canEditNote: boolean;
  /** A sheet is open: `Esc` closes it and nothing else fires. */
  sheetOpen: boolean;
  /** Focus is in a text field, so only `Esc` is ours. */
  typing: boolean;
}

export interface KeyResult {
  action: KeyAction;
  /** Whether the caller should stop the browser's default behaviour. */
  preventDefault: boolean;
}

const NONE: KeyResult = { action: { type: 'none' }, preventDefault: false };

function act(action: KeyAction, preventDefault = true): KeyResult {
  return { action, preventDefault };
}

/**
 * What a key press means (04-ux.md §4). Order of precedence: our chords and
 * shortcuts, then text fields, then route chords, then an open sheet, then the
 * row actions.
 */
export function resolveKey(input: KeyInput, state: KeyState): KeyResult {
  const key = input.key;
  const mod = input.metaKey === true || input.ctrlKey === true;

  // ⌘Z / Ctrl+Z — the one shortcut that works everywhere, including in a field.
  if (mod && (key === 'z' || key === 'Z')) return act({ type: 'undo' });
  if (mod || input.altKey === true) return NONE;

  if (state.typing) {
    return key === 'Escape' ? act({ type: 'escape' }, false) : NONE;
  }

  if (state.chord) {
    const route = ROUTE_KEYS[key.toLowerCase()];
    return route ? act({ type: 'goto', route }) : NONE;
  }

  if (state.sheetOpen) {
    return key === 'Escape' ? act({ type: 'escape' }) : NONE;
  }

  switch (key) {
    case '?':
      return act({ type: 'help' });
    case 'Escape':
      return act({ type: 'escape' });
    case 'g':
    case 'G':
      return act({ type: 'chord' });
    case 'j':
    case 'J':
      return act({ type: 'move', direction: 'down' });
    case 'k':
    case 'K':
      return act({ type: 'move', direction: 'up' });
    case ' ':
    case 'Spacebar':
      return act({ type: 'primary' });
    case 'Backspace':
      return act({ type: 'clear' });
    case 'e':
    case 'E':
      return state.canEditNote ? act({ type: 'editNote' }) : NONE;
    case '[':
      return act({ type: 'shiftDay', delta: -1 });
    case ']':
      return act({ type: 'shiftDay', delta: 1 });
    default:
      break;
  }

  if (key.length === 1 && key >= '1' && key <= '9') {
    const index = Number(key) - 1;
    if (index < state.optionCount) return act({ type: 'option', index });
  }

  return NONE;
}

/** True when the event target is a text field that must keep its keystrokes. */
export function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true
  );
}

/** What the focused screen reports about its rows. Read at event time, never cached. */
export interface RowContext {
  state: () => Pick<KeyState, 'optionCount' | 'canEditNote' | 'sheetOpen'>;
  onAction: (action: KeyAction) => void;
}

let rowContext: RowContext | null = null;

/**
 * A screen with rows calls this on mount and `provideRowContext(null)` on
 * destroy. There is one keyboard listener for the whole app (06-architecture.md
 * §2), so the row behaviour has to be published somewhere.
 */
export function provideRowContext(context: RowContext | null): void {
  rowContext = context;
}

export function currentRowContext(): RowContext | null {
  return rowContext;
}

export interface KeyboardHandlers {
  /** Sheet state the shell owns, such as the help overlay. */
  sheetOpen?: () => boolean;
  onAction: (action: KeyAction) => void;
  /** Fired when the `G` chord starts or ends; used for the hint line. */
  onChordChange?: (active: boolean) => void;
}

/**
 * The app's single `keydown` listener. Returns the detach function.
 * The `G` chord is owned here so pages never have to track it.
 */
export function attachKeyboard(handlers: KeyboardHandlers): () => void {
  let chord = false;

  const onKeydown = (event: KeyboardEvent): void => {
    const rows = rowContext?.state();
    const result = resolveKey(
      {
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey
      },
      {
        optionCount: rows?.optionCount ?? 0,
        canEditNote: rows?.canEditNote ?? false,
        sheetOpen: rows?.sheetOpen === true || handlers.sheetOpen?.() === true,
        typing: isTextTarget(event.target),
        chord
      }
    );

    if (result.preventDefault) event.preventDefault();

    const nextChord = result.action.type === 'chord';
    if (nextChord !== chord) handlers.onChordChange?.(nextChord);
    chord = nextChord;

    if (result.action.type !== 'none' && result.action.type !== 'chord') {
      handlers.onAction(result.action);
    }
  };

  document.addEventListener('keydown', onKeydown);
  return () => document.removeEventListener('keydown', onKeydown);
}
