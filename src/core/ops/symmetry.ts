// Copies are ordinary native parts and mounts; symmetry itself is never serialized or synchronized.
import { Matrix4, Vector3 } from 'three';
import type { Catalog } from '../catalog-types';
import { cfToMatrix4, matrix4ToCf } from '../cframe';
import { childWorldViaSocket, pointFrameFor } from '../conventions';
import { canonical } from '../collaboration/document';
import {
  bodyOfSocket,
  bodyPivot,
  bodyWorld,
  childSocketMatrix,
  computePoses,
  ignoresOrientation,
  leadBody,
  POSE_CYCLE,
  socketMatrix,
  subPartMatrix,
  type Poses,
} from '../pose';
import { canBeChild, canBeParent, isSignalJoint, validate } from '../rules';
import { isServo } from '../servo-simulation';
import { copyFrame, mirroredType, reflectedSocket, sameFrame } from '../symmetry';
import type { Conn, Part, PartId, Point } from '../types';
import { DEFAULT_LIMITS } from '../types';
import { newUuid } from '../uuid';
import { draftDoc } from './conns';
import { addPoint, setPointCFrame } from './points';
import { attachToMatchingSocket } from './symmetry-sockets';
import { graphIndex } from '../graph';
import type { Draft } from './transact';

export function symmetryCopies(
  d: Draft,
  cat: Catalog,
  poses: Poses,
  selection: readonly PartId[],
  anchor: PartId,
  transforms: readonly Matrix4[],
  skipCentered: boolean,
): PartId[] {
  const doc = draftDoc(d),
    host = doc.parts.get(anchor);
  if (!host || !['Part', 'Connector'].includes(host.type))
    throw new Error('Choose a Part or Connector as the mirror anchor.');
  const selected = new Set(selection);
  const source = doc.order.filter((id) => id !== anchor && selected.has(id));
  if (
    source.length * transforms.length > 8000 ||
    doc.parts.size + source.length * transforms.length > 32000
  )
    throw new Error('This symmetry operation is too large (8,000 added parts / 32,000 total).');
  for (const id of source)
    if ((poses.flags.get(id) ?? 0) & POSE_CYCLE)
      throw new Error('Resolve attachment cycles before mirroring.');
  const made: PartId[] = [];
  const existingErrors = new Set(
    validate(doc, cat, DEFAULT_LIMITS, 0, poses)
      .filter((i) => i.severity === 'error')
      .map(canonical),
  );
  const signature = (p: Part, worlds: readonly Matrix4[]) =>
    p.type +
    '|' +
    // Orientation describes how a joint achieves its pose; the body frames already identify it.
    canonical(
      Object.fromEntries(
        Object.entries(p.props).filter(
          ([key]) => !['OrientationX', 'OrientationY', 'OrientationZ'].includes(key),
        ),
      ),
    ) +
    '|' +
    worlds.map((w) => w.elements.map((n) => Math.round(n * 10000)).join(',')).join(';');
  const existing = new Map<string, { id: PartId; worlds: readonly Matrix4[] }>();
  const knownWorlds = new Map<PartId, readonly Matrix4[]>();
  for (const p of doc.parts.values()) {
    const worlds = poses.bodies?.get(p.id) ?? [poses.world.get(p.id)!];
    existing.set(signature(p, worlds), { id: p.id, worlds });
    knownWorlds.set(p.id, worlds);
  }
  for (const transform of transforms) {
    const reflected = transform.determinant() < 0,
      ids = new Map<PartId, PartId>(),
      points = new Map<PartId, Map<string, string>>(),
      desired = new Map<PartId, Matrix4[]>(),
      fresh: PartId[] = [];
    for (const id of source) {
      const old = doc.parts.get(id)!,
        def = cat.parts[old.type],
        before = poses.bodies?.get(id) ?? [poses.world.get(id)!];
      const worlds = before.map((w, b) =>
        copyFrame(
          transform,
          w,
          old.type,
          def?.bodies ? new Vector3(...def.bodies[b].pivot) : undefined,
        ),
      );
      const props =
        reflected && isServo(old.type) && typeof old.props.Rotation === 'number'
          ? { ...old.props, Rotation: -old.props.Rotation }
          : old.props;
      const type = reflected ? mirroredType(old.type) : old.type;
      const centered =
        skipCentered &&
        before.every((w, b) => {
          const center = new Vector3(...(def?.bodies?.[b].pivot ?? [0, 0, 0])).applyMatrix4(w);
          return center.distanceToSquared(center.clone().applyMatrix4(transform)) < 1e-10;
        });
      const match = centered
        ? { id, worlds: before }
        : existing.get(signature({ ...old, type, props }, worlds));
      if (match !== undefined) {
        ids.set(id, match.id);
        desired.set(id, [...match.worlds]);
        continue;
      }
      const copy = d.allocId();
      ids.set(id, copy);
      desired.set(id, worlds);
      fresh.push(id);
      made.push(copy);
      points.set(id, new Map([...(old.points?.keys() ?? [])].map((u) => [u, newUuid()])));
      d.add({ ...old, id: copy, type, props, conns: [], points: old.points ? new Map() : null });
    }
    const origins = new Map([...ids].map(([a, b]) => [b, a]));
    const mappedSocket = (id: PartId, s: string) =>
      reflected ? reflectedSocket(cat, doc.parts.get(id)!.type, s) : s;
    const planned = (id: PartId, b?: number): Matrix4 => {
      if (!ids.has(id))
        return bodyWorld(
          poses,
          id,
          b ?? leadBody(cat.parts[doc.parts.get(id)!.type], doc.parts.get(id)!),
        )!;
      const old = doc.parts.get(id)!,
        list = desired.get(id)!;
      return list[b ?? leadBody(cat.parts[old.type], old)] ?? list[0];
    };
    for (const id of fresh) {
      const old = doc.parts.get(id)!,
        copy = ids.get(id)!,
        next = d.get(copy)!;
      const remapped: Conn[] = old.conns.flatMap((c) => {
        const t = c.target;
        if (t.kind === 'raw') {
          if (!t.self)
            throw new Error(`Resolve unknown connections on ${old.type} before mirroring.`);
          return [
            {
              self: mappedSocket(id, c.self),
              target: {
                ...t,
                triple: [
                  mappedSocket(id, String(t.triple[0])),
                  mappedSocket(id, String(t.triple[1])),
                  t.triple[2],
                ],
              },
            } as Conn,
          ];
        }
        const part = ids.get(t.part);
        if (part === undefined) return [];
        return [
          {
            self: mappedSocket(id, c.self),
            target:
              t.kind === 'socket'
                ? { kind: 'socket', part, socket: mappedSocket(t.part, t.socket) }
                : { kind: 'point', part, uuid: points.get(t.part)?.get(t.uuid) ?? t.uuid },
          } as Conn,
        ];
      });
      const cloned = new Map<string, Point>();
      for (const p of old.points?.values() ?? []) {
        const uuid = points.get(id)!.get(p.uuid)!;
        const oldWorld = poses.world
          .get(id)!
          .clone()
          .multiply(subPartMatrix(cat, old.type, p.partName, old.props).m)
          .multiply(cfToMatrix4(p.cframe));
        const pointWorld = copyFrame(transform, oldWorld, 'Part');
        const sub = subPartMatrix(cat, next.type, p.partName, next.props).m;
        cloned.set(uuid, {
          ...p,
          uuid,
          cframe: matrix4ToCf(planned(id).clone().multiply(sub).invert().multiply(pointWorld)),
        });
      }
      d.set({ ...next, conns: remapped, points: old.points ? cloned : null });
    }
    const mount = (
      sourceId: PartId,
      parent: PartId,
      self: string,
      world: Matrix4,
      partName: string,
    ) => {
      const child = d.get(ids.get(sourceId)!)!,
        h = d.get(parent)!;
      const parentSource = origins.get(parent);
      const parentWorld =
        parentSource === undefined ? poses.world.get(parent)! : planned(parentSource);
      const frame = pointFrameFor(
        parentWorld,
        subPartMatrix(cat, h.type, partName, h.props).m,
        world,
        childSocketMatrix(cat, child.type, self, 'point').m,
        child.props,
        cat.conventions,
        bodyPivot(cat, child.type, self),
      );
      const uuid = addPoint(d, parent, frame, partName);
      d.set({
        ...d.get(child.id)!,
        conns: [{ self, target: { kind: 'point', part: parent, uuid } }, ...d.get(child.id)!.conns],
      });
    };
    const jointWorld = (id: PartId, b: number) => {
      const origin = origins.get(id);
      return origin === undefined ? knownWorlds.get(id)?.[b] : planned(origin, b);
    };
    const usedClonedPoints: { host: PartId; uuid: string }[] = [];
    for (const id of fresh) {
      const old = doc.parts.get(id)!,
        copy = ids.get(id)!,
        def = cat.parts[old.type],
        bodies = def?.bodies?.length ?? 1;
      for (let b = 0; b < bodies; b++) {
        let next = d.get(copy)!;
        const original = old.conns.find(
          (c) => c.target.kind !== 'raw' && bodyOfSocket(def, c.self) === b,
        );
        const c =
          original &&
          next.conns.find(
            (c) => c.self === mappedSocket(id, original.self) && c.target.kind !== 'raw',
          );
        const world = planned(id, b);
        if (
          c?.target.kind === 'point' &&
          original?.target.kind === 'point' &&
          points.get(original.target.part)?.get(original.target.uuid) === c.target.uuid
        )
          usedClonedPoints.push({ host: c.target.part, uuid: c.target.uuid });
        if (
          c?.target.kind !== 'socket' &&
          attachToMatchingSocket(d, cat, copy, b, world, jointWorld, c)
        )
          continue;
        if (c?.target.kind === 'point') {
          const h = d.get(c.target.part)!,
            point =
              h.points?.get(c.target.uuid) ??
              (original?.target.kind === 'point'
                ? doc.parts.get(original.target.part)?.points?.get(original.target.uuid)
                : undefined);
          if (!point) throw new Error('A mirrored attachment point is missing.');
          const parentSource = origins.get(h.id)!;
          const frame = pointFrameFor(
            planned(parentSource),
            subPartMatrix(cat, h.type, point.partName, h.props).m,
            world,
            childSocketMatrix(cat, next.type, c.self, 'point').m,
            next.props,
            cat.conventions,
            bodyPivot(cat, next.type, c.self),
          );
          if (fresh.includes(parentSource)) setPointCFrame(d, h.id, point.uuid, frame);
          else {
            const uuid = addPoint(d, h.id, frame, point.partName);
            d.set({
              ...next,
              conns: next.conns.map((x) =>
                x === c ? { ...c, target: { kind: 'point', part: h.id, uuid } } : x,
              ),
            });
          }
          continue;
        }
        if (c?.target.kind === 'socket') {
          const t = c.target,
            h = d.get(t.part)!,
            parentSource = origins.get(h.id)!;
          const expected = childWorldViaSocket(
            planned(parentSource, bodyOfSocket(cat.parts[h.type], t.socket)),
            socketMatrix(cat, h.type, t.socket, h.props).m,
            childSocketMatrix(cat, next.type, c.self, { type: h.type, socket: t.socket }).m,
            ignoresOrientation(cat, h.type, t.socket) ? {} : next.props,
            cat.conventions,
            bodyPivot(cat, next.type, c.self),
          );
          const check = draftDoc(d),
            parts = new Map(check.parts);
          parts.set(copy, { ...next, conns: next.conns.filter((x) => x !== c) });
          const available = canBeParent({ ...check, parts }, cat, t.part, t.socket).ok;
          if (!available && isSignalJoint(cat, next.type, c.self, h.type, t.socket))
            throw new Error(
              'A mirrored signal socket is already occupied. The build was not changed.',
            );
          if (sameFrame(expected, world) && available) continue;
          if (attachToMatchingSocket(d, cat, copy, b, world, jointWorld, c)) continue;
        } else if (!original && b !== leadBody(def, old) && sameFrame(world, planned(id))) continue;
        const signal =
          c?.target.kind === 'socket' &&
          isSignalJoint(cat, next.type, c.self, d.get(c.target.part)!.type, c.target.socket);
        if (c && !signal) {
          d.set({ ...next, conns: next.conns.filter((x) => x !== c) });
          next = d.get(copy)!;
        }
        const check = draftDoc(d),
          candidates = [
            original ? mappedSocket(id, original.self) : null,
            cat.parts[next.type]?.defaultMount,
            ...(cat.parts[next.type]?.childSockets ?? []),
          ];
        const self = candidates.find(
          (s): s is string =>
            !!s &&
            bodyOfSocket(cat.parts[next.type], s) === b &&
            canBeChild(check, cat, copy, s, 'mount').ok,
        );
        if (!self)
          throw new Error(
            `${old.type} has no free mount to preserve this mirrored placement and its wiring. Try selecting its connected parts or use radial mode.`,
          );
        let parent = anchor,
          partName = cat.parts[host.type].mainPartName;
        if (
          c?.target.kind === 'socket' &&
          !signal &&
          bodyOfSocket(cat.parts[d.get(c.target.part)!.type], c.target.socket) ===
            leadBody(cat.parts[d.get(c.target.part)!.type], d.get(c.target.part)!)
        ) {
          parent = c.target.part;
          const h = d.get(parent)!;
          partName =
            isServo(h.type) && c.target.socket === '2' ? 'Spinner' : cat.parts[h.type].mainPartName;
        }
        mount(id, parent, self, world, partName);
      }
    }
    const pointUsers = graphIndex(draftDoc(d)).pointUsers;
    for (const { host, uuid } of usedClonedPoints)
      if (!pointUsers.has(`${host}:${uuid}`)) {
        const part = d.get(host)!,
          kept = new Map(part.points);
        kept.delete(uuid);
        d.set({ ...part, points: kept });
      }
    const final = computePoses(draftDoc(d), cat, cat.conventions);
    for (const id of fresh) {
      const copy = ids.get(id)!,
        actual = final.bodies?.get(copy) ?? [final.world.get(copy)!];
      if (actual.some((m, b) => !sameFrame(m, desired.get(id)![b])))
        throw new Error(
          `Could not preserve the mirrored pose of ${doc.parts.get(id)!.type}. The build was not changed.`,
        );
      existing.set(signature(d.get(copy)!, actual), { id: copy, worlds: actual });
      knownWorlds.set(copy, actual);
    }
  }
  if (made.length) {
    const result = draftDoc(d),
      final = computePoses(result, cat, cat.conventions);
    const error = validate(result, cat, DEFAULT_LIMITS, 0, final).find(
      (i) => i.severity === 'error' && !existingErrors.has(canonical(i)),
    );
    if (error)
      throw new Error(
        `Cannot preserve mirrored connections: ${error.message} The build was not changed.`,
      );
  }
  return made;
}
