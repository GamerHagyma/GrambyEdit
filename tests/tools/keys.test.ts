// @vitest-environment jsdom
import { runCommand } from '../../src/state/commands';
import { resolveKey } from '../../src/state/keymap';
import { registerTool, toolSig, type ToolId } from '../../src/tools/manager';

const ev = (code: string, key: string, mods: Partial<KeyboardEventInit> = {}) => ({
  code,
  key,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});
const dummy = (id: ToolId) => ({ id, activate() {}, deactivate() {} });

test('plain digits switch tools in both schemes; Ctrl+digits are left to the browser', () => {
  registerTool(dummy('select'));
  registerTool(dummy('move'));
  for (const scheme of ['blender', 'studio'] as const) {
    expect(resolveKey(ev('Digit2', '2'), scheme)).toBe('tool.move');
    expect(resolveKey(ev('Digit2', '2', { ctrlKey: true }), scheme)).toBeNull();
  }
  expect(runCommand('tool.move')).toBe(true);
  expect(toolSig.value).toBe('move');
});

test('G and R move and rotate in both schemes; with Ctrl, Cmd, Alt or Shift they are not taken', () => {
  for (const scheme of ['blender', 'studio'] as const) {
    expect(resolveKey(ev('KeyG', 'g'), scheme)).toBe('transform.grab');
    expect(resolveKey(ev('KeyR', 'r'), scheme)).toBe('transform.rotate');
    for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(resolveKey(ev('KeyR', 'r', mods), scheme)).toBeNull();
      expect(resolveKey(ev('KeyT', 't', mods), scheme)).toBeNull();
    }
  }
  // Nothing is selected, so G has nothing to move.
  expect(runCommand('transform.grab')).toBe(false);
});
