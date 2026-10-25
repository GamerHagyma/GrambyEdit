// The Place tool (spec §12.6): a ghost of the armed part, creation, paste or shape follows the cursor
// and snaps to free sockets, free points and part surfaces; a click places it. Over empty space it lands
// on the ground as a new root (with a hint that share codes do not keep root positions). It stays armed
// until Esc or a right click.
import { effect } from '@preact/signals';
import { Matrix4, Plane, Vector3, type Vector2 } from 'three';
import type { Catalog } from '../core/catalog-types';
import { cfToMatrix4, matrix4ToCf } from '../core/cframe';
import { childWorldViaPoint, childWorldViaSocket } from '../core/conventions';
import { defaultChildSocket } from '../core/defaults';
import { frameFromNormal } from '../core/frames';
import { insertSubDoc } from '../core/ops/clipboard';
import type { PoseTarget } from '../core/ops/move';
import {
  bodyOfSocket,
  bodyPivot,
  bodyWorld,
  childSocketMatrix,
  computePoses,
  ignoresOrientation,
  poseConn,
  socketMatrix,
  subPartMatrix,
} from '../core/pose';
import { canBeParent, canTakeChild } from '../core/rules';
import type { Doc, Part, PartId } from '../core/types';
import { PLACEHOLDER_BOX } from '../core/approx';
import { posesSig } from '../state/derived';
import { pushRecent } from '../state/favourites';
import { disarm, placeSig, resolveSub } from '../state/place';
import { select } from '../state/selection';
import { catalogSig, commit, docSig } from '../state/store';
import { toast } from '../state/toasts';
import { statusHintSig } from '../state/ui';
import { shiftSocketSig, socketFocusSig } from '../state/socket-focus';
import { hoverSig } from '../state/selection';
import { addPlacementSymmetry, placementSymmetryGhosts } from '../state/symmetry';
import { getViewport } from '../viewport/context';
import { cursorRay, pickPart, pickPoint, pickSocketWhere } from '../viewport/raycast';
import { setTool, type Tool, type ToolPointer } from './manager';

export const PLACE_HINT = 'Root positions are not stored in share codes.';

/** Where a click would place the sub-doc's first root: attached to a target, or as a root. */
type Spot =
  | { readonly kind: 'attach'; readonly target: PoseTarget; readonly world: Matrix4 }
  | { readonly kind: 'root'; readonly world: Matrix4 };

const GROUND = new Plane(new Vector3(0, 1, 0), 0);

/** A parent-side socket a new part of `type` could attach to now. */
function attachable(cat: Catalog, doc: Doc, type: string, s: { part: PartId; socket: string }) {
  const host = doc.parts.get(s.part);
  const side = host && cat.parts[host.type]?.sockets[s.socket]?.side;
  return (
    (side === 'parent' || side === 'both') &&
    defaultChildSocket(cat, type, host!.type, s.socket) !== null &&
    canBeParent(doc, cat, s.part, s.socket).ok
  );
}

/** The spot under the cursor for a sub-doc whose first root is `root`. */
function findSpot(cat: Catalog, root: Part, ndc: Vector2): Spot | null {
  const doc = docSig.value;
  const poses = posesSig.value;
  const conv = cat.conventions;
  const { type, props } = root;
  const accepts = (s: { part: PartId; socket: string }) => attachable(cat, doc, type, s);
  socketFocusSig.value = accepts;
  const sock = pickSocketWhere(ndc, accepts, 12);
  if (sock && attachable(cat, doc, type, sock)) {
    hoverSig.value = sock.part;
    const host = doc.parts.get(sock.part)!;
    const self = defaultChildSocket(cat, type, host.type, sock.socket)!;
    const world = childWorldViaSocket(
      bodyWorld(poses, sock.part, bodyOfSocket(cat.parts[host.type], sock.socket))!,
      socketMatrix(cat, host.type, sock.socket, host.props).m,
      childSocketMatrix(cat, type, self, { type: host.type, socket: sock.socket }).m,
      ignoresOrientation(cat, host.type, sock.socket) ? {} : props,
      conv,
      bodyPivot(cat, type, self),
    );
    return { kind: 'attach', target: { kind: 'socket', ...sock, childSocket: self }, world };
  }
  if (shiftSocketSig.peek()) {
    hoverSig.value = pickPart(ndc)?.part ?? null;
    return null;
  }
  const mount = Object.hasOwn(cat.parts, type) ? cat.parts[type].defaultMount : null;
  if (mount !== null) {
    const p = pickPoint(ndc);
    if (p && canTakeChild(doc, p.host, p.uuid).ok) {
      const host = doc.parts.get(p.host)!;
      const point = host.points!.get(p.uuid)!;
      const world = childWorldViaPoint(
        poses.world.get(p.host)!,
        subPartMatrix(cat, host.type, point.partName, host.props).m,
        cfToMatrix4(point.cframe),
        childSocketMatrix(cat, type, mount, 'point').m,
        props,
        conv,
        bodyPivot(cat, type, mount),
      );
      return { kind: 'attach', target: { kind: 'point', part: p.host, uuid: p.uuid }, world };
    }
    const hit = pickPart(ndc);
    hoverSig.value = hit?.part ?? null;
    if (hit) {
      const frame = cfToMatrix4(frameFromNormal(hit.point.toArray(), hit.normal.toArray()));
      const world = childWorldViaPoint(
        frame,
        new Matrix4(),
        new Matrix4(),
        childSocketMatrix(cat, type, mount, 'point').m,
        props,
        conv,
        bodyPivot(cat, type, mount),
      );
      return {
        kind: 'attach',
        target: { kind: 'surface', part: hit.part, frame, partName: hit.subPart },
        world,
      };
    }
  }
  // Empty space: on the ground, resting on its lowest point.
  const at = cursorRay(ndc)?.intersectPlane(GROUND, new Vector3());
  if (!at) return null;
  const box = cat.parts[type]?.mesh ?? PLACEHOLDER_BOX;
  return { kind: 'root', world: new Matrix4().makeTranslation(at.x, at.y - box.min[1], at.z) };
}

export function createPlaceTool(): Tool {
  let sub: Doc | null = null;
  let subWorld: ReadonlyMap<PartId, Matrix4> | null = null;
  let root: Part | null = null;
  let spot: Spot | null = null;
  let cursor: Vector2 | null = null;
  let stopSource: (() => void) | null = null;

  const showGhost = () => {
    const vp = getViewport();
    if (!vp?.ghost) return;
    if (!sub || !spot || !subWorld) vp.ghost.show(null, new Map());
    else {
      const worlds = new Map<PartId, Matrix4>();
      for (const [id, w] of subWorld) worlds.set(id, spot.world.clone().multiply(w));
      vp.ghost.show(sub, worlds, placementSymmetryGhosts(sub, worlds));
    }
    vp.request();
  };

  const aim = (ndc: Vector2) => {
    cursor = ndc;
    const cat = catalogSig.value;
    spot = cat && root ? findSpot(cat, root, ndc) : null;
    statusHintSig.value = shiftSocketSig.peek()
      ? 'Shift: compatible sockets only · release Shift for surfaces or ground'
      : spot?.kind === 'root'
        ? PLACE_HINT
        : null;
    showGhost();
  };

  const place = () => {
    const cat = catalogSig.value;
    const what = sub;
    const where = spot;
    const source = placeSig.value;
    if (!cat || !what || !where) return;
    const at =
      where.kind === 'root' ? { root: matrix4ToCf(where.world) } : { target: where.target };
    const n = what.order.length;
    const label = n === 1 ? what.parts.get(what.order[0])!.type : `${n} parts`;
    let ids: PartId[] = [];
    try {
      commit(`Place ${label}`, (d) => {
        ids = [...insertSubDoc(d, cat, cat.conventions, posesSig.value, what, at).values()];
        ids.push(...addPlacementSymmetry(d, ids));
      });
    } catch (e) {
      toast((e as Error).message, 'warn');
      return;
    }
    select(ids, 'replace');
    if (source?.kind === 'part') pushRecent(source.type);
    if (cursor) aim(cursor);
  };

  return {
    id: 'place',
    activate() {
      stopSource = effect(() => {
        const src = placeSig.value;
        const cat = catalogSig.value;
        sub = null;
        subWorld = null;
        root = null;
        showGhost();
        if (!src || !cat) return;
        let live = true;
        resolveSub(src).then(
          (d) => {
            if (!live) return;
            sub = d;
            subWorld = computePoses(d, cat, cat.conventions).world;
            const first = d.order.find((id) => poseConn(d.parts.get(id)!) === undefined);
            root = first === undefined ? null : d.parts.get(first)!;
            if (cursor) aim(cursor);
          },
          (e: unknown) => {
            toast((e as Error).message, 'error');
            disarm();
          },
        );
        return () => {
          live = false;
        };
      });
    },
    deactivate() {
      socketFocusSig.value = null;
      stopSource?.();
      stopSource = null;
      sub = null;
      spot = null;
      statusHintSig.value = null;
      getViewport()?.ghost?.show(null, new Map());
      getViewport()?.request();
      placeSig.value = null;
    },
    onPointer(e: ToolPointer) {
      shiftSocketSig.value = e.shift;
      if (e.button === 2 && e.kind === 'up') {
        setTool('select');
        return;
      }
      if (e.kind === 'move') return aim(e.ndc);
      if (e.button === 0 && e.kind === 'up') {
        aim(e.ndc);
        place();
      }
    },
    onKey(e: KeyboardEvent) {
      if (e.key === 'Shift') {
        shiftSocketSig.value = e.type !== 'keyup';
        if (cursor) aim(cursor);
        return false;
      }
      if (e.key !== 'Escape') return false;
      disarm();
      return true;
    },
  };
}
