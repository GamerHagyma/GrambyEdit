// Prefer a real joint only when it reproduces the requested pose without perceptible movement.
import { Matrix4, Vector3 } from 'three';
import type { Catalog } from '../catalog-types';
import { childWorldViaSocket, matingMatrix, orientationFromRotation } from '../conventions';
import { wouldCreatePoseCycle } from '../graph';
import {
  bodyOfSocket,
  bodyPivot,
  childSocketMatrix,
  ignoresOrientation,
  socketMatrix,
} from '../pose';
import { canBeChild, canBeParent, isSignalJoint } from '../rules';
import { sameFrame } from '../symmetry';
import type { Conn, PartId } from '../types';
import { draftDoc } from './conns';
import type { Draft } from './transact';

const MIRROR_SOCKET_TOLERANCE = 0.0001;
export function attachToMatchingSocket(
  d: Draft,
  cat: Catalog,
  id: PartId,
  body: number,
  wanted: Matrix4,
  worldFor: (id: PartId, body: number) => Matrix4 | undefined,
  replaced?: Conn,
): boolean {
  const part = d.get(id)!,
    def = cat.parts[part.type];
  if (!def) return false;
  const keepSignal =
    replaced?.target.kind === 'socket' &&
    isSignalJoint(
      cat,
      part.type,
      replaced.self,
      d.get(replaced.target.part)!.type,
      replaced.target.socket,
    );
  const rest = keepSignal ? part.conns : part.conns.filter((c) => c !== replaced);
  const snapshot = draftDoc(d),
    parts = new Map(snapshot.parts);
  parts.set(id, { ...part, conns: rest });
  const check = { ...snapshot, parts };
  let best: { conn: Conn; props: typeof part.props; distance: number } | null = null;
  for (const [hostId, host] of snapshot.parts) {
    if (hostId === id) continue;
    const hostDef = cat.parts[host.type];
    if (!hostDef) continue;
    for (const socket of hostDef.parentSockets) {
      if (!canBeParent(check, cat, hostId, socket).ok) continue;
      const parent = worldFor(hostId, bodyOfSocket(hostDef, socket));
      if (!parent) continue;
      const at = parent.clone().multiply(socketMatrix(cat, host.type, socket, host.props).m);
      const parentPosition = new Vector3().setFromMatrixPosition(at),
        parentNormal = new Vector3().setFromMatrixColumn(at, 1).normalize();
      for (const self of def.childSockets) {
        if (bodyOfSocket(def, self) !== body || !canBeChild(check, cat, id, self, 'joint').ok)
          continue;
        const child = childSocketMatrix(cat, part.type, self, { type: host.type, socket }).m;
        const ball = wanted.clone().multiply(child),
          distance = new Vector3().setFromMatrixPosition(ball).distanceTo(parentPosition);
        if (distance > MIRROR_SOCKET_TOLERANCE || (best && distance >= best.distance)) continue;
        const normal = new Vector3().setFromMatrixColumn(ball, 1).normalize();
        if (normal.dot(parentNormal) > -1 + 1e-6) continue;
        if (wouldCreatePoseCycle(check, id, hostId)) continue;
        const ignored = ignoresOrientation(cat, host.type, socket, {
            type: part.type,
            socket: self,
          }),
          pivot = bodyPivot(cat, part.type, self);
        const expected = (props: typeof part.props) =>
          childWorldViaSocket(
            parent,
            socketMatrix(cat, host.type, socket, host.props).m,
            child,
            ignored ? {} : props,
            cat.conventions,
            pivot,
          );
        let props = part.props;
        if (!sameFrame(expected(props), wanted, MIRROR_SOCKET_TOLERANCE)) {
          if (ignored || (def.bodies?.length ?? 1) > 1) continue;
          const zero = { ...part.props, OrientationX: 0, OrientationY: 0, OrientationZ: 0 };
          const rotation =
            cat.conventions.orientationPivot === 'socket'
              ? at
                  .clone()
                  .invert()
                  .multiply(wanted)
                  .multiply(child)
                  .multiply(matingMatrix(cat.conventions).invert())
              : expected(zero).invert().multiply(wanted);
          const angles = orientationFromRotation(rotation, cat.conventions),
            next = { ...part.props };
          for (const [key, value] of [
            ['OrientationX', angles.x],
            ['OrientationY', angles.y],
            ['OrientationZ', angles.z],
          ] as const)
            if (value !== 0 || Object.hasOwn(next, key)) next[key] = value;
          props = next;
          if (!sameFrame(expected(props), wanted, MIRROR_SOCKET_TOLERANCE)) continue;
        }
        best = {
          conn: { self, target: { kind: 'socket', part: hostId, socket } },
          props,
          distance,
        };
      }
    }
  }
  if (!best) return false;
  d.set({ ...part, props: best.props, conns: [best.conn, ...rest] });
  return true;
}
