// @vitest-environment jsdom
import { Matrix4, Quaternion, Vector2, Vector3 } from 'three';
import { matrix4ToCf } from '../../src/core/cframe';
import type { Corners } from '../../src/core/surfaces/tiling';
import { resetSurfacesForTests, surfaceSig } from '../../src/state/surfaces';
import { baseCatalogSig, loadDoc, resetStoreForTests } from '../../src/state/store';
import {
  cornerAt,
  createSurfaceTool,
  surfaceGizmoHandlers,
  surfaceGizmoPlacement,
} from '../../src/tools/surface';
import { getViewport, setViewport } from '../../src/viewport/context';
import { MINI } from '../helpers/catalog';
import { docOf, part } from '../helpers/doc';
import { fakeViewport } from '../helpers/viewport';
import { activeSurfacePatchSig, selectSurfaceControl, setSurfaceCurves, undoSurfaceEdit } from '../../src/state/surface-draft';

const CORNERS: Corners = [
  [-1, 0.5, 1],
  [1, 0.5, 1],
  [1, 0.5, -1],
  [-1, 0.5, -1],
];

/** A Part turned 90° about Y as the parent, with a 2 × 2 square on top. */
beforeEach(() => {
  resetStoreForTests();
  resetSurfacesForTests();
  setViewport(fakeViewport());
  baseCatalogSig.value = MINI;
  const turned = new Matrix4().makeRotationY(Math.PI / 2);
  loadDoc({ ...docOf(part(1, 'Part')), layout: new Map([[1, matrix4ToCf(turned)]]) });
  surfaceSig.value = {
    ...surfaceSig.value,
    host: { part: 1, type: 'Part' },
    corners: CORNERS,
    home: CORNERS,
  };
});
afterEach(() => setViewport(null));

/** Where corner `i` shows on screen, as the tool sees the cursor. */
function ndcOf(i: number): Vector2 {
  const world = new Vector3(...CORNERS[i]).applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2));
  const v = world.project(getViewport()!.rig.camera);
  return new Vector2(v.x, v.y);
}

test('a click chooses a corner alone, Shift+click adds or takes one out, elsewhere lets them go', () => {
  const tool = createSurfaceTool();
  const click = (ndc: Vector2, shift = false) => {
    const e = { button: 0, x: 5, y: 5, ndc, shift, ctrl: false, alt: false };
    tool.onPointer!({ ...e, kind: 'down' });
    tool.onPointer!({ ...e, kind: 'up' });
  };
  expect(cornerAt(ndcOf(2))).toBe(2);
  click(ndcOf(2));
  expect(surfaceSig.value.selected).toEqual([2]);
  click(ndcOf(0), true);
  expect(surfaceSig.value.selected).toEqual([0, 2]);
  click(ndcOf(2), true);
  expect(surfaceSig.value.selected).toEqual([0]);
  // 0.2 in NDC is 80 px across an 800 px canvas: no corner is that close.
  const away = ndcOf(2).add(new Vector2(0.2, 0));
  click(away, true);
  expect(surfaceSig.value.selected).toEqual([0]);
  click(away);
  expect(surfaceSig.value.selected).toEqual([]);
  click(ndcOf(0));
  expect(tool.onKey!(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
  expect(surfaceSig.value.selected).toEqual([]);
  expect(tool.onKey!(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(false);
});

test('the gizmo moves the chosen corner in world space, stored in the parent part space', () => {
  surfaceSig.value = { ...surfaceSig.value, selected: [0] };
  const at = surfaceGizmoPlacement()!;
  // The parent's axes: turned 90° about Y.
  expect(at.quaternion.angleTo(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2))).toBeCloseTo(0, 9);
  surfaceGizmoHandlers.start();
  surfaceGizmoHandlers.change({ kind: 'move', offset: new Vector3(1, 0, 0) });
  // World +X is the turned parent's +Z.
  expect(surfaceSig.value.corners[0]).toEqual([-1, 0.5, 2]);
  surfaceGizmoHandlers.cancel();
  expect(surfaceSig.value.corners[0]).toEqual([-1, 0.5, 1]);
  surfaceGizmoHandlers.start();
  surfaceGizmoHandlers.end({ kind: 'move', offset: new Vector3(0, 0.25, 0) });
  expect(surfaceSig.value.corners[0]).toEqual([-1, 0.75, 1]);
});

test('advanced control movement uses parent coordinates, cancels exactly and records one draft undo', () => {
  setSurfaceCurves(true, CORNERS);
  const initial = activeSurfacePatchSig.value!, id = initial.grid[0][1];
  selectSurfaceControl(id);
  expect(surfaceGizmoPlacement()).not.toBeNull();
  surfaceGizmoHandlers.start();
  surfaceGizmoHandlers.change({ kind: 'move', offset: new Vector3(1, 0, 0) });
  expect(activeSurfacePatchSig.value!.points[id][2]).toBeCloseTo(initial.points[id][2] + 1);
  surfaceGizmoHandlers.cancel();
  expect(activeSurfacePatchSig.value).toEqual(initial);
  surfaceGizmoHandlers.start();
  surfaceGizmoHandlers.end({ kind: 'move', offset: new Vector3(0, 0.25, 0) });
  expect(activeSurfacePatchSig.value!.points[id][1]).toBeCloseTo(initial.points[id][1] + 0.25);
  undoSurfaceEdit();
  expect(activeSurfacePatchSig.value).toEqual(initial);
});

test('the gizmo sits between the chosen corners and moves them together', () => {
  surfaceSig.value = { ...surfaceSig.value, selected: [0, 1] };
  const turned = new Matrix4().makeRotationY(Math.PI / 2);
  const mid = new Vector3(0, 0.5, 1).applyMatrix4(turned);
  expect(surfaceGizmoPlacement()!.position.distanceTo(mid)).toBeCloseTo(0, 9);
  surfaceGizmoHandlers.start();
  surfaceGizmoHandlers.end({ kind: 'move', offset: new Vector3(0, 0.25, 0) });
  expect(surfaceSig.value.corners.slice(0, 2)).toEqual([
    [-1, 0.75, 1],
    [1, 0.75, 1],
  ]);
});

test('with World grid, each chosen corner lands on its own grid point', () => {
  const off: Corners = [
    [-1.07, 0.52, 1.13],
    [0.96, 0.44, 1.02],
    [1, 0.5, -1],
    [-1, 0.5, -1],
  ];
  surfaceSig.value = { ...surfaceSig.value, corners: off, selected: [0, 1] };
  surfaceGizmoHandlers.start();
  surfaceGizmoHandlers.end({ kind: 'move', offset: new Vector3(0, 0.25, 0), grid: 0.25 });
  const turned = new Matrix4().makeRotationY(Math.PI / 2);
  for (const i of [0, 1]) {
    const world = new Vector3(...surfaceSig.value.corners[i]).applyMatrix4(turned);
    for (const c of world.toArray()) expect(Math.abs(c / 0.25 - Math.round(c / 0.25))).toBeLessThan(1e-6);
  }
  // Each lands near where the move took it: up a step.
  expect(surfaceSig.value.corners[0][1]).toBeCloseTo(0.75, 6);
  expect(surfaceSig.value.corners[1][1]).toBeCloseTo(0.75, 6);
});
