import {
  chooseSymmetryAnchor,
  symmetrySig,
  applySymmetry,
  addPlacementSymmetry,
  startSymmetryLifecycle,
  symmetryPreviewSig,
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
import { docOf, part } from '../helpers/doc';
beforeEach(() => {
  resetStoreForTests();
  baseCatalogSig.value = MINI;
  symmetrySig.value = { ...symmetrySig.value, anchor: null, auto: false };
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
