// @vitest-environment jsdom
import { isTypingTarget, KEYMAPS, keysFor, keyString, resolveKey } from '../../src/state/keymap';

const ev = (
  key: string,
  code: string,
  m: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {},
) => ({ key, code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...m });

test('Appendix A bindings resolve per scheme', () => {
  expect(resolveKey(ev('D', 'KeyD', { shiftKey: true }), 'blender')).toBe('edit.duplicate');
  expect(resolveKey(ev('7', 'Numpad7'), 'blender')).toBe('view.top');
  expect(resolveKey(ev('g', 'KeyG'), 'blender')).toBe('transform.grab');
  expect(resolveKey(ev('x', 'KeyX'), 'blender')).toBe('edit.delete');
  expect(resolveKey(ev('Tab', 'Tab'), 'blender')).toBe('mode.toggle');
  expect(resolveKey(ev('d', 'KeyD', { ctrlKey: true }), 'studio')).toBe('edit.duplicate');
  expect(resolveKey(ev('2', 'Digit2'), 'studio')).toBe('tool.move');
  expect(resolveKey(ev('2', 'Digit2', { ctrlKey: true }), 'studio')).toBeNull();
  expect(resolveKey(ev('y', 'KeyY', { ctrlKey: true }), 'studio')).toBe('edit.redo');
  expect(resolveKey(ev('w', 'KeyW'), 'studio')).toBeNull();
});

test('typing targets are ignored', () => {
  const input = document.createElement('input');
  expect(isTypingTarget(input)).toBe(true);
  expect(isTypingTarget(document.body)).toBe(false);
});

test('keyString: modifier order, numpad and letter codes, no Shift on punctuation', () => {
  expect(keyString(ev('P', 'KeyP', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+P');
  expect(keyString(ev('z', 'KeyZ', { metaKey: true, altKey: true }))).toBe('Ctrl+Alt+Z');
  expect(keyString(ev('.', 'NumpadDecimal'))).toBe('Numpad.');
  expect(keyString(ev('?', 'Slash', { shiftKey: true }))).toBe('?');
  expect(keyString(ev('Escape', 'Escape'))).toBe('Escape');
});

test('no binding uses a Ctrl combination browsers keep for themselves', () => {
  const reserved = /^Ctrl\+(Shift\+)?([TNWR]|Tab|[0-9])$/;
  for (const scheme of ['blender', 'studio'] as const) {
    expect(KEYMAPS[scheme].filter((b) => reserved.test(b.keys))).toEqual([]);
  }
});

test('keysFor lists every key of a command in a scheme', () => {
  expect(keysFor('edit.delete', 'blender')).toEqual(['X', 'Delete']);
  expect(keysFor('edit.duplicate', 'studio')).toEqual(['Ctrl+D']);
});
