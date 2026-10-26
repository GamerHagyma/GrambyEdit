// @vitest-environment jsdom
import { BufferGeometry, Matrix4, Points, PerspectiveCamera } from 'three';
import { quadPatch, splitPatch } from '../../src/core/surfaces/patches';
import { SurfaceCurveHandles, curveControlLayout } from '../../src/viewport/surface-curve-handles';

const d = quadPatch([
  [0, 0, 0],
  [4, 0, 0],
  [4, 0, -4],
  [0, 0, -4],
]);
test('quad exposes four anchors/eight boundary handles; profiles expose only the selected section handles', () => {
  const q = curveControlLayout(d, 'quad', 0);
  expect(q.filter((c) => c.kind === 'anchor')).toHaveLength(4);
  expect(q.filter((c) => c.kind === 'tangent')).toHaveLength(8);
  expect(q.some((c) => c.id === d.grid[1][1])).toBe(false);
  const r = splitPatch(d, 'v', 0.5);
  if (!r.ok) throw new Error(r.error);
  const p = curveControlLayout(r.draft, 'profiles', 1);
  expect(p.filter((c) => c.kind === 'anchor')).toHaveLength(6);
  expect(p.some((c) => c.id === r.draft.grid[3][1])).toBe(true);
  expect(p.some((c) => c.id === r.draft.grid[0][1])).toBe(false);
});
test('dynamic handles shrink/dispose their buffers and labels; guides draw on top in parent space', () => {
  const h = new SurfaceCurveHandles();
  const host = document.createElement('div'),
    canvas = document.createElement('canvas');
  host.append(canvas);
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  const camera = new PerspectiveCamera();
  camera.position.set(0, 4, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const split = splitPatch(d, 'v', 0.5);
  if (!split.ok) throw new Error(split.error);
  const expanded = splitPatch(split.draft, 'u', 0.5);
  if (!expanded.ok) throw new Error(expanded.error);
  h.update(expanded.draft, new Matrix4().makeTranslation(1, 2, 3), [], 'profiles', 1);
  const dots = h.group.children.find((n) => n instanceof Points) as Points<BufferGeometry>;
  const old = dots.geometry,
    disposed = vi.fn();
  old.addEventListener('dispose', disposed);
  h.update(d, new Matrix4().makeTranslation(1, 2, 3), [d.grid[0][0]], 'quad', 0);
  expect(disposed).toHaveBeenCalledOnce();
  expect(dots.geometry.getAttribute('position').count).toBe(12);
  expect(dots.geometry.getAttribute('position').getX(0)).toBe(1);
  expect(dots.material).toMatchObject({ depthTest: false, depthWrite: false });
  h.placeBadges(camera, canvas);
  expect(host.querySelectorAll('.surface-corner').length).toBeGreaterThan(0);
  h.update(null, new Matrix4(), [], 'quad', 0);
  h.placeBadges(camera, canvas);
  expect(host.querySelectorAll('.surface-corner')).toHaveLength(0);
  expect(h.group.visible).toBe(false);
  h.dispose();
});
