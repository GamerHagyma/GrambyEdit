// Socket markers (spec §11.1): flat discs on each socket frame, at a constant screen size, colored by
// role; used sockets fade to 35% and sockets a mount has consumed show a red cross.
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { Catalog, SocketRole } from '../core/catalog-types';
import { cfToMatrix4 } from '../core/cframe';
import type { Poses } from '../core/pose';
import { isSocketUsed, mountSockets, pieceSockets, socketRole } from '../core/rules';
import type { Doc, PartId, SocketId } from '../core/types';
import type { CameraRig } from './cameras/rig';

export interface ShownSocket {
  readonly part: PartId;
  readonly socket: SocketId;
  readonly world: Vector3;
}

/** Fill and rim colors per role, as sRGB hex. */
const STYLE: Record<
  'input' | 'output' | 'conductor' | 'mount' | 'socket',
  { fill: number; rim: number }
> = {
  input: { fill: 0xe5484d, rim: 0x8c1d21 },
  output: { fill: 0x2b2f36, rim: 0xffffff },
  conductor: { fill: 0x8e4ec6, rim: 0x4b2470 },
  mount: { fill: 0xf0a020, rim: 0x8a5a0a },
  socket: { fill: 0x7cc4fa, rim: 0x2b6aa0 },
};
const CROSS = 0xe5484d;
/** On-screen radius of a marker, in CSS pixels. */
const RADIUS_PX = 7;
/** Above this many selected parts, only the hovered part shows its sockets. */
const MAX_SELECTED_PARTS = 400;

const VERTEX = /* glsl */ `
attribute vec4 aColor;
varying vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const FRAGMENT = /* glsl */ `
varying vec4 vColor;
void main() {
  gl_FragColor = vColor;
  #include <colorspace_fragment>
}`;

export function srgbToLinear(hex: number): [number, number, number] {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255)];
}

export class Markers {
  readonly mesh: InstancedMesh;
  private readonly colors: InstancedBufferAttribute;

  constructor(
    geometry: BufferGeometry,
    private capacity: number,
    group: Group,
  ) {
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.colors = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    geometry.setAttribute('aColor', this.colors);
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    group.add(this.mesh);
  }

  set(i: number, m: Matrix4, rgb: [number, number, number], alpha: number): void {
    this.mesh.setMatrixAt(i, m);
    this.colors.setXYZW(i, rgb[0], rgb[1], rgb[2], alpha);
  }

  finish(count: number): void {
    this.mesh.count = Math.min(count, this.capacity);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colors.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
    this.mesh.dispose();
  }
}

export class SocketsLayer {
  readonly group = new Group();
  private fills: Markers | null = null;
  private rims: Markers | null = null;
  private crosses: Markers | null = null;
  private capacity = 0;
  private list: ShownSocket[] = [];

  /** Sockets currently drawn, for screen-space picking. */
  shown(): readonly ShownSocket[] {
    return this.list;
  }

  /**
   * Rebuilds the markers for the sockets of `parts`, keeping the `max` nearest the camera. Call it
   * when the doc, the shown parts or the camera change; it is cheap at a few thousand sockets.
   */
  update(
    doc: Doc,
    poses: Poses,
    cat: Catalog,
    parts: readonly PartId[],
    rig: CameraRig,
    max: number,
  ): void {
    const eye = rig.camera.position;
    type Candidate = { part: PartId; socket: SocketId; m: Matrix4; world: Vector3; d: number };
    const all: Candidate[] = [];
    for (const id of parts.length > MAX_SELECTED_PARTS ? parts.slice(0, 1) : parts) {
      const part = doc.parts.get(id);
      const world = poses.world.get(id);
      const def = part && cat.parts[part.type];
      if (!part || !world || !def) continue;
      for (const [socket, s] of Object.entries(def.sockets)) {
        const m = world.clone().multiply(cfToMatrix4(s.frame));
        const p = new Vector3().setFromMatrixPosition(m);
        all.push({ part: id, socket, m, world: p, d: p.distanceTo(eye) });
      }
    }
    all.sort((a, b) => a.d - b.d);
    const shown = all.slice(0, Math.max(0, max));
    this.ensure(shown.length);
    const fills = this.fills!;
    const rims = this.rims!;
    const crosses = this.crosses!;
    // World units per pixel: fixed in ortho, growing with distance in perspective.
    const perPixel = rig.isOrtho
      ? rig.unitsPerPixel()
      : (2 * Math.tan(MathUtils.degToRad(rig.persp.fov / 2))) / rig.height;
    const scale = new Matrix4();
    const lift = new Matrix4().makeTranslation(0, 0.01, 0);
    let crossCount = 0;
    shown.forEach((c, i) => {
      const part = doc.parts.get(c.part)!;
      const def = cat.parts[part.type]!;
      const role: SocketRole = socketRole(cat, part.type, c.socket);
      const style = STYLE[role ?? 'socket'];
      const used = isSocketUsed(doc, c.part, c.socket);
      const consumed =
        !used &&
        mountSockets(doc, c.part).some(
          (m) => m !== c.socket && pieceSockets(def, m).includes(c.socket),
        );
      const size = RADIUS_PX * (rig.isOrtho ? perPixel : perPixel * c.d);
      scale.makeScale(size, size, size);
      const m = c.m.clone().multiply(lift).multiply(scale);
      const alpha = used ? 0.35 : 1;
      fills.set(i, m, srgbToLinear(style.fill), alpha);
      rims.set(i, m, srgbToLinear(style.rim), alpha);
      if (consumed) crosses.set(crossCount++, m, srgbToLinear(CROSS), 1);
    });
    fills.finish(shown.length);
    rims.finish(shown.length);
    crosses.finish(crossCount);
    this.list = shown.map(({ part, socket, world }) => ({ part, socket, world }));
  }

  dispose(): void {
    this.fills?.dispose();
    this.rims?.dispose();
    this.crosses?.dispose();
  }

  /** Allocates marker meshes for at least `n` sockets, doubling as needed. */
  private ensure(n: number): void {
    if (n <= this.capacity && this.fills) return;
    this.dispose();
    this.capacity = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(n, 1))));
    const flat = (g: BufferGeometry) => g.rotateX(-Math.PI / 2);
    this.fills = new Markers(flat(new CircleGeometry(0.72, 20)), this.capacity, this.group);
    this.rims = new Markers(flat(new RingGeometry(0.72, 1, 20)), this.capacity, this.group);
    const bar = (angle: number) => flat(new PlaneGeometry(1.6, 0.28).rotateZ(angle));
    const cross = mergeTwo(bar(Math.PI / 4), bar(-Math.PI / 4));
    this.crosses = new Markers(cross, this.capacity, this.group);
  }
}

/** Two plane geometries merged into one non-indexed geometry, for the ✕ marker. */
function mergeTwo(a: BufferGeometry, b: BufferGeometry): BufferGeometry {
  const pa = a.toNonIndexed().getAttribute('position').array;
  const pb = b.toNonIndexed().getAttribute('position').array;
  const merged = new Float32Array(pa.length + pb.length);
  merged.set(pa);
  merged.set(pb, pa.length);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(merged, 3));
  return g;
}
