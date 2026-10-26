// @vitest-environment jsdom
import { Texture, TextureLoader, PerspectiveCamera, Mesh, SRGBColorSpace, Vector2 } from 'three';
import type { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ReferencePlanesLayer } from '../../src/viewport/reference-planes';
import {
  clearReferences,
  addReferenceUrl,
  activeReferenceSig,
  insertReferencePlane,
  referencePlanesSig,
  updateReferencePlane,
  removeReferencePlane,
  referencesSig,
  referenceErrorSig,
} from '../../src/state/references';
import { Quaternion, Euler, Vector3 } from 'three';

afterEach(() => {
  clearReferences();
  vi.restoreAllMocks();
});

test('reference meshes follow local transforms and dispose textures even if a pending load completes after removal', () => {
  const loads: {
    texture: Texture<HTMLImageElement>;
    loaded: (t: Texture<HTMLImageElement>) => void;
  }[] = [];
  vi.spyOn(TextureLoader.prototype, 'load').mockImplementation((_url, loaded) => {
    const texture = new Texture<HTMLImageElement>();
    loads.push({ texture, loaded: loaded! });
    return texture;
  });
  addReferenceUrl('https://example.com/car.png');
  const id = activeReferenceSig.peek()!.id;
  insertReferencePlane(id);
  const layer = new ReferencePlanesLayer(
    new PerspectiveCamera(),
    document.createElement('canvas'),
    vi.fn(),
  );
  const sync = () => layer.sync(referencesSig.peek(), referencePlanesSig.peek(), id, 'translate');
  sync();
  loads[0].loaded(loads[0].texture);
  const mesh = layer.group.getObjectByName(`reference-image-${id}`) as Mesh;
  expect(loads[0].texture.colorSpace).toBe(SRGBColorSpace);
  const controls = (
    layer.group.children.find((c) => 'controls' in c) as unknown as { controls: TransformControls }
  ).controls;
  controls.dragging = true;
  layer.sync(referencesSig.peek(), referencePlanesSig.peek(), null, 'translate');
  expect(controls.dragging).toBe(false);
  updateReferencePlane(id, {
    position: [2, 3, 4],
    rotation: [0, 90, 0],
    width: 12,
    height: 5,
    opacity: 0.3,
  });
  sync();
  expect(mesh.position.toArray()).toEqual([2, 3, 4]);
  expect(mesh.rotation.y).toBeCloseTo(Math.PI / 2);
  expect(mesh.scale.toArray()).toEqual([12, 5, 1]);
  const dispose = vi.spyOn(loads[0].texture, 'dispose');
  removeReferencePlane(id);
  sync();
  expect(layer.group.getObjectByName(mesh.name)).toBeUndefined();
  expect(dispose).toHaveBeenCalled();
  loads[0].loaded(loads[0].texture);
  expect(layer.group.getObjectByName(mesh.name)).toBeUndefined();
  expect(referenceErrorSig.peek()).toBeNull();
  layer.dispose();
});

test('the plane picker finds the nearest visible image and Select has an outline without a gizmo', () => {
  vi.spyOn(TextureLoader.prototype, 'load').mockImplementation(
    () => new Texture<HTMLImageElement>(),
  );
  addReferenceUrl('https://example.com/a.png');
  const a = activeReferenceSig.peek()!.id;
  insertReferencePlane(a);
  addReferenceUrl('https://example.com/b.png');
  const b = activeReferenceSig.peek()!.id;
  insertReferencePlane(b, [0, 0, 2]);
  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const canvas = document.createElement('canvas');
  const layer = new ReferencePlanesLayer(camera, canvas, vi.fn());
  const sync = () => layer.sync(referencesSig.peek(), referencePlanesSig.peek(), b, null);
  sync();
  expect(layer.pick(new Vector2(), camera)).toBe(b);
  expect(layer.group.getObjectByName('reference-plane-selection')?.visible).toBe(true);
  const controls = (
    layer.group.children.find((c) => 'controls' in c) as unknown as { controls: TransformControls }
  ).controls;
  expect(controls.enabled).toBe(false);
  controls.axis = 'X';
  expect(layer.busy()).toBe(false);
  sync();
  expect(controls.axis).toBeNull();
  updateReferencePlane(b, { width: 0.1, height: 0.1 });
  layer.sync(referencesSig.peek(), referencePlanesSig.peek(), b, 'translate');
  layer.group.updateMatrixWorld(true);
  const handle = new Vector2(0.02, -0.01);
  expect(layer.pick(handle, camera)).not.toBe(b);
  expect(layer.busy(handle)).toBe(true);
  controls.pointerDown(null);
  expect(controls.dragging).toBe(true);
  canvas.dispatchEvent(new Event('lostpointercapture'));
  expect(controls.dragging).toBe(false);
  layer.group.updateMatrixWorld(true);
  expect(layer.busy(handle)).toBe(true);
  controls.pointerDown(null);
  expect(controls.dragging).toBe(true);
  layer.sync(referencesSig.peek(), referencePlanesSig.peek(), b, null);
  updateReferencePlane(b, { visible: false });
  sync();
  expect(layer.pick(new Vector2(), camera)).toBe(a);
  updateReferencePlane(a, { opacity: 0 });
  sync();
  expect(layer.pick(new Vector2(), camera)).toBeNull();
  updateReferencePlane(b, { visible: true, position: [0, 0, 9.95] });
  sync();
  expect(layer.pick(new Vector2(), camera)).toBeNull();
  layer.dispose();
});

test.each([false, true])(
  'plane gizmo follows local step snapping or absolute world grid (world=%s)',
  (grid) => {
    vi.spyOn(TextureLoader.prototype, 'load').mockImplementation(
      () => new Texture<HTMLImageElement>(),
    );
    addReferenceUrl('https://example.com/a.png');
    const id = activeReferenceSig.peek()!.id;
    insertReferencePlane(id, [0.13, 0.17, 0.19], [0, 30, 0]);
    const layer = new ReferencePlanesLayer(
      new PerspectiveCamera(),
      document.createElement('canvas'),
      vi.fn(),
    );
    layer.configure({ snapMove: 0.25, snapRotate: 15, snapToGrid: grid });
    layer.sync(referencesSig.peek(), referencePlanesSig.peek(), id, 'translate');
    const controls = (
      layer.group.children.find((c) => 'controls' in c) as unknown as {
        controls: TransformControls;
      }
    ).controls;
    expect(controls.space).toBe(grid ? 'world' : 'local');
    layer.setSnapping(true);
    expect(controls.rotationSnap).toBeCloseTo(Math.PI / 12);
    const mesh = layer.group.getObjectByName(`reference-image-${id}`) as Mesh;
    controls.dispatchEvent({ type: 'mouseDown', mode: 'translate' });
    const origin = mesh.position.clone(),
      q = new Quaternion().setFromEuler(new Euler(0, Math.PI / 6, 0));
    mesh.position.add(new Vector3(1.1, 0.4, -1.22).applyQuaternion(q));
    controls.dispatchEvent({ type: 'objectChange' });
    const landed = referencePlanesSig.peek().get(id)!.position;
    const values = grid
      ? landed
      : new Vector3(...landed).sub(origin).applyQuaternion(q.invert()).toArray();
    for (const value of values) expect(value / 0.25).toBeCloseTo(Math.round(value / 0.25), 8);
    layer.setSnapping(false);
    expect(controls.rotationSnap).toBeNull();
    layer.dispose();
  },
);
