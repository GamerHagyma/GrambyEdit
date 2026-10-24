// @vitest-environment jsdom
import { Vector3 } from 'three';
import type { Catalog } from '../../src/core/catalog-types';
import { capSize } from '../../src/core/surfaces/build';
import { selectionSig } from '../../src/state/selection';
import {
  createSurface,
  pickSurfaceHost,
  resetCorners,
  resetSurfacesForTests,
  selectCorner,
  setCorners,
  setCorner,
  surfaceBuildSig,
  surfaceCostSig,
  surfaceCreatedSig,
  surfaceHostSig,
  surfacePreviewSig,
  surfaceSig,
} from '../../src/state/surfaces';
import { baseCatalogSig, docSig, loadDoc, resetStoreForTests, undo } from '../../src/state/store';
import { pickSig } from '../../src/tools/pick';
import { docOf, part } from '../helpers/doc';
import { realCatalog } from '../helpers/real-catalog';

let cat: Catalog;
beforeAll(async () => {
  cat = await realCatalog();
});
beforeEach(() => {
  resetStoreForTests();
  resetSurfacesForTests();
  baseCatalogSig.value = cat;
  loadDoc(docOf(part(1, 'Part')));
});

/** Picks the Part's top face at its centre. */
function pickTop(): void {
  pickSurfaceHost();
  pickSig.value!.onPick({
    part: 1,
    body: 0,
    point: new Vector3(0, 0.5, 0),
    normal: new Vector3(0, 1, 0),
    subPart: 'Part',
    distance: 1,
  });
}

test('picking a face starts a two-cap square resting on it', () => {
  pickTop();
  const { width: w, thickness } = capSize(cat)!;
  expect(surfaceSig.value.host).toEqual({ part: 1, type: 'Part' });
  for (const c of surfaceSig.value.corners) {
    expect(c[1]).toBeCloseTo(0.5 + thickness / 2, 9);
    expect(Math.abs(c[0])).toBeCloseTo(w, 9);
    expect(Math.abs(c[2])).toBeCloseTo(w, 9);
  }
  const built = surfaceBuildSig.value;
  expect(built?.ok && [built.count, built.rows]).toEqual([4, 2]);
  expect(surfacePreviewSig.value?.doc.order).toHaveLength(4);
  const cost = surfaceCostSig.value;
  expect(cost?.ok && cost.cost.addParts).toBe(4);
});

test('Create adds the caps once, Undo takes them out, and the preview comes back', () => {
  pickTop();
  createSurface();
  expect(docSig.value.order).toHaveLength(5);
  expect(docSig.value.parts.get(1)!.points!.size).toBe(4);
  expect(selectionSig.value.parts.size).toBe(4);
  expect(surfaceCreatedSig.value).toBe(4);
  expect(surfacePreviewSig.value).toBeNull();
  // Choosing a corner is not a change: the new caps stay uncovered.
  selectCorner(2);
  expect(surfacePreviewSig.value).toBeNull();
  createSurface();
  expect(docSig.value.order).toHaveLength(5);

  undo();
  expect(surfaceCreatedSig.value).toBeNull();
  expect(surfacePreviewSig.value?.doc.order).toHaveLength(4);
});

test('a change after Create shows the preview again', () => {
  pickTop();
  createSurface();
  const [x, y, z] = surfaceSig.value.corners[1];
  setCorner(1, [x + 0.5, y, z]);
  expect(surfacePreviewSig.value).not.toBeNull();
  resetCorners();
  expect(surfaceSig.value.corners[1]).toEqual([x, y, z]);
});

test('crossed corners give a reason and Create does nothing', () => {
  pickTop();
  const [p0, p1, p2, p3] = surfaceSig.value.corners;
  setCorner(1, p2);
  setCorner(2, p1);
  expect(surfaceSig.value.corners).toEqual([p0, p2, p1, p3]);
  const built = surfaceBuildSig.value;
  expect(built?.ok).toBe(false);
  expect(surfaceCostSig.value?.ok).toBe(false);
  createSurface();
  expect(docSig.value.order).toHaveLength(1);
});

test('a parent that is gone, or is now another type, is ignored', () => {
  pickTop();
  loadDoc(docOf(part(1, 'Connector')));
  expect(surfaceHostSig.value).toBeNull();
  expect(surfaceBuildSig.value).toBeNull();
  expect(surfacePreviewSig.value).toBeNull();
  loadDoc(docOf(part(2, 'Part')));
  expect(surfaceHostSig.value).toBeNull();
});

test('corners are chosen alone, or added and taken out with Shift; none clears the choice', () => {
  pickTop();
  selectCorner(2);
  expect(surfaceSig.value.selected).toEqual([2]);
  selectCorner(0, true);
  expect(surfaceSig.value.selected).toEqual([0, 2]);
  selectCorner(2, true);
  expect(surfaceSig.value.selected).toEqual([0]);
  selectCorner(3);
  expect(surfaceSig.value.selected).toEqual([3]);
  selectCorner(null, true);
  expect(surfaceSig.value.selected).toEqual([3]);
  selectCorner(null);
  expect(surfaceSig.value.selected).toEqual([]);
});

test('several corners move in one change', () => {
  pickTop();
  const before = surfaceSig.value.corners;
  setCorners([
    [0, [9, 9, 9]],
    [3, [7, 7, 7]],
  ]);
  const after = surfaceSig.value.corners;
  expect([after[0], after[1], after[2], after[3]]).toEqual([
    [9, 9, 9],
    before[1],
    before[2],
    [7, 7, 7],
  ]);
});
