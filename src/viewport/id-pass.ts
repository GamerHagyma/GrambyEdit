// The ID pass (spec §11.2): for visible-only box select, every instance is drawn with
// `base + gl_InstanceID + 1` packed into RGB, then the box region is read back.
import { ShaderMaterial, WebGLRenderTarget, type InstancedMesh, type Material } from 'three';
import type { PartId } from '../core/types';
import type { ViewportContext } from './context';

const VERTEX = /* glsl */ `
uniform float uBase;
flat varying float vId;
void main() {
  vId = uBase + float(gl_InstanceID) + 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
flat varying float vId;
void main() {
  gl_FragColor = vec4(mod(vId, 256.0), mod(floor(vId / 256.0), 256.0), floor(vId / 65536.0), 255.0) / 255.0;
}`;

const materials = new WeakMap<InstancedMesh, ShaderMaterial>();
let target: WebGLRenderTarget | null = null;

function materialFor(mesh: InstancedMesh): ShaderMaterial {
  let m = materials.get(mesh);
  if (!m) {
    m = new ShaderMaterial({
      uniforms: { uBase: { value: 0 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    materials.set(mesh, m);
  }
  return m;
}

/** The parts whose visible pixels fall inside a client-space rectangle. */
export function readIds(
  vp: ViewportContext,
  rect: { x0: number; y0: number; x1: number; y1: number },
): Set<PartId> {
  const out = new Set<PartId>();
  const layer = vp.layer;
  if (!layer) return out;
  const { renderer, canvas } = vp;
  const W = canvas.width;
  const H = canvas.height;
  target ??= new WebGLRenderTarget(W, H);
  if (target.width !== W || target.height !== H) target.setSize(W, H);

  const r = canvas.getBoundingClientRect();
  const sx = W / r.width;
  const sy = H / r.height;
  const x0 = Math.max(0, Math.floor((Math.min(rect.x0, rect.x1) - r.left) * sx));
  const x1 = Math.min(W, Math.ceil((Math.max(rect.x0, rect.x1) - r.left) * sx));
  const y0 = Math.max(0, Math.floor((Math.min(rect.y0, rect.y1) - r.top) * sy));
  const y1 = Math.min(H, Math.ceil((Math.max(rect.y0, rect.y1) - r.top) * sy));
  if (x1 <= x0 || y1 <= y0) return out;

  const meshes = layer.meshes();
  const saved: Material[] = [];
  const bases: number[] = [];
  let base = 0;
  for (const mesh of meshes) {
    saved.push(mesh.material as Material);
    const m = materialFor(mesh);
    m.uniforms.uBase.value = base;
    bases.push(base);
    base += mesh.count;
    mesh.material = m;
  }
  const previous = renderer.getRenderTarget();
  const alpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearAlpha(0);
  renderer.clear();
  renderer.render(layer.group, vp.rig.camera);
  const w = x1 - x0;
  const h = y1 - y0;
  const pixels = new Uint8Array(w * h * 4);
  // WebGL rows run bottom-up.
  renderer.readRenderTargetPixels(target, x0, H - y1, w, h, pixels);
  renderer.setRenderTarget(previous);
  renderer.setClearAlpha(alpha);
  meshes.forEach((mesh, i) => (mesh.material = saved[i]));

  const seen = new Set<number>();
  for (let i = 0; i < pixels.length; i += 4) {
    const index = pixels[i] + pixels[i + 1] * 256 + pixels[i + 2] * 65536;
    if (index === 0 || seen.has(index)) continue;
    seen.add(index);
    const global = index - 1;
    let k = bases.length - 1;
    while (k > 0 && bases[k] > global) k--;
    const id = layer.partAt(meshes[k], global - bases[k]);
    if (id !== undefined) out.add(id);
  }
  return out;
}
