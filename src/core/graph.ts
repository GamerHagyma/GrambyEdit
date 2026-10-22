// Graph queries over a Doc (spec §8). Reverse maps and pose order are memoised per Doc; Docs are immutable.
import type { Doc, Part, PartId } from './types';

export interface ConnRef {
  readonly child: PartId;
  /** Position in the child's `conns`. */
  readonly index: number;
}

export interface GraphIndex {
  /** `${part}:${socket}` → the socket joints that target it. */
  readonly socketUsers: ReadonlyMap<string, readonly ConnRef[]>;
  /** `${host}:${uuid}` → the mounts that target it. */
  readonly pointUsers: ReadonlyMap<string, readonly ConnRef[]>;
  /** part → every socket or point conn that targets it. */
  readonly targetsOf: ReadonlyMap<PartId, readonly ConnRef[]>;
  /** part → the parts whose pose conn targets it, in export order. */
  readonly poseChildren: ReadonlyMap<PartId, readonly PartId[]>;
}

const indexes = new WeakMap<Doc, GraphIndex>();

/** The reverse maps of `doc`, built once per Doc in O(parts + conns). */
export function graphIndex(doc: Doc): GraphIndex {
  let index = indexes.get(doc);
  if (index === undefined) {
    index = buildIndex(doc);
    indexes.set(doc, index);
  }
  return index;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

/** The part a part hangs from: its first socket or point conn. Raw conns never pose; null for a root. */
function posePart(part: Part): PartId | null {
  for (const { target } of part.conns) if (target.kind !== 'raw') return target.part;
  return null;
}

function buildIndex(doc: Doc): GraphIndex {
  const socketUsers = new Map<string, ConnRef[]>();
  const pointUsers = new Map<string, ConnRef[]>();
  const targetsOf = new Map<PartId, ConnRef[]>();
  const poseChildren = new Map<PartId, PartId[]>();
  for (const child of doc.order) {
    const part = doc.parts.get(child)!;
    for (const [index, conn] of part.conns.entries()) {
      const { target } = conn;
      if (target.kind === 'raw') continue;
      const ref: ConnRef = { child, index };
      push(targetsOf, target.part, ref);
      if (target.kind === 'socket') push(socketUsers, `${target.part}:${target.socket}`, ref);
      else push(pointUsers, `${target.part}:${target.uuid}`, ref);
    }
    const up = posePart(part);
    if (up !== null) push(poseChildren, up, child);
  }
  return { socketUsers, pointUsers, targetsOf, poseChildren };
}

/** The part `id` hangs from, or null for a root (or an unknown id). A target that is missing still counts. */
export function poseParent(doc: Doc, id: PartId): PartId | null {
  const part = doc.parts.get(id);
  return part === undefined ? null : posePart(part);
}

/**
 * Every part below `id` in the effective pose tree (loops anchored, see `topoPose`): what moves with
 * `id`. Excludes `id`.
 */
export function poseDescendants(doc: Doc, id: PartId): Set<PartId> {
  const { children } = pose(doc);
  const found = new Set<PartId>();
  const pending = [id];
  while (pending.length > 0) {
    for (const child of children.get(pending.pop()!) ?? []) {
      if (!found.has(child)) {
        found.add(child);
        pending.push(child);
      }
    }
  }
  found.delete(id);
  return found;
}

/**
 * Parts physically attached to `id`, in either direction: socket joints and ephemeral mounts (a mount
 * welds the part to its host in game). Used by "select joint-connected" (Ctrl+L) and bucket paint.
 */
export function jointNeighbours(doc: Doc, id: PartId): Set<PartId> {
  const found = new Set<PartId>();
  for (const { target } of doc.parts.get(id)?.conns ?? []) {
    if (target.kind !== 'raw' && doc.parts.has(target.part)) found.add(target.part);
  }
  for (const ref of graphIndex(doc).targetsOf.get(id) ?? []) found.add(ref.child);
  return found;
}

/** Flood fill over joints from `start`, spreading only into parts that match `pred`. `start` is always included. */
export function component(doc: Doc, start: PartId, pred: (p: Part) => boolean): Set<PartId> {
  const found = new Set<PartId>([start]);
  const pending = [start];
  while (pending.length > 0) {
    for (const next of jointNeighbours(doc, pending.pop()!)) {
      const part = doc.parts.get(next);
      if (part !== undefined && !found.has(next) && pred(part)) {
        found.add(next);
        pending.push(next);
      }
    }
  }
  return found;
}

/** Parts with no socket or point conn: nothing poses them, so the editor layout places them. Export order. */
export function roots(doc: Doc): PartId[] {
  return doc.order.filter((id) => poseParent(doc, id) === null);
}

interface Pose {
  order: PartId[];
  pseudoRoots: PartId[];
  /** Island parts posed through another conn (its index), because their pose conn sits on a loop. */
  anchors: Map<PartId, number>;
  /** Effective pose children: the forest the poses follow. */
  children: Map<PartId, PartId[]>;
}

const poses = new WeakMap<Doc, Pose>();

function pose(doc: Doc): Pose {
  let p = poses.get(doc);
  if (p === undefined) {
    p = computePose(doc);
    poses.set(doc, p);
  }
  return p;
}

/** Pose order (§8): every part after the part it is posed from. Copies, so callers may mutate them. */
export function topoPose(doc: Doc): { order: PartId[]; pseudoRoots: PartId[] } {
  const p = pose(doc);
  return { order: [...p.order], pseudoRoots: [...p.pseudoRoots] };
}

/**
 * The effective pose forest, loops anchored as in `topoPose`: tree roots (real roots, then
 * pseudo-roots) and each part's children, in pose order. The Outliner draws this tree.
 */
export function poseTree(doc: Doc): {
  roots: PartId[];
  children: ReadonlyMap<PartId, readonly PartId[]>;
} {
  const p = pose(doc);
  return { roots: [...roots(doc), ...p.pseudoRoots], children: p.children };
}

/** Island parts posed through another conn (part → conn index), because their pose conn sits on a loop. */
export function poseAnchors(doc: Doc): ReadonlyMap<PartId, number> {
  return pose(doc).anchors;
}

/**
 * Breadth-first from the roots. Parts no root reaches sit on a pose loop (30 of 185 corpus builds);
 * each such island is anchored through the first conn of any member that targets an already posed
 * part (51 of the corpus's 53 islands), and only an island with no such conn gets a pseudo-root.
 */
function computePose(doc: Doc): Pose {
  const { poseChildren } = graphIndex(doc);
  const order: PartId[] = [];
  const reached = new Set<PartId>();
  const children = new Map<PartId, PartId[]>();
  const anchors = new Map<PartId, number>();
  // Appends the seeds not yet reached, then every part below them, breadth first.
  const sweep = (seeds: readonly PartId[]): void => {
    const start = order.length;
    for (const id of seeds) {
      if (!reached.has(id)) {
        reached.add(id);
        order.push(id);
      }
    }
    for (let at = start; at < order.length; at++) {
      for (const child of poseChildren.get(order[at]) ?? []) {
        if (!reached.has(child)) {
          reached.add(child);
          order.push(child);
          push(children, order[at], child);
        }
      }
    }
  };
  /** One pass anchoring every island member that has a conn into the posed parts. */
  const anchorPass = (): boolean => {
    let progress = false;
    for (const id of doc.order) {
      if (reached.has(id)) continue;
      const conns = doc.parts.get(id)!.conns;
      const k = conns.findIndex((c) => c.target.kind !== 'raw' && reached.has(c.target.part));
      if (k < 0) continue;
      const { target } = conns[k];
      if (target.kind === 'raw') continue;
      anchors.set(id, k);
      push(children, target.part, id);
      sweep([id]);
      progress = true;
    }
    return progress;
  };
  sweep(roots(doc));
  const pseudoRoots: PartId[] = [];
  for (;;) {
    while (anchorPass());
    const next = doc.order.find((id) => !reached.has(id));
    if (next === undefined) break;
    const entry = cycleEntry(doc, next);
    pseudoRoots.push(entry);
    sweep([entry]);
  }
  return { order, pseudoRoots, anchors, children };
}

/**
 * Walks pose parents up from an unreached part. The first part seen twice lies on the loop.
 * A walk that ends at a missing part stops at the last existing part, so its tail is posed from there.
 */
function cycleEntry(doc: Doc, start: PartId): PartId {
  const seen = new Set<PartId>();
  let at = start;
  while (!seen.has(at)) {
    seen.add(at);
    const up = poseParent(doc, at);
    if (up === null || !doc.parts.has(up)) return at;
    at = up;
  }
  return at;
}

/** Making `newParent` the pose parent of `child` closes a loop when `newParent` already hangs below `child`. */
export function wouldCreatePoseCycle(doc: Doc, child: PartId, newParent: PartId): boolean {
  return child === newParent || poseDescendants(doc, child).has(newParent);
}
