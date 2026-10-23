// Point markers (spec §12.1, §11.1): a diamond on each shown ephemeral point with an arrow along its
// normal, at a constant screen size, and a dashed line to its host's centre so it is clear which part
// it belongs to. Free points are white, points a part hangs from are grey, selected ones orange, and
// the points that selected parts are attached to are purple.
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineDashedMaterial,
  LineSegments,
  Matrix4,
  Vector3,
} from 'three';
import { PLACEHOLDER_BOX } from '../core/approx';
import type { Catalog } from '../core/catalog-types';
import { cfToMatrix4 } from '../core/cframe';
import { graphIndex } from '../core/graph';
import { subPartMatrix, type Poses } from '../core/pose';
import type { Doc, PartId, PointKey, Uuid } from '../core/types';
import type { CameraRig } from './cameras/rig';
import { markerCapacity, MarkerPool, srgbToLinear } from './markers';
import { ATTACH, worldPerPixel } from './sockets-layer';

export interface ShownPoint {
  readonly host: PartId;
  readonly uuid: Uuid;
  readonly world: Vector3;
}

/** On-screen radius of a marker's body, in CSS pixels. */
const RADIUS_PX = 6;
const FREE = { fill: 0xf2f4f7, rim: 0x2b2f36 };
const USED = { fill: 0x9aa1ab, rim: 0x2b2f36 };
const SELECTED = { fill: 0xff9d2e, rim: 0xffffff };
/** The dashes of the line to the host's centre, in CSS pixels. */
const DASH_PX = 6;
const GAP_PX = 4;

export class PointsLayer {
  readonly group = new Group();
  private readonly markers = new MarkerPool('diamond', this.group);
  /** Attach targets show through the parts in front of them, the selected part above all. */
  private readonly pinnedMarkers = new MarkerPool('diamond', this.group, true);
  private lineCapacity = 0;
  private readonly lines: LineSegments<BufferGeometry, LineDashedMaterial>;
  private list: ShownPoint[] = [];

  constructor() {
    const material = new LineDashedMaterial({
      dashSize: DASH_PX,
      gapSize: GAP_PX,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    });
    this.lines = new LineSegments(new BufferGeometry(), material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 3;
    this.group.add(this.lines);
  }

  /** Points currently drawn, for screen-space picking. */
  shown(): readonly ShownPoint[] {
    return this.list;
  }

  /**
   * Draws the points of `hosts` (free ones only when `freeOnly`), keeping the `max` nearest the camera,
   * plus the `attach` points, which are always drawn and purple.
   */
  update(
    doc: Doc,
    poses: Poses,
    cat: Catalog,
    hosts: readonly PartId[],
    rig: CameraRig,
    max: number,
    selected: ReadonlySet<PointKey>,
    freeOnly: boolean,
    attach: ReadonlySet<PointKey> = new Set(),
  ): void {
    const eye = rig.camera.position;
    const users = graphIndex(doc).pointUsers;
    type Candidate = ShownPoint & { m: Matrix4; d: number; used: boolean };
    const candidate = (host: PartId, uuid: Uuid): Candidate | null => {
      const part = doc.parts.get(host);
      const p = part?.points?.get(uuid);
      const world = poses.world.get(host);
      if (!part || !p || !world) return null;
      const m = world
        .clone()
        .multiply(subPartMatrix(cat, part.type, p.partName).m)
        .multiply(cfToMatrix4(p.cframe));
      const at = new Vector3().setFromMatrixPosition(m);
      const used = users.has(`${host}:${uuid}`);
      return { host, uuid, world: at, m, d: at.distanceTo(eye), used };
    };
    const all: Candidate[] = [];
    for (const host of hosts) {
      for (const uuid of doc.parts.get(host)?.points?.keys() ?? []) {
        if (attach.has(`${host}:${uuid}`)) continue;
        const c = candidate(host, uuid);
        if (c && !(freeOnly && c.used)) all.push(c);
      }
    }
    all.sort((a, b) => a.d - b.d);
    const pinned: Candidate[] = [];
    for (const key of attach) {
      const at = key.indexOf(':');
      const c = candidate(Number(key.slice(0, at)), key.slice(at + 1));
      if (c) pinned.push(c);
    }
    const rest = all.slice(0, Math.max(0, max));
    const shown = [...pinned, ...rest];
    const top = this.pinnedMarkers.get(pinned.length);
    const markers = this.markers.get(rest.length);
    const g = this.lineBuffers(shown.length);
    const positions = g.getAttribute('position') as BufferAttribute;
    const colors = g.getAttribute('color') as BufferAttribute;
    const distances = g.getAttribute('lineDistance') as BufferAttribute;
    const scale = new Matrix4();
    const centre = new Vector3();
    shown.forEach((c, i) => {
      const style =
        i < pinned.length
          ? ATTACH
          : selected.has(`${c.host}:${c.uuid}`)
            ? SELECTED
            : c.used
              ? USED
              : FREE;
      const size = RADIUS_PX * worldPerPixel(rig, c.d);
      const m = c.m.clone().multiply(scale.makeScale(size, size, size));
      const fill = srgbToLinear(style.fill);
      const rim = srgbToLinear(style.rim);
      if (i < pinned.length) top.set(i, m, fill, rim, 1);
      else markers.set(i - pinned.length, m, fill, rim, 1);
      hostCentre(doc, poses, cat, c.host, centre);
      positions.setXYZ(i * 2, c.world.x, c.world.y, c.world.z);
      positions.setXYZ(i * 2 + 1, centre.x, centre.y, centre.z);
      const rgb = srgbToLinear(style.fill);
      colors.setXYZ(i * 2, rgb[0], rgb[1], rgb[2]);
      colors.setXYZ(i * 2 + 1, rgb[0], rgb[1], rgb[2]);
      distances.setX(i * 2, 0);
      distances.setX(i * 2 + 1, screenLength(rig, c.world, centre));
    });
    top.finish(pinned.length);
    markers.finish(rest.length);
    for (const a of [positions, colors, distances]) a.needsUpdate = true;
    g.setDrawRange(0, shown.length * 2);
    this.list = shown.map(({ host, uuid, world }) => ({ host, uuid, world }));
  }

  dispose(): void {
    this.markers.dispose();
    this.pinnedMarkers.dispose();
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }

  /** Line buffers for at least `n` points; growing replaces them and frees the old ones. */
  private lineBuffers(n: number): BufferGeometry {
    if (this.lineCapacity > 0 && n <= this.lineCapacity) return this.lines.geometry;
    const capacity = (this.lineCapacity = markerCapacity(n));
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 6), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(capacity * 6), 3));
    g.setAttribute('lineDistance', new BufferAttribute(new Float32Array(capacity * 2), 1));
    g.setDrawRange(0, 0);
    this.lines.geometry.dispose();
    this.lines.geometry = g;
    return g;
  }
}

/** The centre of a host's bounding box in world space. */
function hostCentre(doc: Doc, poses: Poses, cat: Catalog, host: PartId, out: Vector3): Vector3 {
  const box = cat.parts[doc.parts.get(host)!.type]?.mesh ?? PLACEHOLDER_BOX;
  return out
    .set(
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    )
    .applyMatrix4(poses.world.get(host)!);
}

/** The on-screen length of a segment in CSS pixels, so dashes keep their size at any distance. */
function screenLength(rig: CameraRig, a: Vector3, b: Vector3): number {
  const pa = a.clone().project(rig.camera);
  const pb = b.clone().project(rig.camera);
  return Math.hypot(((pa.x - pb.x) * rig.width) / 2, ((pa.y - pb.y) * rig.height) / 2);
}
