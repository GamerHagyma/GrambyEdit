// Terse builders for hand-written test documents.
import type {
  CFrame12,
  Conn,
  Doc,
  Json,
  Part,
  PartId,
  Point,
  SocketId,
  Uuid,
} from '../../src/core/types';

export function part(
  id: PartId,
  type: string,
  conns: Conn[] = [],
  props: Record<string, Json> = {},
  points: Point[] | null = null,
): Part {
  return { id, type, conns, props, points: points && new Map(points.map((p) => [p.uuid, p])) };
}

export function sock(self: SocketId, part: PartId, socket: SocketId): Conn {
  return { self, target: { kind: 'socket', part, socket } };
}

export function mount(self: SocketId, host: PartId, uuid: Uuid): Conn {
  return { self, target: { kind: 'point', part: host, uuid } };
}

export function pt(
  uuid: Uuid,
  cframe: CFrame12 = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  partName = 'Part',
): Point {
  return { uuid, partName, cframe };
}

function docFrom(parts: readonly Part[]): Doc {
  let maxId = 0;
  for (const p of parts) maxId = Math.max(maxId, p.id);
  return {
    parts: new Map(parts.map((p) => [p.id, p])),
    order: parts.map((p) => p.id),
    layout: new Map(),
    nextId: maxId + 1,
  };
}

/** Parts in the given order, `nextId` = max id + 1, empty layout. */
export function docOf(...parts: Part[]): Doc {
  return docFrom(parts);
}

/** `Part` 1 is a root; part i+1 sits on part i via `1 → 6`. */
export function chainDoc(n: number): Doc {
  const parts: Part[] = [part(1, 'Part')];
  for (let i = 1; i < n; i++) parts.push(part(i + 1, 'Part', [sock('1', i, '6')]));
  return docFrom(parts);
}
