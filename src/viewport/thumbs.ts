// Part thumbnails (spec §13.1): each type is drawn once on a small offscreen WebGL canvas of its own,
// so cards can ask for thumbnails before the 3D view mounts. Registered when this module loads.
import {
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { partGeometry } from '../assets/geometry';
import { setThumbnailRenderer } from '../assets/thumbnails';
import { PLACEHOLDER_BOX } from '../core/approx';
import { assetsSig } from '../state/store';

const SIZE = 128;
let renderer: WebGLRenderer | null = null;
let material: MeshStandardMaterial | null = null;
/** One thumbnail at a time on the shared canvas. */
let queue: Promise<unknown> = Promise.resolve();

function setup(): WebGLRenderer {
  const r = new WebGLRenderer({
    canvas: document.createElement('canvas'),
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  r.setPixelRatio(1);
  r.setSize(SIZE, SIZE, false);
  // Baked part colors; the color attribute's alpha is the paint flag, so it is forced to 1.
  material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      '#include <color_vertex>\nvColor.a = 1.0;',
    );
  };
  material.customProgramCacheKey = () => 'grambyedit-thumbnail';
  return r;
}

function draw(type: string): Promise<Blob> {
  const assets = assetsSig.peek();
  if (!assets) return Promise.reject(new Error('The part library is still loading.'));
  renderer ??= setup();
  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x3a3f47, 2.4));
  const sun = new DirectionalLight(0xffffff, 1.8);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  scene.add(new Mesh(partGeometry(assets, type), material!));
  const box = assets.catalog.parts[type]?.mesh ?? PLACEHOLDER_BOX;
  const center = new Vector3(
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  );
  const radius = Math.max(
    0.1,
    Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) / 2,
  );
  const camera = new PerspectiveCamera(30, 1, 0.01, 1000);
  const distance = (radius / Math.sin(MathUtils.degToRad(15))) * 1.05;
  camera.position.copy(center).addScaledVector(new Vector3(1, 0.8, 1.2).normalize(), distance);
  camera.lookAt(center);
  renderer.render(scene, camera);
  const canvas = renderer.domElement;
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`Could not draw a thumbnail for ${type}.`))),
      'image/png',
    ),
  );
}

setThumbnailRenderer((type) => {
  const next = queue.then(() => draw(type));
  queue = next.catch(() => {});
  return next;
});
