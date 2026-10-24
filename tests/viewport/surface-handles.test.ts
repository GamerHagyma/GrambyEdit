// @vitest-environment jsdom
import {
  BufferGeometry,
  Color,
  LineLoop,
  PerspectiveCamera,
  Points,
  Texture,
  Vector3,
  type Material,
} from 'three';
import { DEFAULT_CONVENTIONS } from '../../src/core/conventions';
import { computePoses } from '../../src/core/pose';
import { PartsLayer } from '../../src/viewport/parts-layer';
import { SurfaceHandles } from '../../src/viewport/surface-handles';
import { docOf, part } from '../helpers/doc';
import { texturedAssets } from '../helpers/textured-assets';

test('corner handles sit on the corners, the chosen ones orange, and hide without a surface', () => {
  const handles = new SurfaceHandles();
  const corners = [0, 1, 2, 3].map((i) => new Vector3(i, 0, -i));
  handles.update(corners, [2]);
  expect(handles.group.visible).toBe(true);
  const dots = handles.group.children.find((o) => o instanceof Points) as Points<BufferGeometry>;
  const position = dots.geometry.getAttribute('position');
  const color = dots.geometry.getAttribute('color');
  corners.forEach((c, i) =>
    expect([position.getX(i), position.getY(i), position.getZ(i)]).toEqual([c.x, c.y, c.z]),
  );
  const orange = new Color(0xff9d2e);
  expect(color.getX(2)).toBeCloseTo(orange.r, 6);
  expect(color.getY(2)).toBeCloseTo(orange.g, 6);
  expect(color.getZ(2)).toBeCloseTo(orange.b, 6);
  expect(color.getY(0)).not.toBeCloseTo(orange.g, 2);
  handles.update(null, []);
  expect(handles.group.visible).toBe(false);
  handles.dispose();
});

test('a see-through parts layer fades every material once', () => {
  const fixture = texturedAssets();
  const assets = { ...fixture, textures: new Map([['textures/right.png', new Texture()]]) };
  const layer = new PartsLayer(assets, 0.5);
  const doc = docOf(part(1, 'Part'), part(2, 'Part'));
  layer.sync(doc, computePoses(doc, assets.catalog, DEFAULT_CONVENTIONS), new Set(), false);
  const materials = layer.meshes()[0].material as {
    transparent: boolean;
    opacity: number;
    depthWrite: boolean;
  }[];
  // The plain group, and the glass group that is 40% opaque already.
  expect(materials.map((m) => [m.transparent, m.opacity, m.depthWrite])).toEqual([
    [true, 0.5, false],
    [true, 0.2, false],
  ]);
  layer.dispose();
});

test('the corners draw after a see-through preview, so a dense one never hides them', () => {
  // three.js draws opaque things first, then see-through ones by render order: the dots must be in the
  // see-through pass, after the preview's parts, and ignore depth.
  const fixture = texturedAssets();
  const assets = { ...fixture, textures: new Map([['textures/right.png', new Texture()]]) };
  const preview = new PartsLayer(assets, 0.5);
  const doc = docOf(part(1, 'Part'));
  preview.sync(doc, computePoses(doc, assets.catalog, DEFAULT_CONVENTIONS), new Set(), false);
  const last = Math.max(...preview.meshes().map((m) => m.renderOrder));
  const handles = new SurfaceHandles();
  for (const o of handles.group.children as (Points | LineLoop)[]) {
    const m = o.material as Material;
    expect([m.transparent, m.depthTest, m.depthWrite]).toEqual([true, false, false]);
    expect(o.renderOrder).toBeGreaterThan(last);
  }
  handles.dispose();
  preview.dispose();
});

test('the badges of the corners the gizmo moves are marked active', () => {
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  host.append(canvas);
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld();
  const handles = new SurfaceHandles();
  handles.update(
    [0, 1, 2, 3].map((i) => new Vector3(i, 0, 0)),
    [1, 3],
  );
  handles.placeBadges(camera, canvas);
  const badges = [...host.querySelectorAll('.surface-corner')];
  expect(badges.map((b) => b.classList.contains('active'))).toEqual([false, true, false, true]);
  handles.update(
    [0, 1, 2, 3].map((i) => new Vector3(i, 0, 0)),
    [],
  );
  handles.placeBadges(camera, canvas);
  expect(badges.some((b) => b.classList.contains('active'))).toBe(false);
  handles.dispose();
});
