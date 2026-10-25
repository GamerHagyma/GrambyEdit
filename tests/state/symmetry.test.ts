import {
  chooseSymmetryAnchor,
  symmetrySig,
  applySymmetry,
  addPlacementSymmetry,
  startSymmetryLifecycle,
  symmetryPreviewSig,
  pendingSymmetrySig,
  rememberSymmetryPlacements,
  clearSymmetry,
  placementSymmetryGhosts,
} from '../../src/state/symmetry';
import {
  baseCatalogSig,
  docSig,
  loadDoc,
  commit,
  undo,
  resetStoreForTests,
  setStoreAdapter,
} from '../../src/state/store';
import { select } from '../../src/state/selection';
import { addPart } from '../../src/core/ops/parts';
import { addPoint } from '../../src/core/ops/points';
import { MINI } from '../helpers/catalog';
import { Matrix4 } from 'three';
import { inspectorTabSig } from '../../src/state/ui';
import { docOf, part } from '../helpers/doc';
beforeEach(() => {
  resetStoreForTests();
  clearSymmetry();
  baseCatalogSig.value = MINI;
  symmetrySig.value = { ...symmetrySig.value, anchor: null, auto: false };
});
test('unapproved placements stay in a local queue across selection changes and approve together', () => {
  loadDoc(docOf(part(1, 'Part')));
  select([1], 'replace');
  chooseSymmetryAnchor();
  inspectorTabSig.value = 'mirror';
  for (const x of [2, 4]) {
    let id = 0;
    commit('Place', (d) => {
      id = addPart(d, 'Part');
      d.setLayout(id, [x, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    });
    rememberSymmetryPlacements([id]);
    select([id], 'replace');
  }
  expect([...pendingSymmetrySig.value]).toEqual([2, 3]);
  expect(symmetryPreviewSig.value?.count).toBe(2);
  select([1], 'replace');
  expect(symmetryPreviewSig.value?.count).toBe(2);
  inspectorTabSig.value = 'properties';
  expect(symmetryPreviewSig.value?.count).toBe(2);
  inspectorTabSig.value = 'mirror';
  const before = docSig.value;
  expect(
    placementSymmetryGhosts(
      docOf(part(10, 'Part')),
      new Map([[10, new Matrix4().makeTranslation(6, 0, 0)]]),
    ),
  ).toHaveLength(1);
  expect(docSig.value).toBe(before);
  applySymmetry();
  expect(docSig.value.parts.size).toBe(5);
  expect(pendingSymmetrySig.value.size).toBe(0);
});

test('pending IDs prune on deletion and clear on workspace replacement without tracking unrelated edits', () => {
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part')));
  select([1], 'replace');
  chooseSymmetryAnchor();
  const stop = startSymmetryLifecycle();
  rememberSymmetryPlacements([2]);
  commit('Unrelated addition', (d) => {
    addPart(d, 'Part');
  });
  expect([...pendingSymmetrySig.value]).toEqual([2]);
  commit('Delete source', (d) => d.delete(2));
  expect(pendingSymmetrySig.value.size).toBe(0);
  rememberSymmetryPlacements([3]);
  loadDoc(docOf(part(1, 'Part'), part(3, 'Part')));
  expect(pendingSymmetrySig.value.size).toBe(0);
  expect(symmetrySig.value.anchor).toBeNull();
  stop();
});
test('anchor and preview stay local; actual copies use one normal undo and viewer gates', () => {
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part')));
  select([1], 'replace');
  chooseSymmetryAnchor();
  expect(symmetrySig.value.anchor).toBe(1);
  expect(docSig.value.parts.size).toBe(2);
  select([2], 'replace');
  const before = docSig.value;
  void symmetryPreviewSig.value;
  expect(docSig.value).toBe(before);
  applySymmetry();
  expect(docSig.value.parts.size).toBe(3);
  expect(undo()).toBe(true);
  expect(docSig.value.parts.size).toBe(2);
  setStoreAdapter({
    canEdit: () => false,
    canReplace: () => false,
    allocate: () => 99,
    changed: () => {},
    undo: () => false,
  });
  applySymmetry();
  expect(docSig.value.parts.size).toBe(2);
});
test('automatic copies belong to the original placement transaction and clear on workspace replacement', () => {
  loadDoc(docOf(part(1, 'Connector')));
  select([1], 'replace');
  chooseSymmetryAnchor();
  symmetrySig.value = { ...symmetrySig.value, auto: true };
  const stop = startSymmetryLifecycle();
  commit('Place', (d) => {
    const u = addPoint(d, 1, [2, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 'Connector');
    const id = addPart(d, 'Part', {}, [{ self: '1', target: { kind: 'point', part: 1, uuid: u } }]);
    addPlacementSymmetry(d, [id]);
  });
  expect(docSig.value.parts.size).toBe(3);
  undo();
  expect(docSig.value.parts.size).toBe(1);
  loadDoc(docOf(part(3, 'Part')));
  expect(symmetrySig.value.anchor).toBeNull();
  expect(symmetrySig.value.auto).toBe(false);
  stop();
});
