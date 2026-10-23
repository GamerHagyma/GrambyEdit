// Socket markers (spec §11.1): a shaded sphere on each socket with an arrow along its outward normal, at
// a constant screen size, coloured by role. Used sockets fade to 35%, sockets a mount has consumed are
// red, and the sockets that selected parts are attached to are purple.
import { Group, MathUtils, Matrix4, Vector3 } from 'three';
import type { Catalog, SocketRole } from '../core/catalog-types';
import { cfToMatrix4 } from '../core/cframe';
import type { Poses } from '../core/pose';
import { isSocketUsed, mountSockets, pieceSockets, socketRole } from '../core/rules';
import type { Doc, PartId, SocketId } from '../core/types';
import type { CameraRig } from './cameras/rig';
import { MarkerPool, srgbToLinear } from './markers';

export { srgbToLinear } from './markers';

export interface ShownSocket {
  readonly part: PartId;
  readonly socket: SocketId;
  readonly world: Vector3;
}

/** Fill and outline colours per role, as sRGB hex. */
const STYLE: Record<
  'input' | 'output' | 'conductor' | 'mount' | 'socket',
  { fill: number; rim: number }
> = {
  input: { fill: 0xe5484d, rim: 0x5c1013 },
  output: { fill: 0x3a3f47, rim: 0xffffff },
  conductor: { fill: 0x8e4ec6, rim: 0x2e1446 },
  mount: { fill: 0xf0a020, rim: 0x5a3a05 },
  socket: { fill: 0x7cc4fa, rim: 0x163e5e },
};
const CONSUMED = { fill: 0xe5484d, rim: 0xffffff };
/** Where a selected part is attached (spec: "highlight the point a part is placed on"). */
export const ATTACH = { fill: 0xb57bff, rim: 0xffffff };
/** On-screen radius of a marker's body, in CSS pixels. */
const RADIUS_PX = 6;
/** Above this many selected parts, only the hovered part shows its sockets. */
const MAX_SELECTED_PARTS = 400;

/** `part:socket`, the key of an attach target. */
export const socketKey = (part: PartId, socket: SocketId): string => `${part}:${socket}`;

/** World units per CSS pixel at distance `d` from the eye. */
export function worldPerPixel(rig: CameraRig, d: number): number {
  return rig.isOrtho
    ? rig.unitsPerPixel()
    : ((2 * Math.tan(MathUtils.degToRad(rig.persp.fov / 2))) / rig.height) * d;
}

export class SocketsLayer {
  readonly group = new Group();
  private readonly markers = new MarkerPool('sphere', this.group);
  /** Attach targets show through the parts in front of them, the selected part above all. */
  private readonly pinnedMarkers = new MarkerPool('sphere', this.group, true);
  private list: ShownSocket[] = [];

  /** Sockets currently drawn, for screen-space picking. */
  shown(): readonly ShownSocket[] {
    return this.list;
  }

  /**
   * Rebuilds the markers for the sockets of `parts`, keeping the `max` nearest the camera, plus the
   * `attach` sockets (`part:socket`), which are always drawn and purple. Call it when the doc, the
   * shown parts or the camera change; it is cheap at a few thousand sockets.
   */
  update(
    doc: Doc,
    poses: Poses,
    cat: Catalog,
    parts: readonly PartId[],
    rig: CameraRig,
    max: number,
    attach: ReadonlySet<string> = new Set(),
  ): void {
    const eye = rig.camera.position;
    type Candidate = { part: PartId; socket: SocketId; m: Matrix4; world: Vector3; d: number };
    const candidate = (id: PartId, socket: SocketId): Candidate | null => {
      const part = doc.parts.get(id);
      const world = poses.world.get(id);
      const s = part && cat.parts[part.type]?.sockets[socket];
      if (!world || !s) return null;
      const m = world.clone().multiply(cfToMatrix4(s.frame));
      const p = new Vector3().setFromMatrixPosition(m);
      return { part: id, socket, m, world: p, d: p.distanceTo(eye) };
    };
    const all: Candidate[] = [];
    for (const id of parts.length > MAX_SELECTED_PARTS ? parts.slice(0, 1) : parts) {
      const def = doc.parts.has(id) && cat.parts[doc.parts.get(id)!.type];
      if (!def) continue;
      for (const socket of Object.keys(def.sockets)) {
        const c = !attach.has(socketKey(id, socket)) && candidate(id, socket);
        if (c) all.push(c);
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
    const scale = new Matrix4();
    const sized = (c: Candidate) => {
      const size = RADIUS_PX * worldPerPixel(rig, c.d);
      return c.m.clone().multiply(scale.makeScale(size, size, size));
    };
    const top = this.pinnedMarkers.get(pinned.length);
    pinned.forEach((c, i) =>
      top.set(i, sized(c), srgbToLinear(ATTACH.fill), srgbToLinear(ATTACH.rim), 1),
    );
    top.finish(pinned.length);
    const markers = this.markers.get(rest.length);
    rest.forEach((c, i) => {
      const part = doc.parts.get(c.part)!;
      const def = cat.parts[part.type]!;
      const m = sized(c);
      const role: SocketRole = socketRole(cat, part.type, c.socket);
      const used = isSocketUsed(doc, c.part, c.socket);
      const consumed =
        !used &&
        mountSockets(doc, c.part).some(
          (m) => m !== c.socket && pieceSockets(def, m).includes(c.socket),
        );
      const style = consumed ? CONSUMED : STYLE[role ?? 'socket'];
      markers.set(i, m, srgbToLinear(style.fill), srgbToLinear(style.rim), used ? 0.35 : 1);
    });
    markers.finish(rest.length);
    this.list = [...pinned, ...rest].map(({ part, socket, world }) => ({ part, socket, world }));
  }

  dispose(): void {
    this.markers.dispose();
    this.pinnedMarkers.dispose();
  }
}
