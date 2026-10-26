// @vitest-environment jsdom
import { Texture, TextureLoader, PerspectiveCamera, Mesh, SRGBColorSpace } from 'three';
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
