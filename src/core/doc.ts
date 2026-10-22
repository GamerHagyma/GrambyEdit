// Share entries <-> Doc (spec §6.2, fidelity rules F1–F10). Unknown content survives verbatim.
import { isCFrame12 } from './cframe';
import type { CFrame12, Conn, Doc, Json, Part, PartId, Point, SocketId, Uuid } from './types';

export type ImportError = { entry: number; reason: string };

type Props = { props: Record<string, Json>; points: Map<Uuid, Point> | null };

const EPHEMERAL = 'EphemeralAttachments';

const isObject = (v: unknown): v is Record<string, Json> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Socket ids are strings; the game also writes integers, which read as their decimal text (F3). */
function socketId(v: Json): SocketId | null {
  if (typeof v === 'string') return v;
  return Number.isInteger(v) ? String(v) : null;
}

/** The parent index, when it names another entry of this code (F8). */
function parentIndex(v: Json, owner: PartId, count: number): PartId | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= count && v !== owner
    ? v
    : null;
}

/** Anything unresolvable keeps its original triple and exports verbatim. */
function rawConn(triple: Json[]): Conn {
  return { self: String(triple[0]), target: { kind: 'raw', triple: [...triple] } };
}

/** A connection triple `[self, socket | {uuid}, parent]`. */
function readConn(triple: Json[], owner: PartId, count: number): Conn {
  const [a, b, c] = triple;
  const self = socketId(a);
  const part = parentIndex(c, owner, count);
  if (self === null || part === null) return rawConn(triple);
  if (typeof b === 'string' && b.startsWith('{')) {
    return { self, target: { kind: 'point', part, uuid: b } };
  }
  const socket = socketId(b);
  return socket === null ? rawConn(triple) : { self, target: { kind: 'socket', part, socket } };
}

/** `{partName, cframe[12]}` and no other keys (F10). */
function asPoint(v: Json): { partName: string; cframe: CFrame12 } | null {
  if (!isObject(v) || Object.keys(v).length !== 2) return null;
  const { partName, cframe } = v;
  return typeof partName === 'string' && isCFrame12(cframe) ? { partName, cframe } : null;
}

/** `EphemeralAttachments` becomes `points` (F6); every other key stays in `props` (F5). */
function readProps(v: Json): { ok: true; value: Props } | { ok: false; reason: string } {
  if (Array.isArray(v) && v.length === 0) return { ok: true, value: { props: {}, points: null } };
  if (!isObject(v)) return { ok: false, reason: 'props is neither an object nor []' };
  const props: Record<string, Json> = {};
  let points: Map<Uuid, Point> | null = null;
  for (const [key, value] of Object.entries(v)) {
    if (key === EPHEMERAL && isObject(value)) {
      points = new Map();
      for (const [uuid, p] of Object.entries(value)) {
        const point = asPoint(p);
        if (point === null) {
          return {
            ok: false,
            reason: `EphemeralAttachments ${uuid} is not {partName, cframe[12]}`,
          };
        }
        points.set(uuid, { uuid, ...point });
      }
    } else if (key === EPHEMERAL && Array.isArray(value) && value.length === 0) {
      points = new Map();
    } else {
      // A non-object EphemeralAttachments (not in F10) is kept as an ordinary prop, so it survives.
      props[key] = value;
    }
  }
  return { ok: true, value: { props, points } };
}

function readPart(
  entry: Json,
  id: PartId,
  count: number,
): { ok: true; part: Part } | { ok: false; reason: string } {
  // A non-array entry has no name at index 0, so it fails the name check.
  const [name, conns, props] = Array.isArray(entry) ? entry : [];
  if (typeof name !== 'string') return { ok: false, reason: 'name is not a string' };
  if (!Array.isArray(conns)) return { ok: false, reason: 'connections is not an array' };
  const connections: Conn[] = [];
  for (const [i, c] of conns.entries()) {
    if (!Array.isArray(c) || c.length !== 3) {
      return { ok: false, reason: `connection ${i} is not a 3-element array` };
    }
    connections.push(readConn(c, id, count));
  }
  const fields = readProps(props);
  if (!fields.ok) return fields;
  const { props: propMap, points } = fields.value;
  return { ok: true, part: { id, type: name, conns: connections, props: propMap, points } };
}

/** Parts get ids 1..N in entry order; the layout starts empty. */
export function fromEntries(
  entries: readonly Json[],
): { ok: true; doc: Doc } | { ok: false; error: ImportError } {
  const parts = new Map<PartId, Part>();
  for (const [i, entry] of entries.entries()) {
    const r = readPart(entry, i + 1, entries.length);
    if (!r.ok) return { ok: false, error: { entry: i, reason: r.reason } };
    parts.set(r.part.id, r.part);
  }
  return {
    ok: true,
    doc: { parts, order: [...parts.keys()], layout: new Map(), nextId: entries.length + 1 },
  };
}

/** Export position (0-based) of every part. Docs are immutable, so the result is memoised per Doc. */
const orders = new WeakMap<Doc, ReadonlyMap<PartId, number>>();

export function orderIndex(doc: Doc): ReadonlyMap<PartId, number> {
  let index = orders.get(doc);
  if (!index) {
    index = new Map(doc.order.map((id, i): [PartId, number] => [id, i]));
    orders.set(doc, index);
  }
  return index;
}

/** Empty props export as `[]` (F4). `EphemeralAttachments` is written last, and an empty map as `[]` (F6). */
function propsOut(part: Part): Json {
  const { points } = part;
  if (points === null && Object.keys(part.props).length === 0) return [];
  const out: Record<string, Json> = { ...part.props };
  if (points !== null) {
    out[EPHEMERAL] =
      points.size === 0
        ? []
        : Object.fromEntries(
            [...points].map(([uuid, p]) => [uuid, { partName: p.partName, cframe: [...p.cframe] }]),
          );
  }
  return out;
}

function connOut(conn: Conn, indexOf: (id: PartId) => number): Json[] {
  const t = conn.target;
  if (t.kind === 'raw') return [...t.triple];
  return [conn.self, t.kind === 'point' ? t.uuid : t.socket, indexOf(t.part)];
}

/** One export entry, `[type, connections, props]`. `indexOf` gives the 1-based export index of a part. */
export function entryOf(part: Part, indexOf: (id: PartId) => number): Json {
  return [part.type, part.conns.map((c) => connOut(c, indexOf)), propsOut(part)];
}

/** Export in `order`: the index in the code is position + 1 (F1). A target outside the order is a bug, so it throws. */
export function toEntries(doc: Doc): Json[] {
  const position = orderIndex(doc);
  const indexOf = (id: PartId): number => {
    const at = position.get(id);
    if (at === undefined) throw new Error(`connection target ${id} is not in the export order`);
    return at + 1;
  };
  return doc.order.map((id) => entryOf(doc.parts.get(id)!, indexOf));
}

function sockText(v: Json): Json {
  return Number.isInteger(v) ? String(v) : v;
}

function normalizeConn(c: Json): Json {
  if (!Array.isArray(c)) return c;
  const [self, socket, parent] = c;
  return [sockText(self), sockText(socket), parent];
}

function normalizeProps(p: Json): Json {
  if (!isObject(p)) return p;
  if (Object.keys(p).length === 0) return [];
  const eph = p[EPHEMERAL];
  return isObject(eph) && Object.keys(eph).length === 0 ? { ...p, [EPHEMERAL]: [] } : p;
}

/** F3/F4 normalisation, for comparisons only: integer socket ids become strings, empty props become []. */
export function normalizeEntries(entries: readonly Json[]): Json[] {
  return entries.map((entry): Json => {
    if (!Array.isArray(entry)) return entry;
    const [name, conns, props] = entry;
    return [name, Array.isArray(conns) ? conns.map(normalizeConn) : conns, normalizeProps(props)];
  });
}
