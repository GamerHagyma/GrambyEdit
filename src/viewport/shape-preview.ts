// The Generators panel's shape preview (spec §13.9): the shape and its host drawn on a small offscreen
// WebGL canvas of their own, like the part thumbnails, then copied into the panel's canvas. A shape is
// loaded once per change and drawn from any angle, so the panel can turn it every frame.
import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three';
import { PLACEHOLDER_BOX } from '../core/approx';
import { computePoses } from '../core/pose';
import type { Doc } from '../core/types';
import { assetsSig, catalogSig } from '../state/store';
import { PartsLayer } from './parts-layer';
import { hasWebGL2 } from './renderer';

let renderer: WebGLRenderer | null = null;
let scene: Scene | null = null;
let layer: PartsLayer | null = null;
/** Whether WebGL2 works here; asked once. */
let webgl: boolean | null = null;
/** The loaded shape's middle and the radius that holds it; null when nothing is loaded. */
let fit: { readonly center: Vector3; readonly radius: number } | null = null;
const camera = new PerspectiveCamera(30, 1, 0.01, 100);

/** Where the camera looks from: `yaw` turns about +Y from +Z towards +X, `pitch` rises above level. */
export interface PreviewView {
  readonly yaw: number;
  readonly pitch: number;
}

/** The view a shape first shows in: from above, front right, as the part thumbnails. */
export const START_VIEW: PreviewView = {
  yaw: Math.atan2(1, 1.2),
  pitch: Math.asin(0.8 / Math.hypot(1, 0.8, 1.2)),
};

function setup(): WebGLRenderer | null {
  if (renderer) return renderer;
  webgl ??= hasWebGL2();
  if (!webgl) return null;
  try {
    renderer = new WebGLRenderer({
      canvas: document.createElement('canvas'),
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
  } catch {
    webgl = false;
    return null;
  }
  renderer.setPixelRatio(1);
  scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x3a3f47, 2.4));
  const sun = new DirectionalLight(0xffffff, 1.8);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  return renderer;
}

/**
 * Loads `sub`, posed and fitted, for `drawShapePreview`. Nothing is loaded for no shape, before the
 * part library loads, or without WebGL2; returns whether something is.
 */
export function loadShapePreview(sub: Doc | null): boolean {
  fit = null;
  const assets = assetsSig.peek();
  const cat = catalogSig.peek();
  const r = sub && assets && cat ? setup() : null;
  if (!r || !sub || !assets || !cat || !scene) return false;
  if (layer?.assets !== assets) {
    if (layer) {
      scene.remove(layer.group);
      layer.dispose();
    }
    layer = new PartsLayer(assets);
    scene.add(layer.group);
  }
  const poses = computePoses(sub, cat, cat.conventions);
  layer.sync(sub, poses, new Set(), false);

  // The parts' centres, padded by the largest part's half diagonal.
  const box = new Box3();
  const p = new Vector3();
  let reach = 0.25;
  for (const id of sub.order) {
    const m = poses.world.get(id);
    if (!m) continue;
    const b = cat.parts[sub.parts.get(id)!.type]?.mesh ?? PLACEHOLDER_BOX;
    p.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    box.expandByPoint(p.applyMatrix4(m));
    reach = Math.max(
      reach,
      Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2,
    );
  }
  const sphere = box.getBoundingSphere(new Sphere());
  fit = { center: sphere.center, radius: sphere.radius + reach };
  return true;
}

/** Draws the loaded shape into `out` from `view`, fitted to the frame; `out` stays clear without one. */
export function drawShapePreview(out: HTMLCanvasElement, view: PreviewView): void {
  const g = out.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, out.width, out.height);
  if (!fit || !renderer || !scene) return;
  renderer.setSize(out.width, out.height, false);
  const { center, radius } = fit;
  const aspect = out.width / out.height;
  const half = MathUtils.degToRad(15);
  const distance = (radius / Math.sin(Math.min(half, Math.atan(Math.tan(half) * aspect)))) * 1.05;
  camera.aspect = aspect;
  camera.near = radius / 100;
  camera.far = radius * 100;
  camera.updateProjectionMatrix();
  const { yaw, pitch } = view;
  camera.position
    .set(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw))
    .multiplyScalar(distance)
    .add(center);
  camera.lookAt(center);
  renderer.render(scene, camera);
  g.drawImage(renderer.domElement, 0, 0, out.width, out.height);
}
