// Existing counterparts only. Plans are local gesture snapshots, never document metadata.
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Catalog } from '../catalog-types';
import { matrix4ToCf } from '../cframe';
import { pointFrameFor } from '../conventions';
import { graphIndex, poseDescendants, topoPose } from '../graph';
import {
  bodyWorld,
  childSocketMatrix,
  computePoses,
  leadBody,
  piecePivot,
  poseConn,
  subPartMatrix,
  type Poses,
} from '../pose';
import { canBeChild, isSignalJoint } from '../rules';
import { copyFrame, mirroredType, sameFrame } from '../symmetry';
import type { Doc, PartId } from '../types';
import { draftDoc } from './conns';
import {
  chooseMountSocket,
  makeFreeMovable,
  retargetBody,
  retargetPose,
  rotateInPlace,
  setWorldPose,
  transformPiece,
  turnsInPlace,
} from './move';
import { addPoint } from './points';
import { attachToMatchingSocket } from './symmetry-sockets';
import type { Draft } from './transact';

export interface SymmetryEditPair {
  readonly source: PartId;
  readonly target: PartId;
  readonly transform: Matrix4;
}
export interface SymmetryEditPlan {
  readonly doc: Doc;
  readonly poses: Poses;
  readonly sources: readonly PartId[];
  readonly anchor: PartId;
  readonly pairs: readonly SymmetryEditPair[];
  readonly ambiguous: number;
}
export interface SymmetryEditOptions {
  readonly reattach?: boolean;
  /** Only an explicitly dragged body is allowed to replace its old signal connection. */
  readonly bodySources?: ReadonlySet<PartId>;
}
const frames = (poses: Poses, id: PartId): readonly Matrix4[] =>
  poses.bodies?.get(id) ?? [poses.world.get(id)!];
const bucket = (type: string, m: Matrix4, dx = 0, dy = 0, dz = 0) =>
  `${type}:${Math.floor(m.elements[12] * 1000) + dx}:${Math.floor(m.elements[13] * 1000) + dy}:${Math.floor(m.elements[14] * 1000) + dz}`;

export function planSymmetryEdits(
  doc: Doc,
  cat: Catalog,
  poses: Poses,
  sources: readonly PartId[],
  anchor: PartId,
  transforms: readonly Matrix4[],
): SymmetryEditPlan {
  const plan = { doc, poses, sources, anchor, pairs: [] as SymmetryEditPair[], ambiguous: 0 };
  if (sources.includes(anchor) || !doc.parts.has(anchor) || !transforms.length) return plan;
  const excluded = new Set(sources);
  for (const id of sources) for (const child of poseDescendants(doc, id)) excluded.add(child);
  excluded.add(anchor);
  const index = new Map<string, PartId[]>(),
    used = new Set<PartId>();
  for (const id of doc.order) {
    if (excluded.has(id) || !poses.world.has(id)) continue;
    const key = bucket(doc.parts.get(id)!.type, frames(poses, id)[0]);
    const values = index.get(key) ?? [];
    values.push(id);
    index.set(key, values);
  }
  for (const source of sources) {
    const p = doc.parts.get(source);
    if (!p || source === anchor || !poses.world.has(source)) continue;
    const before = frames(poses, source),
      def = cat.parts[p.type];
    for (const transform of transforms) {
      const type = transform.determinant() < 0 ? mirroredType(p.type) : p.type;
      const wanted = before.map((w, b) =>
        copyFrame(
          transform,
          w,
          p.type,
          def?.bodies ? new Vector3(...def.bodies[b].pivot) : undefined,
        ),
      );
      if (type === p.type && wanted.every((w, b) => sameFrame(w, before[b]))) continue;
      const matches: PartId[] = [];
      for (let x = -1; x <= 1; x++)
        for (let y = -1; y <= 1; y++)
          for (let z = -1; z <= 1; z++)
            for (const id of index.get(bucket(type, wanted[0], x, y, z)) ?? []) {
              const candidate = frames(poses, id);
              if (
                candidate.length === wanted.length &&
                candidate.every((w, b) => sameFrame(w, wanted[b]))
              )
                matches.push(id);
            }
      if (matches.length > 1) {
        plan.ambiguous++;
        continue;
      }
      const target = matches[0];
      if (target !== undefined && !used.has(target)) {
        used.add(target);
        plan.pairs.push({ source, target, transform });
      }
    }
  }
  return plan;
}
export const symmetryDeleteIds = (plan: SymmetryEditPlan): PartId[] => [
  ...new Set([...plan.sources, ...plan.pairs.map((p) => p.target)]),
];

/** Move an existing body to its mirrored drop, preferring a real aligned socket. */
function reattach(
  d: Draft,
  cat: Catalog,
  poses: Poses,
  id: PartId,
  body: number,
  wanted: Matrix4,
  anchor: PartId,
  bodyDrag: boolean,
): void {
  const part = d.get(id)!,
    def = cat.parts[part.type],
    multi = !!def?.bodies;
  const old = multi
    ? part.conns.find((c) => c.target.kind !== 'raw' && def.bodies![body].sockets.includes(c.self))
    : poseConn(part);
  const keepSignal =
    !bodyDrag &&
    old?.target.kind === 'socket' &&
    isSignalJoint(cat, part.type, old.self, d.get(old.target.part)!.type, old.target.socket);
  if (bodyDrag) d.set({ ...part, conns: part.conns.filter((c) => c !== old) });
  if (
    attachToMatchingSocket(
      d,
      cat,
      id,
      body,
      wanted,
      (other, b) => bodyWorld(poses, other, b),
      bodyDrag ? undefined : old,
    )
  ) {
    if (multi) {
      // Body drags replace their own slot; adding a free end must not silently change the lead body.
      const connected = d.get(id)!,
        next = connected.conns[0];
      d.set({
        ...connected,
        conns: old ? part.conns.map((c) => (c === old ? next : c)) : [...part.conns, next],
      });
    }
    if (
      old?.target.kind === 'point' &&
      !graphIndex(draftDoc(d)).pointUsers.has(`${old.target.part}:${old.target.uuid}`)
    ) {
      const host = d.get(old.target.part)!;
      const points = new Map(host.points);
      points.delete(old.target.uuid);
      d.set({ ...host, points });
    }
    return;
  }
  d.set(part);
  if (keepSignal && multi)
    throw new Error(
      `${part.type} has a signal connection on its mirrored piece; drag that piece explicitly to rewire it.`,
    );
  const check = draftDoc(d),
    parts = new Map(check.parts);
  parts.set(id, { ...part, conns: keepSignal ? part.conns : part.conns.filter((c) => c !== old) });
  const available = { ...check, parts };
  const self = multi
    ? def.bodies![body].sockets.find(
        (s) => def.childSockets.includes(s) && canBeChild(available, cat, id, s, 'mount').ok,
      )
    : chooseMountSocket(available, cat, id);
  if (!self) throw new Error(`${part.type} has no free mount for its mirrored move.`);
  const host = d.get(anchor)!,
    partName = cat.parts[host.type].mainPartName;
  const sub = subPartMatrix(cat, host.type, partName, host.props).m;
  const cf = pointFrameFor(
    poses.world.get(anchor)!,
    sub,
    wanted,
    childSocketMatrix(cat, part.type, self, 'point').m,
    part.props,
    cat.conventions,
    piecePivot(cat, part.type, body),
  );
  const uuid = addPoint(d, anchor, cf, partName);
  const target = { kind: 'point' as const, part: anchor, uuid };
  const verdict = multi
    ? retargetBody(d, cat, poses, id, body, target)
    : retargetPose(d, cat, cat.conventions, poses, id, target);
  if (!verdict.ok) throw new Error(verdict.message);
}

/** Run after the source edit, inside the same transaction. No allocation or network action for a preview. */
export function mirrorChangedParts(
  d: Draft,
  cat: Catalog,
  plan: SymmetryEditPlan,
  options: SymmetryEditOptions = {},
): void {
  if (!plan.pairs.length) return;
  const afterDoc = draftDoc(d),
    after = computePoses(afterDoc, cat, cat.conventions);
  const wanted = new Map<PartId, readonly Matrix4[]>();
  const bodyTargets = new Set<PartId>();
  for (const pair of plan.pairs) {
    const source = afterDoc.parts.get(pair.source),
      target = d.get(pair.target);
    if (!source || !target) continue;
    if (options.bodySources?.has(pair.source)) bodyTargets.add(pair.target);
    const before = frames(plan.poses, pair.source),
      next = frames(after, pair.source);
    if (next.every((w, b) => sameFrame(w, before[b], 1e-9))) continue;
    // Mirror the actual change, preserving tiny existing socket/export rounding differences.
    wanted.set(
      pair.target,
      next.map((w, b) =>
        pair.transform
          .clone()
          .multiply(w.clone().multiply(before[b].clone().invert()))
          .multiply(pair.transform.clone().invert())
          .multiply(frames(plan.poses, pair.target)[b]),
      ),
    );
  }
  // Inverses must use the final host frames even when a paired host is edited later in this batch.
  const world = new Map(after.world),
    bodies = new Map(after.bodies),
    virtual = { ...after, world, bodies };
  const useFrames = (id: PartId, list: readonly Matrix4[]) => {
    const part = d.get(id)!;
    world.set(id, list[leadBody(cat.parts[part.type], part)] ?? list[0]);
    if (list.length > 1) bodies.set(id, list);
  };
  for (const [id, list] of wanted) useFrames(id, list);
  const rank = new Map(topoPose(afterDoc).order.map((id, i) => [id, i]));
  for (const [id, list] of [...wanted].sort(
    (a, b) => (rank.get(a[0]) ?? 0) - (rank.get(b[0]) ?? 0),
  )) {
    const part = d.get(id)!,
      current = frames(after, id),
      multi = !!cat.parts[part.type]?.bodies;
    const unmounted = multi && !poseConn(part);
    if (unmounted && list.every((w) => sameFrame(w, list[0], 1e-9))) {
      d.setLayout(id, matrix4ToCf(list[0]));
      useFrames(id, list);
      continue;
    }
    // The body itself starts at its old frame; all possible hosts use their final planned frame.
    world.set(id, after.world.get(id)!);
    if (multi) bodies.set(id, current);
    for (let b = 0; b < list.length; b++) {
      const loose =
        multi &&
        !part.conns.some(
          (c) =>
            c.target.kind !== 'raw' && cat.parts[part.type].bodies![b].sockets.includes(c.self),
        );
      const needsPin =
        loose &&
        (unmounted || !sameFrame(list[b], list[leadBody(cat.parts[part.type], part)], 1e-9));
      if (loose && !needsPin) continue;
      if (!needsPin && sameFrame(current[b], list[b], 1e-9)) continue;
      const delta = list[b].clone().multiply(current[b].clone().invert());
      if (options.reattach || needsPin)
        reattach(d, cat, virtual, id, b, list[b], plan.anchor, needsPin || bodyTargets.has(id));
      else if (multi) {
        const result = transformPiece(d, cat, cat.conventions, virtual, id, b, delta);
        if (!result.ok) throw new Error(result.message);
      } else if (
        turnsInPlace(part, cat.conventions) &&
        new Vector3()
          .setFromMatrixPosition(current[b])
          .distanceToSquared(new Vector3().setFromMatrixPosition(list[b])) < 1e-16 &&
        !wanted.has(poseConn(part)?.target.part ?? -1)
      ) {
        rotateInPlace(
          d,
          cat.conventions,
          virtual,
          id,
          new Quaternion().setFromRotationMatrix(delta),
        );
      } else {
        const result = makeFreeMovable(d, cat, cat.conventions, virtual, id);
        if (!result.ok) throw new Error(result.reason);
        setWorldPose(d, cat, cat.conventions, virtual, id, list[b]);
      }
    }
    useFrames(id, list);
  }
  const final = computePoses(draftDoc(d), cat, cat.conventions);
  for (const [id, list] of wanted)
    if (!frames(final, id).every((w, b) => sameFrame(w, list[b])))
      throw new Error(
        `Mirrored ${d.get(id)!.type} could not reach the requested pose; the edit was cancelled.`,
      );
}
