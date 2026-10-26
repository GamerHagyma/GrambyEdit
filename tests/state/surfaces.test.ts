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
import {
  baseCatalogSig,
  docSig,
  loadDoc,
  resetStoreForTests,
  undo,
  installSharedDoc,
  setStoreAdapter,
} from '../../src/state/store';
import { pickSig } from '../../src/tools/pick';
import { cornerWorlds } from '../../src/tools/surface';
import { docOf, part } from '../helpers/doc';
import { realCatalog } from '../helpers/real-catalog';
import {
  setSurfaceCurves,
  surfaceJobs,
  applySurfaceEdit,
  activeSurfacePatchSig,
  surfaceDraftSig,
  selectSurfaceControl,
} from '../../src/state/surface-draft';
import { TestSurfaceWorker } from '../helpers/surface-worker';
import { chooseSymmetryAnchor, symmetrySig, clearSymmetry } from '../../src/state/symmetry';
import { select } from '../../src/state/selection';

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
afterEach(() => {
  surfaceJobs.dispose();
  setStoreAdapter(null);
  clearSymmetry();
  vi.unstubAllGlobals();
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

test('Create hides the corners until Undo takes the caps out again', () => {
  pickTop();
  selectCorner(1);
  expect(cornerWorlds()).toHaveLength(4);
  createSurface();
  expect(cornerWorlds()).toBeNull();
  expect(surfaceSig.value.selected).toEqual([]);
  undo();
  expect(cornerWorlds()).toHaveLength(4);
});

test('curved preview is pending until current worker output, then Create and Undo use those native frames', async () => {
  vi.stubGlobal('Worker', TestSurfaceWorker);
  pickTop();
  setSurfaceCurves(true, surfaceSig.value.corners);
  expect(surfaceBuildSig.value).toBeNull();
  expect(surfaceJobs.state.value.status).toBe('pending');
  createSurface();
  expect(docSig.value.order).toHaveLength(1);
  await vi.waitFor(() => expect(surfaceBuildSig.value?.ok).toBe(true));
  const built = surfaceBuildSig.value!;
  if (!built.ok) throw new Error(built.error);
  const count = built.count;
  createSurface();
  expect(docSig.value.order).toHaveLength(count + 1);
  expect(surfaceCreatedSig.value).toBe(count);
  expect(surfacePreviewSig.value).toBeNull();
  undo();
  await vi.waitFor(() => expect(surfacePreviewSig.value).not.toBeNull());
  expect(docSig.value.order).toHaveLength(1);
  const d = activeSurfacePatchSig.value!,
    id = d.grid[0][1],
    p = d.points[id];
  applySurfaceEdit({ kind: 'move', positions: { [id]: [p[0], p[1] + 0.05, p[2]] } });
  expect(surfaceBuildSig.value).toBeNull();
  await vi.waitFor(() => expect(surfaceBuildSig.value?.ok).toBe(true));
  expect(surfaceDraftSig.value.curved).toBe(true);
});

test('a replacement workspace with the same parent ID invalidates the picked surface and its worker', () => {
  vi.stubGlobal('Worker', TestSurfaceWorker);
  pickTop();
  setSurfaceCurves(true, surfaceSig.value.corners);
  loadDoc(docOf(part(1, 'Part')));
  expect(surfaceHostSig.value).toBeNull();
  expect(surfaceBuildSig.value).toBeNull();
  expect(surfaceJobs.state.value.status).toBe('idle');
  createSurface();
  expect(docSig.value.order).toHaveLength(1);
});

test('selecting advanced handles reuses accepted mounted parts instead of remounting the whole preview', async () => {
  vi.stubGlobal('Worker', TestSurfaceWorker);
  pickTop();
  setSurfaceCurves(true, surfaceSig.value.corners);
  await vi.waitFor(() => expect(surfaceBuildSig.value?.ok).toBe(true));
  const built = surfaceBuildSig.value!;
  if (!built.ok) throw new Error(built.error);
  selectSurfaceControl(activeSurfacePatchSig.value!.grid[0][1]);
  const selected = surfaceBuildSig.value!;
  if (!selected.ok) throw new Error(selected.error);
  expect(selected.sub).toBe(built.sub);
});

test('local drafts and remote changes never echo; only created native parts notify the collaboration adapter', async () => {
  vi.stubGlobal('Worker', TestSurfaceWorker);
  pickTop();
  const changed = vi.fn();
  let leased = 1000,
    editable = true;
  setStoreAdapter({
    canEdit: () => editable,
    canReplace: () => false,
    allocate: () => leased++,
    changed,
    undo: () => false,
  });
  setSurfaceCurves(true, surfaceSig.value.corners);
  await vi.waitFor(() => expect(surfaceBuildSig.value?.ok).toBe(true));
  const first = surfaceBuildSig.value!;
  if (!first.ok) throw new Error(first.error);
  const doc = docSig.value,
    remoteParts = new Map(doc.parts);
  remoteParts.set(1, { ...remoteParts.get(1)!, props: { RGB: [20, 30, 40] } });
  installSharedDoc({ ...doc, parts: remoteParts });
  const remote = surfaceBuildSig.value!;
  if (!remote.ok) throw new Error(remote.error);
  expect(remote.sub).toBe(first.sub);
  expect(changed).not.toHaveBeenCalled();
  createSurface();
  expect(changed).toHaveBeenCalledTimes(1);
  expect(docSig.value.order).toHaveLength(first.count + 1);
  expect(docSig.value.order.slice(1).every((id) => id >= 1000)).toBe(true);
  editable = false;
  const d = activeSurfacePatchSig.value!,
    id = d.grid[0][1],
    p = d.points[id];
  applySurfaceEdit({ kind: 'move', positions: { [id]: [p[0], p[1] + 0.01, p[2]] } });
  await vi.waitFor(() => expect(surfaceBuildSig.value?.ok).toBe(true));
  createSurface();
  expect(changed).toHaveBeenCalledTimes(1);
});

test('automatic mirror copies of a curved surface share the original Create undo transaction', async () => {
  vi.stubGlobal('Worker', TestSurfaceWorker);
  clearSymmetry();
  pickTop();
  select([1], 'replace');
  chooseSymmetryAnchor();
  symmetrySig.value = { ...symmetrySig.value, auto: true };
  setCorners(surfaceSig.value.corners.map((p, i) => [i, [p[0] + 2, p[1], p[2]]] as const));
  setSurfaceCurves(true, surfaceSig.value.corners);
  await vi.waitFor(() => expect(surfaceBuildSig.value?.ok).toBe(true));
  const built = surfaceBuildSig.value!;
  if (!built.ok) throw new Error(built.error);
  createSurface();
  expect(docSig.value.order).toHaveLength(built.count * 2 + 1);
  undo();
  expect(docSig.value.order).toEqual([1]);
});
