// World poses of every part (spec §10): roots from the layout, children through their pose conn. A
// multi-piece part (D-F3) gets one pose per body: each body hangs from its own first connection, and a
// body without one keeps its place next to the part's lead body.
import { Matrix4, Vector3 } from 'three';
import { approxSocketFrame, PLACEHOLDER_BOX } from './approx';
import type { Catalog, Conventions, PartDef } from './catalog-types';
import { cfToMatrix4, IDENTITY_CF } from './cframe';
import { matingMatrix, orientationMatrix } from './conventions';
import { topoPose } from './graph';
import type { CFrame12, Conn, ConnTarget, Doc, Part, PartId, PointKey, SocketId } from './types';
import { isServo, servoSettings } from './servo-simulation';

export const POSE_APPROX = 1,
  POSE_CYCLE = 2,
  POSE_UNKNOWN_TYPE = 4;

export interface Poses {
  /** Each part's world matrix: its lead body's, for multi-piece parts. */
  readonly world: ReadonlyMap<PartId, Matrix4>;
  /** Multi-piece parts only: every body's world matrix, in `PartDef.bodies` order. */
  readonly bodies?: ReadonlyMap<PartId, readonly Matrix4[]>;
  readonly flags: ReadonlyMap<PartId, number>;
  readonly approxCount: number;
}

export const EMPTY_POSES: Poses = {
  world: new Map(),
  bodies: new Map(),
  flags: new Map(),
  approxCount: 0,
};

const bodyIndexCache = new WeakMap<PartDef, ReadonlyMap<SocketId, number>>();

/** The body a socket belongs to: 0 for one-piece parts and for sockets outside every body. */
export function bodyOfSocket(def: PartDef | undefined, socket: SocketId): number {
  const list = def?.bodies;
  if (!def || !list) return 0;
  let index = bodyIndexCache.get(def);
  if (!index) {
    const m = new Map<SocketId, number>();
    list.forEach((b, i) => {
      for (const s of b.sockets) m.set(s, i);
    });
    bodyIndexCache.set(def, (index = m));
  }
  return index.get(socket) ?? 0;
}

/** The body that places a multi-piece part: its first connection's, else the first body. */
export function leadBody(def: PartDef | undefined, part: Part): number {
  const first = poseConn(part);
  return def?.bodies && first ? bodyOfSocket(def, first.self) : 0;
}

/**
 * What `Orientation` turns the body owning `socket` about (part space), for the mating formulas;
 * undefined (the origin) for one-piece parts.
 */
export function bodyPivot(cat: Catalog, type: string, socket: SocketId): Vector3 | undefined {
  const def = Object.hasOwn(cat.parts, type) ? cat.parts[type] : undefined;
  return def?.bodies ? pivots(def)[bodyOfSocket(def, socket)] : undefined;
}

/** A body's world matrix; a one-piece part's own. Shared: never mutate it. */
export function bodyWorld(poses: Poses, id: PartId, body: number): Matrix4 | undefined {
  return poses.bodies?.get(id)?.[body] ?? poses.world.get(id);
}

/**
 * A socket's world frame, where its children mate (a wheel socket's hangs SPRING_DROP below it): its
 * body's world times the socket frame; null without a pose.
 */
export function socketWorld(
  poses: Poses,
  cat: Catalog,
  doc: Doc,
  id: PartId,
  socket: SocketId,
): Matrix4 | null {
  const part = doc.parts.get(id);
  if (!part) return null;
  const def = Object.hasOwn(cat.parts, part.type) ? cat.parts[part.type] : undefined;
  const w = bodyWorld(poses, id, bodyOfSocket(def, socket));
  if (!w) return null;
  const m = w.clone().multiply(socketMatrix(cat, part.type, socket, part.props).m);
  return m;
}

/** Socket 2 is the rotating output: its captured local +Y is the servo axis. */
function servoTurn(props: Part['props']): Matrix4 {
  return new Matrix4().makeRotationY(((servoSettings(props).Rotation % 360) * Math.PI) / 180);
}

interface Frame {
  /** Shared and cached: never mutate. */
  readonly m: Matrix4;
  readonly approx: boolean;
}
interface SocketFrame extends Frame {
  readonly unknown: boolean;
}

const socketCache = new WeakMap<Catalog, Map<string, SocketFrame>>();

/**
 * How far a part on a wheel socket (the game's MountType Suspension) hangs below it, along the base's
 * −Y: the game seats it on a spring that settles under the car's weight. Not simulated; estimated from
 * the user's screenshots of a Chassis car (2026-10-24).
 */
export const SPRING_DROP = 0.9;

/**
 * A socket's frame in part space; as a parent, a wheel socket's hangs SPRING_DROP below the socket.
 * Unknown types and sockets get an approx frame on the placeholder or mesh bbox: on the −Y face when
 * used as a child socket, cycling the faces otherwise.
 */
function socketFrame(
  cat: Catalog,
  type: string,
  socket: SocketId,
  as: 'child' | 'parent',
): SocketFrame {
  let cache = socketCache.get(cat);
  if (!cache) socketCache.set(cat, (cache = new Map()));
  const key = `${type}\u0000${socket}\u0000${as}`;
  let f = cache.get(key);
  if (!f) {
    const def = cat.parts[type];
    const s = def?.sockets[socket];
    if (s) {
      const m = cfToMatrix4(as === 'child' ? (s.childFrame ?? s.frame) : s.frame);
      if (as === 'parent' && s.mountType === 'Suspension') {
        m.premultiply(new Matrix4().makeTranslation(0, -SPRING_DROP, 0));
      }
      f = { m, approx: s.frameSource === 'approx', unknown: false };
    } else {
      const box = def?.mesh ?? PLACEHOLDER_BOX;
      const cf = approxSocketFrame({
        ...box,
        socket,
        side: as,
        name: null,
        parentSockets: [socket],
      });
      f = { m: cfToMatrix4(cf), approx: true, unknown: true };
    }
    cache.set(key, f);
  }
  return f;
}

/**
 * The socket's frame in part space, where its children mate (a wheel socket's hangs SPRING_DROP below
 * it); unknown types and sockets get an approx frame.
 */
export function socketMatrix(
  cat: Catalog,
  type: string,
  socket: SocketId,
  props?: Part['props'],
): { m: Matrix4; approx: boolean } {
  const { m, approx } = socketFrame(cat, type, socket, 'parent');
  const frame = m.clone();
  if (props && isServo(type) && socket === '2') frame.multiply(servoTurn(props));
  return { m: frame, approx };
}

/** What a child socket mounts onto: another part's socket, or a point. */
export type MountOnto = { readonly type: string; readonly socket: SocketId } | 'point';

/** Ry(+90°), exact: how the game turns a hinged child on a physical door socket (D23). */
const HINGE_TURN = new Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1);

// Native point mounts use this extra child-frame turn, preserving captured translation.
// Measured on 90 mounts across 10 types, including hinged and shared-ID sockets (2026-10-26).
const POINT_MOUNT_TURN = new Matrix4().set(0, 0, -1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
type MountTurn = 'door' | 'point';

/** Extra child-frame turn for any point mount, or a hinged child on a physical door socket. */
function mountTurn(
  cat: Catalog,
  type: string,
  socket: SocketId,
  onto: MountOnto,
): MountTurn | null {
  if (onto === 'point') return 'point';
  if (!Object.hasOwn(cat.parts, type) || cat.parts[type].sockets[socket]?.hinge !== true) {
    return null;
  }
  return mountTypeOf(cat, onto.type, onto.socket) === 'Door' ? 'door' : null;
}

/** A parent socket's mount type in game (`SocketDef.mountType`), if it has one. */
function mountTypeOf(cat: Catalog, type: string, socket: SocketId): string | undefined {
  return Object.hasOwn(cat.parts, type) ? cat.parts[type].sockets[socket]?.mountType : undefined;
}

/** Mount types that spin their child themselves, so the game keeps it at its default turn. */
const SPINNING_MOUNTS: ReadonlySet<string> = new Set(['Bearing', 'Servo']);

/**
 * Whether the mount controls the child's turn instead of Orientation: spinning outputs, or a
 * hinged child on a physical door socket. Ordinary socket and point mounts still take Orientation.
 */
export function ignoresOrientation(
  cat: Catalog,
  type: string,
  socket: SocketId,
  child?: { readonly type: string; readonly socket: SocketId },
): boolean {
  const mount = mountTypeOf(cat, type, socket);
  return (
    (mount !== undefined && SPINNING_MOUNTS.has(mount)) ||
    (mount === 'Door' &&
      child !== undefined &&
      Object.hasOwn(cat.parts, child.type) &&
      cat.parts[child.type]?.sockets[child.socket]?.hinge === true)
  );
}

/**
 * Turns only the child frame's axes, keeping its captured position. Physical door joints use
 * Ry(90); points use the independently measured Rx(90) Ry(-90) correction for all child types.
 */
function turnChildFrame(m: Matrix4, on: MountTurn): Matrix4 {
  return m.multiply(on === 'door' ? HINGE_TURN : POINT_MOUNT_TURN);
}

/**
 * The effective child frame for a physical socket or point. Shared by forward posing, placement
 * previews and inverse point construction; point mounts must not use the uncorrected socket frame.
 */
export function childSocketMatrix(
  cat: Catalog,
  type: string,
  socket: SocketId,
  onto: MountOnto,
): { m: Matrix4; approx: boolean } {
  const frame = socketFrame(cat, type, socket, 'child');
  const s = { m: frame.m.clone(), approx: frame.approx };
  const turn = mountTurn(cat, type, socket, onto);
  if (turn) turnChildFrame(s.m, turn);
  return s;
}

/**
 * The frame of a host's sub-piece. A captured frame wins; otherwise the identity (spec §10.3, until
 * probe P6 settles it), approximate for any partName other than the host's main piece.
 */
export function subPartMatrix(
  cat: Catalog,
  type: string,
  partName: string,
  props?: Part['props'],
): { m: Matrix4; approx: boolean } {
  const def = cat.parts[type];
  const sub = def?.subParts[partName];
  const m = sub && !sub.approx ? cfToMatrix4(sub.cframe) : new Matrix4();
  if (props && isServo(type) && partName === 'Spinner') {
    const output = socketFrame(cat, type, '2', 'parent').m;
    m.premultiply(output.clone().multiply(servoTurn(props)).multiply(output.clone().invert()));
  }
  return { m, approx: sub && !sub.approx ? false : def?.mainPartName !== partName };
}

export type PoseConn = Conn & { readonly target: Exclude<ConnTarget, { kind: 'raw' }> };

/** The conn that poses a part: its first `socket` or `point` conn (raw conns are skipped). */
export function poseConn(part: Part): PoseConn | undefined {
  return part.conns.find((c): c is PoseConn => c.target.kind !== 'raw');
}

/**
 * Where the given parts hang: the parent sockets (`part:socket`) and points (`host:uuid`) their pose
 * conns target, one per body for multi-piece parts. The viewport draws these purple for the selection.
 */
export function poseTargets(
  doc: Doc,
  cat: Catalog,
  ids: Iterable<PartId>,
): { sockets: Set<string>; points: Set<PointKey> } {
  const sockets = new Set<string>();
  const points = new Set<PointKey>();
  for (const id of ids) {
    const part = doc.parts.get(id);
    if (!part) continue;
    const def = Object.hasOwn(cat.parts, part.type) ? cat.parts[part.type] : undefined;
    const posed = new Set<number>();
    for (const c of part.conns) {
      const t = c.target;
      const body = bodyOfSocket(def, c.self);
      if (t.kind === 'raw' || posed.has(body)) continue;
      posed.add(body);
      if (t.kind === 'socket') sockets.add(`${t.part}:${t.socket}`);
      else points.add(`${t.part}:${t.uuid}`);
      if (!def?.bodies) break;
    }
  }
  return { sockets, points };
}

/**
 * Roots and pseudo-roots in export order: the first at the origin, each next 2 studs past the previous
 * bbox along +X. `pseudo` names the pseudo-roots (default: the part-level pose order's).
 */
export function defaultRootLayout(
  doc: Doc,
  cat: Catalog,
  pseudo: ReadonlySet<PartId> = new Set(topoPose(doc).pseudoRoots),
): Map<PartId, CFrame12> {
  const out = new Map<PartId, CFrame12>();
  let edge: number | null = null;
  for (const id of doc.order) {
    const part = doc.parts.get(id)!;
    if (poseConn(part) && !pseudo.has(id)) continue;
    const box = cat.parts[part.type]?.mesh ?? PLACEHOLDER_BOX;
    const x: number = edge === null ? 0 : edge + 2 - box.min[0];
    out.set(id, [x + 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    edge = x + box.max[0];
  }
  return out;
}

/** Bodies per part at most: a pose node is `id * MAX_BODIES + body`. */
const MAX_BODIES = 8;

interface PartInfo {
  readonly part: Part;
  readonly def: PartDef | undefined;
  /** Bodies (1 for one-piece parts). */
  readonly n: number;
  readonly lead: number;
  /** Per body, the index of its first socket or point conn, or -1. */
  readonly conn: Int32Array;
}

/** A body's pivot in part space, what `Orientation` turns it about; undefined for one-piece parts. */
export function piecePivot(cat: Catalog, type: string, body: number): Vector3 | undefined {
  const def = Object.hasOwn(cat.parts, type) ? cat.parts[type] : undefined;
  return def?.bodies ? pivots(def)[body] : undefined;
}

const pivotCache = new WeakMap<PartDef, readonly Vector3[]>();
/** Where `Orientation` turns each body: its own centre; one-piece parts turn about their origin. */
function pivots(def: PartDef): readonly Vector3[] {
  let p = pivotCache.get(def);
  if (!p) pivotCache.set(def, (p = (def.bodies ?? []).map((b) => new Vector3(...b.pivot))));
  return p;
}

/**
 * Every part's world matrix (float64) and flags. Recomputed per committed doc version (spec §10.7).
 * Bodies are posed breadth first from the roots. A body no root reaches sits on a loop: it is anchored
 * through another of its conns whose target is posed (spec §10.6), and only a loop with no such conn
 * gets a pseudo-root, flagged W-CYCLE.
 */
export function computePoses(doc: Doc, cat: Catalog, conv: Conventions): Poses {
  const info = new Map<PartId, PartInfo>();
  for (const id of doc.order) {
    const part = doc.parts.get(id)!;
    const def = Object.hasOwn(cat.parts, part.type) ? cat.parts[part.type] : undefined;
    const n = Math.min(Math.max(def?.bodies?.length ?? 1, 1), MAX_BODIES);
    const conn = new Int32Array(n).fill(-1);
    part.conns.forEach((c, k) => {
      if (c.target.kind === 'raw') return;
      const b = n === 1 ? 0 : bodyOfSocket(def, c.self);
      if (conn[b] < 0) conn[b] = k;
    });
    info.set(id, { part, def, n, lead: n === 1 ? 0 : leadBody(def, part), conn });
  }
  const node = (id: PartId, b: number) => id * MAX_BODIES + b;
  const idOf = (key: number) => Math.floor(key / MAX_BODIES);
  /** The node a conn hangs from: the body owning the target socket, or a point host's lead body. */
  const targetNode = (c: Conn): number | null => {
    const t = c.target;
    if (t.kind === 'raw') return null;
    const host = info.get(t.part);
    if (!host) return null;
    return node(
      t.part,
      t.kind === 'socket' ? (host.n === 1 ? 0 : bodyOfSocket(host.def, t.socket)) : host.lead,
    );
  };
  /** A node's own parent: through its body's first conn, else its lead body (null for roots). */
  const parentOf = (key: number): number | null => {
    const inf = info.get(idOf(key))!;
    const b = key % MAX_BODIES;
    if (inf.conn[b] >= 0) return targetNode(inf.part.conns[inf.conn[b]]);
    return b === inf.lead ? null : node(idOf(key), inf.lead);
  };

  const children = new Map<number, number[]>();
  const seeds: number[] = [];
  for (const id of doc.order) {
    for (let b = 0; b < info.get(id)!.n; b++) {
      const key = node(id, b);
      const up = parentOf(key);
      if (up === null) seeds.push(key);
      else push(children, up, key);
    }
  }
  const order: number[] = [];
  const reached = new Set<number>();
  const sweep = (from: readonly number[]): void => {
    const start = order.length;
    for (const key of from) {
      if (!reached.has(key)) {
        reached.add(key);
        order.push(key);
      }
    }
    for (let at = start; at < order.length; at++) {
      for (const child of children.get(order[at]) ?? []) {
        if (!reached.has(child)) {
          reached.add(child);
          order.push(child);
        }
      }
    }
  };
  /** Conns an island node is posed through instead of its own first one. */
  const anchors = new Map<number, number>();
  const anchorPass = (): boolean => {
    let progress = false;
    for (const id of doc.order) {
      const inf = info.get(id)!;
      for (let b = 0; b < inf.n; b++) {
        const key = node(id, b);
        if (reached.has(key)) continue;
        const k = inf.part.conns.findIndex((c) => {
          if (c.target.kind === 'raw' || (inf.n > 1 && bodyOfSocket(inf.def, c.self) !== b)) {
            return false;
          }
          const up = targetNode(c);
          return up !== null && reached.has(up);
        });
        if (k < 0) continue;
        anchors.set(key, k);
        sweep([key]);
        progress = true;
      }
    }
    return progress;
  };
  sweep(seeds);
  const pseudo = new Set<number>();
  for (;;) {
    while (anchorPass());
    let next: number | null = null;
    for (const id of doc.order) {
      for (let b = 0; b < info.get(id)!.n && next === null; b++) {
        if (!reached.has(node(id, b))) next = node(id, b);
      }
      if (next !== null) break;
    }
    if (next === null) break;
    // Walk own parents up from it: the first node seen twice lies on the loop.
    const seen = new Set<number>();
    let at = next;
    while (!seen.has(at)) {
      seen.add(at);
      const up = parentOf(at);
      if (up === null || !info.has(idOf(up))) break;
      at = up;
    }
    pseudo.add(at);
    sweep([at]);
  }

  const mating = matingMatrix(conv);
  // M · S(c, a)⁻¹ per child socket (and hinge turn), shared by every body mated through it.
  const tail = new Map<string, Matrix4>();
  const nodeWorld = new Map<number, Matrix4>();
  const nodeFlag = new Map<number, number>();
  let defaults: Map<PartId, CFrame12> | null = null;
  const rootWorld = (id: PartId): Matrix4 =>
    cfToMatrix4(
      doc.layout.get(id) ??
        (defaults ??= defaultRootLayout(doc, cat, new Set([...pseudo].map(idOf)))).get(id) ??
        IDENTITY_CF,
    );

  for (const key of order) {
    const id = idOf(key);
    const b = key % MAX_BODIES;
    const { part, def, lead } = info.get(id)!;
    let flag = def ? 0 : POSE_UNKNOWN_TYPE;
    const k = pseudo.has(key) ? -1 : (anchors.get(key) ?? info.get(id)!.conn[b]);
    const conn = k >= 0 ? (part.conns[k] as PoseConn) : undefined;
    const up = conn ? targetNode(conn) : null;
    const parentWorld = up === null ? undefined : nodeWorld.get(up);
    let m: Matrix4;
    if (!conn && b !== lead && !pseudo.has(key)) {
      // A body with no connection of its own keeps its place next to the lead body.
      m = nodeWorld.get(node(id, lead))!.clone();
      flag |= nodeFlag.get(node(id, lead))!;
    } else if (!conn || !parentWorld) {
      // Roots, pseudo-roots, and (in a broken doc) a parent that is missing or posed later. A loose
      // pseudo-root body of a posed part keeps its place next to the lead body.
      const leadWorld = b !== lead ? nodeWorld.get(node(id, lead)) : undefined;
      m = leadWorld ? leadWorld.clone() : rootWorld(id);
      if (pseudo.has(key)) flag |= POSE_CYCLE;
    } else {
      const t = conn.target;
      const parent = doc.parts.get(t.part)!;
      flag |= nodeFlag.get(up!)! & (POSE_APPROX | POSE_CYCLE);
      const child = socketFrame(cat, part.type, conn.self, 'child');
      if (child.approx) flag |= POSE_APPROX;
      if (child.unknown) flag |= POSE_UNKNOWN_TYPE;
      const onto = t.kind === 'socket' ? { type: parent.type, socket: t.socket } : 'point';
      const turn = mountTurn(cat, part.type, conn.self, onto);
      const tailKey = `${part.type}\u0000${conn.self}\u0000${turn ?? ''}`;
      let after = tail.get(tailKey);
      if (!after) {
        const s = childSocketMatrix(cat, part.type, conn.self, onto).m;
        tail.set(tailKey, (after = mating.clone().multiply(s.invert())));
      }
      m = parentWorld.clone();
      if (t.kind === 'socket') {
        const ps = socketFrame(cat, parent.type, t.socket, 'parent');
        if (ps.approx) flag |= POSE_APPROX;
        m.multiply(ps.m);
        if (isServo(parent.type) && t.socket === '2') m.multiply(servoTurn(parent.props));
      } else {
        const point = parent.points?.get(t.uuid);
        // An undeclared uuid (E-UUID) seats the child at the host origin, flagged approximate.
        if (point) {
          const sub = subPartMatrix(cat, parent.type, point.partName, parent.props);
          if (sub.approx) flag |= POSE_APPROX;
          m.multiply(sub.m).multiply(cfToMatrix4(point.cframe));
        } else {
          flag |= POSE_APPROX;
        }
      }
      // `mateWorld` (conventions.ts) inline: R turns the body about its pivot, or (v1 guess) the socket.
      const turns =
        t.kind === 'socket'
          ? !ignoresOrientation(cat, parent.type, t.socket, { type: part.type, socket: conn.self })
          : conv.orientationOnPoints;
      const r = turns ? orientationMatrix(part.props, conv) : null;
      if (r && conv.orientationPivot === 'socket') m.multiply(r).multiply(after);
      else if (r) {
        m.multiply(after);
        const c = def?.bodies ? pivots(def)[b] : undefined;
        if (c) m.multiply(new Matrix4().makeTranslation(c.x, c.y, c.z));
        m.multiply(r);
        if (c) m.multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z));
      } else m.multiply(after);
    }
    nodeWorld.set(key, m);
    nodeFlag.set(key, flag);
  }

  const world = new Map<PartId, Matrix4>();
  const bodies = new Map<PartId, Matrix4[]>();
  const flags = new Map<PartId, number>();
  let approxCount = 0;
  for (const id of doc.order) {
    const { n, lead } = info.get(id)!;
    world.set(id, nodeWorld.get(node(id, lead))!);
    let flag = 0;
    for (let b = 0; b < n; b++) flag |= nodeFlag.get(node(id, b))!;
    if (n > 1)
      bodies.set(
        id,
        Array.from({ length: n }, (_, b) => nodeWorld.get(node(id, b))!),
      );
    flags.set(id, flag);
    if (flag & POSE_APPROX) approxCount++;
  }
  return { world, bodies, flags, approxCount };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
