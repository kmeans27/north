/* tests/unit/keyboard.test.ts — the key map of 04-ux.md §4.
 *
 * `resolveKey` is pure; `attachKeyboard` is a two-line DOM adapter around it.
 * Every row of the map is pinned here, including the ones that must do nothing.
 */

import { describe, expect, it } from 'vitest';
import { ROUTE_KEYS, resolveKey, type KeyInput, type KeyState } from '../../src/lib/keyboard';

function state(overrides: Partial<KeyState> = {}): KeyState {
  return {
    chord: false,
    optionCount: 0,
    canEditNote: false,
    sheetOpen: false,
    typing: false,
    ...overrides
  };
}

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({ key: k, ...mods });

describe('modifier shortcuts', () => {
  it('undoes on ⌘Z and Ctrl+Z, even while typing', () => {
    expect(resolveKey(key('z', { metaKey: true }), state())).toEqual({
      action: { type: 'undo' },
      preventDefault: true
    });
    expect(resolveKey(key('z', { ctrlKey: true }), state({ typing: true })).action).toEqual({
      type: 'undo'
    });
  });

  it('leaves other browser shortcuts alone', () => {
    expect(resolveKey(key('a', { metaKey: true }), state())).toEqual({
      action: { type: 'none' },
      preventDefault: false
    });
    expect(resolveKey(key('f', { ctrlKey: true }), state()).preventDefault).toBe(false);
    expect(resolveKey(key('j', { altKey: true }), state()).action).toEqual({ type: 'none' });
  });
});

describe('text fields', () => {
  it('keeps every keystroke except Escape', () => {
    for (const k of ['j', 'k', 'g', '1', 'e', ' ', '[', ']', '?']) {
      const result = resolveKey(key(k), state({ typing: true, optionCount: 5, canEditNote: true }));
      expect(result, k).toEqual({ action: { type: 'none' }, preventDefault: false });
    }
  });

  it('blurs the field on Escape without stealing the key', () => {
    expect(resolveKey(key('Escape'), state({ typing: true }))).toEqual({
      action: { type: 'escape' },
      preventDefault: false
    });
  });
});

describe('the G chord', () => {
  it('arms on g and routes on the next letter', () => {
    expect(resolveKey(key('g'), state())).toEqual({
      action: { type: 'chord' },
      preventDefault: true
    });

    expect(ROUTE_KEYS).toEqual({
      d: '/',
      l: '/log',
      w: '/week',
      r: '/trends',
      s: '/settings',
      p: '/preview'
    });
    expect(resolveKey(key('d'), state({ chord: true })).action).toEqual({
      type: 'goto',
      route: '/'
    });
    expect(resolveKey(key('l'), state({ chord: true })).action).toEqual({
      type: 'goto',
      route: '/log'
    });
    expect(resolveKey(key('w'), state({ chord: true })).action).toEqual({
      type: 'goto',
      route: '/week'
    });
    expect(resolveKey(key('r'), state({ chord: true })).action).toEqual({
      type: 'goto',
      route: '/trends'
    });
    expect(resolveKey(key('s'), state({ chord: true })).action).toEqual({
      type: 'goto',
      route: '/settings'
    });
    expect(resolveKey(key('p'), state({ chord: true })).action).toEqual({
      type: 'goto',
      route: '/preview'
    });
  });

  it('accepts an upper-case route letter', () => {
    expect(resolveKey(key('W'), state({ chord: true })).action).toEqual({
      type: 'goto',
      route: '/week'
    });
  });

  it('drops an unknown second key without consuming it', () => {
    expect(resolveKey(key('x'), state({ chord: true }))).toEqual({
      action: { type: 'none' },
      preventDefault: false
    });
  });

  it('does not arm while a sheet is open or in a field', () => {
    expect(resolveKey(key('g'), state({ sheetOpen: true })).action).toEqual({ type: 'none' });
    expect(resolveKey(key('g'), state({ typing: true })).action).toEqual({ type: 'none' });
  });
});

describe('row keys', () => {
  it('moves down and up with J and K', () => {
    expect(resolveKey(key('j'), state()).action).toEqual({ type: 'move', direction: 'down' });
    expect(resolveKey(key('k'), state()).action).toEqual({ type: 'move', direction: 'up' });
    expect(resolveKey(key('J'), state()).action).toEqual({ type: 'move', direction: 'down' });
  });

  it('takes a primary action on Space and clears on Backspace', () => {
    expect(resolveKey(key(' '), state()).action).toEqual({ type: 'primary' });
    expect(resolveKey(key('Spacebar'), state()).action).toEqual({ type: 'primary' });
    expect(resolveKey(key('Backspace'), state()).action).toEqual({ type: 'clear' });
  });

  it('edits a note only on a row that has one', () => {
    expect(resolveKey(key('e'), state({ canEditNote: true })).action).toEqual({ type: 'editNote' });
    expect(resolveKey(key('e'), state()).action).toEqual({ type: 'none' });
  });

  it('sets the Nth option with 1–7, and ignores a digit past the end', () => {
    expect(resolveKey(key('1'), state({ optionCount: 6 })).action).toEqual({
      type: 'option',
      index: 0
    });
    expect(resolveKey(key('5'), state({ optionCount: 6 })).action).toEqual({
      type: 'option',
      index: 4
    });
    expect(resolveKey(key('6'), state({ optionCount: 6 })).action).toEqual({
      type: 'option',
      index: 5
    });
    expect(resolveKey(key('7'), state({ optionCount: 6 }))).toEqual({
      action: { type: 'none' },
      preventDefault: false
    });
    expect(resolveKey(key('7'), state({ optionCount: 7 })).action).toEqual({
      type: 'option',
      index: 6
    });
  });

  it('ignores digits when the row has no options', () => {
    expect(resolveKey(key('3'), state()).action).toEqual({ type: 'none' });
  });

  it('steps a logical day with the bracket keys', () => {
    expect(resolveKey(key('['), state()).action).toEqual({ type: 'shiftDay', delta: -1 });
    expect(resolveKey(key(']'), state()).action).toEqual({ type: 'shiftDay', delta: 1 });
  });
});

describe('overlays', () => {
  it('opens help on ?', () => {
    expect(resolveKey(key('?'), state()).action).toEqual({ type: 'help' });
  });

  it('closes a sheet on Escape and swallows the row keys behind it', () => {
    expect(resolveKey(key('Escape'), state({ sheetOpen: true }))).toEqual({
      action: { type: 'escape' },
      preventDefault: true
    });
    for (const k of ['j', ' ', '1', 'g', 'e']) {
      expect(resolveKey(key(k), state({ sheetOpen: true })), k).toEqual({
        action: { type: 'none' },
        preventDefault: false
      });
    }
  });

  it('still blurs with Escape when no sheet is open', () => {
    expect(resolveKey(key('Escape'), state()).action).toEqual({ type: 'escape' });
  });

  it('does not consume unmapped keys', () => {
    for (const k of ['a', 'q', 'ArrowDown', 'Enter', 'Tab', 'F5']) {
      expect(resolveKey(key(k), state({ optionCount: 5 })), k).toEqual({
        action: { type: 'none' },
        preventDefault: false
      });
    }
  });
});
