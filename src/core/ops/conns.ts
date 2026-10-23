// Joint edits (spec §7.1, §9.2): add, remove, detach and re-pose the conns of a part.
import type { Catalog } from '../catalog-types';
import { matrix4ToCf } from '../cframe';
import { wouldCreatePoseCycle } from '../graph';
import type { Poses } from '../pose';
import { canBeChild, canBeParent, canTakeChild } from '../rules';
import type { Conn, Doc, Part, PartId, Verdict } from '../types';
import type { Draft } from './transact';

const OK: Verdict = { ok: true };
const POSE_CYCLE: Verdict = {
  ok: false,
  code: 'pose-cycle',
  message: 'That joint would make this part hold itself up through its own children.',
};

/** The draft as a Doc, for rule and graph queries. Layout is not read by them. */
export function draftDoc(d: Draft): Doc {
  const order = d.order();
  const parts = new Map(order.map((id): [PartId, Part] => [id, d.get(id)!]));
  return { parts, order, layout: new Map(), nextId: 0 };
}

/**
 * Gives a part that lost its pose conn a new one. `conns` are its conns in order, without the lost
 * one. The first socket or point conn that closes no pose loop moves to index 0; if none does, the
 * order stays. With no socket or point conn left the part becomes a root at its current world pose.
 */
export function settle(
  d: Draft,
  id: PartId,
  conns: readonly Conn[],
  poses: Poses,
): 'posed' | 'loose' {
  // While the candidates are judged, the part is a root: its old pose must not count.
  d.set({ ...d.get(id)!, conns: conns.filter((c) => c.target.kind === 'raw') });
  let next = conns;
  // A snapshot is only needed when there is a candidate: a part with no joint left is a root at once.
  if (conns.some((c) => c.target.kind !== 'raw')) {
    const doc = draftDoc(d);
    const k = conns.findIndex(
      (c) => c.target.kind !== 'raw' && !wouldCreatePoseCycle(doc, id, c.target.part),
    );
    if (k >= 0) next = [conns[k], ...conns.filter((_, i) => i !== k)];
  }
  d.set({ ...d.get(id)!, conns: next });
  if (next.some((c) => c.target.kind !== 'raw')) return 'posed';
  d.setLayout(id, matrix4ToCf(poses.world.get(id)!));
  return 'loose';
}

/**
 * Adds a joint (socket target) or a mount (point target) on `conn.self`. `asPose` puts it first, where
 * it poses the part. Otherwise it is appended, but a part with no socket or point conn is posed by it
 * anyway. A part that was a root loses its layout.
 */
export function addConn(
  d: Draft,
  cat: Catalog,
  id: PartId,
  conn: Conn,
  opts: { asPose: boolean },
): Verdict {
  const { target } = conn;
  if (target.kind === 'raw') throw new Error('addConn: raw conns are kept as imported');
  if (target.part === id) {
    return { ok: false, code: 'self-target', message: 'A part cannot join itself.' };
  }
  const doc = draftDoc(d);
  if (target.kind === 'socket' && !doc.parts.has(target.part)) {
    return {
      ok: false,
      code: 'part-missing',
      message: `Part ${target.part} is not in this build.`,
    };
  }
  const kind = target.kind === 'point' ? 'mount' : 'joint';
  const child = canBeChild(doc, cat, id, conn.self, kind);
  if (!child.ok) return child;
  const host =
    target.kind === 'point'
      ? canTakeChild(doc, target.part, target.uuid)
      : canBeParent(doc, cat, target.part, target.socket);
  if (!host.ok) return host;

  const part = d.get(id)!;
  const wasRoot = !part.conns.some((c) => c.target.kind !== 'raw');
  if ((opts.asPose || wasRoot) && wouldCreatePoseCycle(doc, id, target.part)) return POSE_CYCLE;
  d.set({ ...part, conns: opts.asPose ? [conn, ...part.conns] : [...part.conns, conn] });
  if (wasRoot) d.setLayout(id, null);
  return OK;
}

/**
 * Drops `conns[index]`. The pose conn is refused: `detach` removes it, because removing it re-poses
 * the part.
 */
export function removeConn(d: Draft, id: PartId, index: number): void {
  const part = d.get(id)!;
  const conn = part.conns[index];
  if (conn === undefined) throw new Error(`removeConn: part ${id} has no conn ${index}`);
  if (
    conn.target.kind !== 'raw' &&
    part.conns.findIndex((c) => c.target.kind !== 'raw') === index
  ) {
    throw new Error('removeConn: the pose conn goes through detach');
  }
  d.set({ ...part, conns: part.conns.filter((_, i) => i !== index) });
}

/** Removes the pose conn and re-poses the part as `settle` does. The part stays where it was unless a secondary joint takes over. */
export function detach(d: Draft, id: PartId, poses: Poses): void {
  const part = d.get(id)!;
  const at = part.conns.findIndex((c) => c.target.kind !== 'raw');
  if (at < 0) return;
  settle(
    d,
    id,
    part.conns.filter((_, i) => i !== at),
    poses,
  );
}

/** Moves `conns[index]` to index 0 so that it poses the part, unless that closes a pose loop. */
export function makePoseJoint(d: Draft, id: PartId, index: number): Verdict {
  const part = d.get(id)!;
  const conn = part.conns[index];
  if (conn === undefined || conn.target.kind === 'raw') {
    throw new Error(`makePoseJoint: conn ${index} of part ${id} is not a joint or mount`);
  }
  if (index === 0) return OK;
  if (wouldCreatePoseCycle(draftDoc(d), id, conn.target.part)) return POSE_CYCLE;
  d.set({ ...part, conns: [conn, ...part.conns.filter((_, i) => i !== index)] });
  return OK;
}
