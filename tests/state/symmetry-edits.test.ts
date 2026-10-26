// @vitest-environment jsdom
import { Matrix4, Vector3 } from 'three';
import {
  chooseSymmetryAnchor,
  clearSymmetry,
  applySymmetry,
  symmetrySig,
} from '../../src/state/symmetry';
import {
  baseCatalogSig,
  loadDoc,
  docSig,
  resetStoreForTests,
  historySig,
  undo,
  setStoreAdapter,
} from '../../src/state/store';
import { select } from '../../src/state/selection';
import {
  beginSession,
  finishSession,
  previewSession,
  cancelSession,
} from '../../src/tools/transform';
import { runCommand } from '../../src/state/commands';
import { committedPosesSig } from '../../src/state/derived';
import { docOf, part } from '../helpers/doc';
import { MINI } from '../helpers/catalog';
import { matrix4ToCf } from '../../src/core/cframe';
import { fakeViewport } from '../helpers/viewport';
import { setViewport } from '../../src/viewport/context';
beforeEach(() => {
  resetStoreForTests();
  clearSymmetry();
  baseCatalogSig.value = MINI;
});
afterEach(() => {
  setViewport(null);
  clearSymmetry();
});
function scene() {
  loadDoc({
    ...docOf(part(1, 'Part'), part(2, 'Part')),
    layout: new Map([[2, matrix4ToCf(new Matrix4().makeTranslation(2, 0, 0))]]),
  });
  select([1], 'replace');
  chooseSymmetryAnchor();
  select([2], 'replace');
  applySymmetry();
  select([2], 'replace');
  return docSig.peek().order[2];
}
test('G/gizmo move previews the counterpart and commits both in one undo action', () => {
  const peer = scene(),
    old = docSig.peek(),
    count = historySig.peek().past.length;
  const preview = vi.fn(),
    vp = fakeViewport({ layer: { setPreview: preview } as never });
  setViewport(vp);
  const s = beginSession()!;
  const delta = { kind: 'move' as const, offset: new Vector3(1, 2, 0) };
  previewSession(s, delta);
  const shown = preview.mock.calls.at(-1)![0] as Map<number, Matrix4>;
  expect(shown.get(peer)?.elements[12]).toBeCloseTo(-3);
  cancelSession(s);
  expect(docSig.peek()).toBe(old);
  const again = beginSession()!;
  finishSession(again, delta);
  expect(committedPosesSig.peek().world.get(peer)!.elements[12]).toBeCloseTo(-3);
  expect(committedPosesSig.peek().world.get(peer)!.elements[13]).toBeCloseTo(2);
  expect(historySig.peek().past.length).toBe(count + 1);
  expect(undo()).toBe(true);
  expect(docSig.peek()).toEqual(old);
  vp.canvas.parentElement?.remove();
});
test('Delete mirrors existing counterparts once; disabling edits leaves them alone', () => {
  const peer = scene(),
    old = docSig.peek();
  runCommand('edit.delete');
  expect(docSig.peek().parts.has(2)).toBe(false);
  expect(docSig.peek().parts.has(peer)).toBe(false);
  undo();
  expect(docSig.peek()).toEqual(old);
  symmetrySig.value = { ...symmetrySig.peek(), edits: false };
  select([2], 'replace');
  runCommand('edit.delete');
  expect(docSig.peek().parts.has(peer)).toBe(true);
});
test('mirrored local move is one collaboration document change and never changes guide settings', () => {
  const peer = scene(),
    changed = vi.fn(),
    settings = symmetrySig.peek();
  setStoreAdapter({
    canEdit: () => true,
    canReplace: () => false,
    allocate: () => 1000,
    changed,
    undo: () => false,
  });
  finishSession(beginSession()!, { kind: 'move', offset: new Vector3(1, 0, 0) });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(committedPosesSig.peek().world.get(peer)!.elements[12]).toBeCloseTo(-3);
  expect(symmetrySig.peek()).toBe(settings);
});
