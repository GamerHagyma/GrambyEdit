// @vitest-environment jsdom
import { wbGizmoModeSig, wbSocketSig } from '../../src/state/workbench';
import { createWorkbenchTool } from '../../src/tools/workbench';

const key = (code: string, mods: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { code, key: code.slice(3).toLowerCase(), ...mods });

test('G and R switch the selected socket’s gizmo; without a socket, or with Ctrl, they pass', () => {
  const tool = createWorkbenchTool();
  wbGizmoModeSig.value = 'translate';
  wbSocketSig.value = null;
  expect(tool.onKey!(key('KeyR'))).toBe(false);
  wbSocketSig.value = '2';
  expect(tool.onKey!(key('KeyR'))).toBe(true);
  expect(wbGizmoModeSig.value).toBe('rotate');
  expect(tool.onKey!(key('KeyG', { ctrlKey: true }))).toBe(false);
  expect(wbGizmoModeSig.value).toBe('rotate');
  expect(tool.onKey!(key('KeyG'))).toBe(true);
  expect(wbGizmoModeSig.value).toBe('translate');
  expect(tool.onKey!(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
  expect(wbSocketSig.value).toBeNull();
});
