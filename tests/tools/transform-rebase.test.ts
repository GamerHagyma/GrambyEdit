// @vitest-environment jsdom
import { Matrix4, Vector3 } from 'three';
import { beginSession, finishSession } from '../../src/tools/transform';
import { startModal, modalActiveSig, refreshModal, cancelModal } from '../../src/tools/modal';
import {
  baseCatalogSig,
  resetStoreForTests,
  loadDoc,
  docSig,
  installSharedDoc,
} from '../../src/state/store';
import { select, selectPoints, pointKey } from '../../src/state/selection';
import { transact } from '../../src/core/ops/transact';
import { MINI } from '../helpers/catalog';
import { docOf, part, pt, sock } from '../helpers/doc';
import { fakeViewport } from '../helpers/viewport';
import { setViewport } from '../../src/viewport/context';
beforeEach(() => {
  resetStoreForTests();
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part')));
  select([1], 'replace');
  setViewport(fakeViewport());
});
afterEach(() => {
  cancelModal();
  setViewport(null);
});
test('a transform adds its delta to current remote poses and preserves remote properties', () => {
  const s = beginSession()!;
  const latest = transact(docSig.value, 'Remote', (d) => {
    d.setLayout(1, [10, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    d.set({ ...d.get(1)!, props: { Remote: true } });
  }).doc;
  installSharedDoc(latest);
  finishSession(s, { kind: 'move', offset: new Vector3(1, 0, 0) });
  expect(docSig.value.layout.get(1)![0]).toBe(11);
  expect(docSig.value.parts.get(1)!.props.Remote).toBe(true);
});
test('remote deletion does not throw or resurrect a transform target', () => {
  const s = beginSession()!;
  installSharedDoc(transact(docSig.value, 'Remote delete', (d) => d.delete(1)).doc);
  expect(() => finishSession(s, { kind: 'move', offset: new Vector3(1, 0, 0) })).not.toThrow();
  expect(docSig.value.parts.has(1)).toBe(false);
});
test('modal G stays active across unrelated updates; cancel restores the latest pose', () => {
  const preview = vi.fn();
  setViewport(fakeViewport({ layer: { setPreview: preview, setBodyPreview: vi.fn() } as never }));
  expect(startModal('move')).toBe(true);
  installSharedDoc(
    transact(docSig.value, 'Remote move', (d) =>
      d.setLayout(1, [10, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
    ).doc,
  );
  refreshModal();
  expect(modalActiveSig.value).toBe(true);
  cancelModal();
  const last = preview.mock.calls.at(-1)![0] as Map<number, Matrix4>;
  expect(last.get(1)!.elements[12]).toBe(10);
});
test('a surviving selected descendant continues when its selected ancestor is removed', () => {
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')])));
  select([1, 2], 'replace');
  expect(startModal('move')).toBe(true);
  installSharedDoc(docOf(part(2, 'Part')));
  refreshModal();
  expect(modalActiveSig.value).toBe(true);
});
test('point G adds to the latest remote point frame instead of restoring the starting frame', () => {
  loadDoc(docOf(part(1, 'Part', [], {}, [pt('{point}')])));
  selectPoints([pointKey(1, '{point}')], 'replace');
  expect(startModal('move')).toBe(true);
  for (const [code, key] of [
    ['KeyX', 'x'],
    ['Digit1', '1'],
  ])
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }),
    );
  installSharedDoc(
    docOf(part(1, 'Part', [], {}, [pt('{point}', [10, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])])),
  );
  refreshModal();
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
  );
  expect(docSig.value.parts.get(1)!.points!.get('{point}')!.cframe[0]).toBe(11);
});
