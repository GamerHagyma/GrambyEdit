// Instanced 3D markers for sockets and points (spec §11.1): a shaded body with an arrow along its +Y
// (the outward normal) and a contrasting outline, so a marker reads from every side, as in game. The
// body is a sphere for sockets and a diamond for points. Sizes are in marker units: the body has
// radius 1 and the arrow reaches 2.7; callers scale each instance to a constant screen size.
import {
  BackSide,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  OctahedronGeometry,
  ShaderMaterial,
  type BufferGeometry,
  type Matrix4,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type MarkerShape = 'sphere' | 'diamond';
export type Rgb = readonly [number, number, number];

/** The body (radius 1 at the origin) and an outward arrow along +Y, as one non-indexed geometry. */
export function markerGeometry(shape: MarkerShape): BufferGeometry {
  const body = shape === 'sphere' ? new IcosahedronGeometry(1, 2) : new OctahedronGeometry(1.3, 0);
  const shaft = new CylinderGeometry(0.17, 0.17, 1.1, 8).translate(0, 1.45, 0);
  const head = new ConeGeometry(0.45, 0.75, 12).translate(0, 2.35, 0);
  const parts = [body, shaft, head].map((g) => {
    const flat = g.index ? g.toNonIndexed() : g;
    flat.deleteAttribute('uv');
    return flat;
  });
  return mergeGeometries(parts)!;
}

const FILL_VERTEX = /* glsl */ `
attribute vec4 aColor;
varying vec4 vColor;
varying vec3 vNormal;
void main() {
  vColor = aColor;
  vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const FILL_FRAGMENT = /* glsl */ `
varying vec4 vColor;
varying vec3 vNormal;
void main() {
  // Lit from the viewer's upper left, so the body reads as round.
  float light = 0.6 + 0.4 * max(dot(normalize(vNormal), vec3(-0.35, 0.55, 0.76)), 0.0);
  gl_FragColor = vec4(vColor.rgb * light, vColor.a);
  #include <colorspace_fragment>
}`;
/** The outline: back faces pushed out along the normals, in the rim colour. */
const RIM_VERTEX = /* glsl */ `
attribute vec4 aRim;
varying vec4 vColor;
void main() {
  vColor = aRim;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position + normal * 0.2, 1.0);
}`;
const RIM_FRAGMENT = /* glsl */ `
varying vec4 vColor;
void main() {
  gl_FragColor = vColor;
  #include <colorspace_fragment>
}`;

/** sRGB hex → linear RGB, the colour space the marker shaders work in. */
export function srgbToLinear(hex: number): Rgb {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255)];
}

/**
 * A fixed-capacity set of markers of one shape: an outline pass and a shaded fill pass. `onTop`
 * markers ignore depth, so they show through the parts in front of them.
 */
export class Markers {
  private readonly fill: InstancedMesh;
  private readonly rim: InstancedMesh;
  private readonly fills: InstancedBufferAttribute;
  private readonly rims: InstancedBufferAttribute;

  constructor(
    shape: MarkerShape,
    readonly capacity: number,
    group: Group,
    onTop = false,
  ) {
    const geometry = markerGeometry(shape);
    this.fills = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.rims = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    geometry.setAttribute('aColor', this.fills);
    geometry.setAttribute('aRim', this.rims);
    const material = (vertexShader: string, fragmentShader: string, back: boolean) =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: !onTop,
        side: back ? BackSide : undefined,
      });
    this.rim = new InstancedMesh(geometry, material(RIM_VERTEX, RIM_FRAGMENT, true), capacity);
    this.fill = new InstancedMesh(geometry, material(FILL_VERTEX, FILL_FRAGMENT, false), capacity);
    for (const [mesh, order] of [
      [this.rim, onTop ? 5 : 1],
      [this.fill, onTop ? 6 : 2],
    ] as const) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = order;
      group.add(mesh);
    }
  }

  set(i: number, m: Matrix4, fill: Rgb, rim: Rgb, alpha: number): void {
    this.fill.setMatrixAt(i, m);
    this.rim.setMatrixAt(i, m);
    this.fills.setXYZW(i, fill[0], fill[1], fill[2], alpha);
    this.rims.setXYZW(i, rim[0], rim[1], rim[2], alpha);
  }

  finish(count: number): void {
    for (const mesh of [this.fill, this.rim]) {
      mesh.count = Math.min(count, this.capacity);
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.fills.needsUpdate = true;
    this.rims.needsUpdate = true;
  }

  dispose(): void {
    this.fill.removeFromParent();
    this.rim.removeFromParent();
    this.fill.geometry.dispose();
    (this.fill.material as ShaderMaterial).dispose();
    (this.rim.material as ShaderMaterial).dispose();
    this.fill.dispose();
    this.rim.dispose();
  }
}

/** Capacity for `n` markers: at least 64, doubling, so a growing build reallocates rarely. */
export const markerCapacity = (n: number): number =>
  Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(n, 1))));

/** Markers that grow on demand; growing replaces the meshes and removes the old ones from the group. */
export class MarkerPool {
  private markers: Markers | null = null;

  constructor(
    private readonly shape: MarkerShape,
    private readonly group: Group,
    private readonly onTop = false,
  ) {}

  /** Markers with room for at least `n` instances. */
  get(n: number): Markers {
    if (this.markers && n <= this.markers.capacity) return this.markers;
    this.markers?.dispose();
    return (this.markers = new Markers(this.shape, markerCapacity(n), this.group, this.onTop));
  }

  dispose(): void {
    this.markers?.dispose();
    this.markers = null;
  }
}
