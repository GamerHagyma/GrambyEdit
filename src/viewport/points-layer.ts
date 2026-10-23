// Point markers (spec §12.1): a diamond on each shown ephemeral point, flat on the point's frame and
// at a constant screen size. Free points are light, points a part hangs from are grey, selected ones orange.
import { Group, MathUtils, Matrix4, PlaneGeometry, Vector3, type BufferGeometry } from 'three';
import type { Catalog } from '../core/catalog-types';
import { cfToMatrix4 } from '../core/cframe';
import { graphIndex } from '../core/graph';
import { subPartMatrix, type Poses } from '../core/pose';
import type { Doc, PartId, PointKey, Uuid } from '../core/types';
import type { CameraRig } from './cameras/rig';
import { Markers, srgbToLinear } from './sockets-layer';

export interface ShownPoint {
  readonly host: PartId;
  readonly uuid: Uuid;
  readonly world: Vector3;
}

/** On-screen half-size of a marker, in CSS pixels. */
const RADIUS_PX = 6;
const FREE = { fill: 0xf2f4f7, rim: 0x2b2f36 };
const USED = { fill: 0x9aa1ab, rim: 0x2b2f36 };
const SELECTED = { fill: 0xff9d2e, rim: 0xffffff };

export class PointsLayer {
  readonly group = new Group();
  private fills: Markers | null = null;
  private rims: Markers | null = null;
  private capacity = 0;
  private list: ShownPoint[] = [];

  /** Points currently drawn, for screen-space picking. */
  shown(): readonly ShownPoint[] {
    return this.list;
  }

  /** Draws the points of `hosts` (free ones only when `freeOnly`), keeping the `max` nearest the camera. */
  update(
    doc: Doc,
    poses: Poses,
    cat: Catalog,
    hosts: readonly PartId[],
    rig: CameraRig,
    max: number,
    selected: ReadonlySet<PointKey>,
    freeOnly: boolean,
  ): void {
    const eye = rig.camera.position;
    const users = graphIndex(doc).pointUsers;
    type Candidate = ShownPoint & { m: Matrix4; d: number; used: boolean };
    const all: Candidate[] = [];
    for (const host of hosts) {
      const part = doc.parts.get(host);
      const world = poses.world.get(host);
      if (!part?.points || !world) continue;
      for (const [uuid, p] of part.points) {
        const used = users.has(`${host}:${uuid}`);
        if (freeOnly && used) continue;
        const m = world
          .clone()
          .multiply(subPartMatrix(cat, part.type, p.partName).m)
          .multiply(cfToMatrix4(p.cframe));
        const at = new Vector3().setFromMatrixPosition(m);
        all.push({ host, uuid, world: at, m, d: at.distanceTo(eye), used });
      }
    }
    all.sort((a, b) => a.d - b.d);
    const shown = all.slice(0, Math.max(0, max));
    this.ensure(shown.length);
    const perPixel = rig.isOrtho
      ? rig.unitsPerPixel()
      : (2 * Math.tan(MathUtils.degToRad(rig.persp.fov / 2))) / rig.height;
    const scale = new Matrix4();
    const lift = new Matrix4().makeTranslation(0, 0.012, 0);
    shown.forEach((c, i) => {
      const style = selected.has(`${c.host}:${c.uuid}`) ? SELECTED : c.used ? USED : FREE;
      const size = RADIUS_PX * (rig.isOrtho ? perPixel : perPixel * c.d);
      scale.makeScale(size, size, size);
      const m = c.m.clone().multiply(lift).multiply(scale);
      this.rims!.set(i, m, srgbToLinear(style.rim), 1);
      this.fills!.set(i, m, srgbToLinear(style.fill), 1);
    });
    this.rims!.finish(shown.length);
    this.fills!.finish(shown.length);
    this.list = shown.map(({ host, uuid, world }) => ({ host, uuid, world }));
  }

  dispose(): void {
    this.fills?.dispose();
    this.rims?.dispose();
  }

  /** Allocates marker meshes for at least `n` points, doubling as needed. */
  private ensure(n: number): void {
    if (n <= this.capacity && this.fills) return;
    this.dispose();
    this.capacity = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(n, 1))));
    // A diamond lying in the point's XZ plane: a square turned 45° about +Y.
    const diamond = (side: number): BufferGeometry =>
      new PlaneGeometry(side, side).rotateX(-Math.PI / 2).rotateY(Math.PI / 4);
    this.rims = new Markers(diamond(2), this.capacity, this.group);
    this.fills = new Markers(diamond(1.3), this.capacity, this.group);
    this.rims.mesh.renderOrder = 1;
    this.fills.mesh.renderOrder = 2;
  }
}
