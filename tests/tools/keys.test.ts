// @vitest-environment jsdom
import { registerTool, toolHotkey, toolSig, type ToolId } from '../../src/tools/manager';
import { transformKey } from '../../src/tools/modal';

const key = (code: string, mods: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent('keydown', { code, ...mods });
const dummy = (id: ToolId) => ({ id, activate() {}, deactivate() {} });

test('plain digits switch tools in both schemes; Ctrl+digits are left to the browser', () => {
  registerTool(dummy('select'));
  registerTool(dummy('move'));
  expect(toolHotkey(key('Digit2'))).toBe(true);
  expect(toolSig.value).toBe('move');
  expect(toolHotkey(key('Digit1', { ctrlKey: true }))).toBe(false);
  expect(toolSig.value).toBe('move');
  expect(toolHotkey(key('Numpad1'))).toBe(false);
  expect(toolHotkey(key('Digit9'))).toBe(false);
});

test('transform keys never take a Ctrl, Cmd, Alt or Shift combination', () => {
  for (const code of ['KeyR', 'KeyT', 'KeyG']) {
    for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
      expect(transformKey(key(code, mods))).toBe(false);
    }
  }
  // Nothing is selected and no viewport is mounted, so G and R have nothing to start.
  expect(transformKey(key('KeyG'))).toBe(false);
});
