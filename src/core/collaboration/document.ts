// Compact, validated field operations. No editor closures or executable data cross the wire.
import { isCFrame12 } from '../cframe';
import { transact } from '../ops/transact';
import type { CFrame12, Conn, Doc, Json, Part, Point } from '../types';
export const MAX_ID = 1_000_000_000_000,
  MAX_PARTS = 32000;
export interface WirePart {
  id: number;
  type: string;
  conns: readonly Conn[];
  props: Readonly<Record<string, Json>>;
  points: readonly Point[] | null;
}
export interface WireDoc {
  parts: WirePart[];
  order: number[];
  layout: [number, CFrame12][];
  nextId: number;
}
export type Op =
  | ['p', number, WirePart | null]
  | ['t', number, string]
  | ['v', number, string, Json[]]
  | ['ps', number, readonly Point[] | null]
  | ['pt', number, string, Point | null]
  | ['c', number, readonly Conn[]]
  | ['l', number, CFrame12 | null]
  | ['o', number[]]
  | ['n', number];
export type Delta = readonly Op[];
/** Keep the final value of a field within a short unsent burst, retaining creation/deletion order. */
export function compactDelta(ops: Delta): Delta {
  const result: (Op | null)[] = [],
    fields = new Map<string, number>();
  for (const op of ops) {
    if (op[0] === 'p' || op[0] === 'ps') fields.clear();
    const key =
      op[0] === 'p' || op[0] === 'ps'
        ? null
        : JSON.stringify(
            op.slice(
              0,
              op[0] === 'v' || op[0] === 'pt' ? 3 : op[0] === 'o' || op[0] === 'n' ? 1 : 2,
            ),
          );
    if (key !== null) {
      const prior = fields.get(key);
      if (prior !== undefined) result[prior] = null;
      fields.set(key, result.length);
    }
    result.push(op);
  }
  return result.filter((op): op is Op => op !== null);
}
export interface Guarded {
  ops: Delta;
  guards: readonly unknown[];
}
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const id = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0 && Number(v) < MAX_ID;
const text = (v: unknown, max = 512): v is string => typeof v === 'string' && v.length <= max;
function ensure(ok: unknown): asserts ok {
  if (!ok) throw new Error('Invalid collaboration document or edit.');
}
function json(v: unknown, depth = 0): boolean {
  if (depth > 48) return false;
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => json(x, depth + 1));
  return object(v) && Object.entries(v).every(([k, x]) => k.length <= 4096 && json(x, depth + 1));
}
function point(v: unknown): v is Point {
  return object(v) && text(v.uuid, 4096) && text(v.partName) && isCFrame12(v.cframe);
}
function conns(v: unknown): v is Conn[] {
  return (
    Array.isArray(v) &&
    v.length <= 4096 &&
    v.every((c) => {
      if (!object(c) || !text(c.self) || !object(c.target)) return false;
      const t = c.target;
      return t.kind === 'socket'
        ? id(t.part) && text(t.socket)
        : t.kind === 'point'
          ? id(t.part) && text(t.uuid, 4096)
          : t.kind === 'raw' &&
            Array.isArray(t.triple) &&
            json(t.triple) &&
            (t.self === undefined || t.self === true);
    })
  );
}
function wirePart(v: unknown): v is WirePart {
  return (
    object(v) &&
    id(v.id) &&
    text(v.type) &&
    conns(v.conns) &&
    object(v.props) &&
    json(v.props) &&
    (v.points === null ||
      (Array.isArray(v.points) &&
        v.points.every(point) &&
        new Set(v.points.map((p) => p.uuid)).size === v.points.length))
  );
}
export const encodePart = (p: Part): WirePart => ({
  ...p,
  points: p.points ? [...p.points.values()] : null,
});
const decodePart = (p: WirePart): Part => ({
  ...p,
  points: p.points ? new Map(p.points.map((p) => [p.uuid, p])) : null,
});
export function encodeDoc(doc: Doc): WireDoc {
  return {
    parts: doc.order.map((id) => encodePart(doc.parts.get(id)!)),
    order: [...doc.order],
    layout: [...doc.layout],
    nextId: doc.nextId,
  };
}
export function decodeDoc(value: unknown): Doc {
  ensure(
    object(value) &&
      Array.isArray(value.parts) &&
      value.parts.length <= MAX_PARTS &&
      value.parts.every(wirePart) &&
      Array.isArray(value.order) &&
      value.order.every(id) &&
      Array.isArray(value.layout) &&
      id(value.nextId),
  );
  const parts = new Map(value.parts.map((p) => [p.id, decodePart(p)]));
  ensure(
    parts.size === value.parts.length &&
      value.order.length === parts.size &&
      new Set(value.order).size === parts.size &&
      value.order.every((i) => parts.has(i)) &&
      value.parts.every((p) => p.id < Number(value.nextId)),
  );
  ensure(
    value.layout.every(
      (e) => Array.isArray(e) && e.length === 2 && parts.has(e[0]) && isCFrame12(e[1]),
    ),
  );
  ensure(new Set(value.layout.map((e) => e[0])).size === value.layout.length);
  return {
    parts,
    order: value.order,
    layout: new Map(value.layout as [number, CFrame12][]),
    nextId: value.nextId,
  };
}
export function decodeDelta(value: unknown): Delta {
  ensure(Array.isArray(value) && value.length <= 200000);
  for (const op of value) {
    ensure(Array.isArray(op));
    const [k, i, a, b] = op;
    if (k === 'o') {
      ensure(
        op.length === 2 &&
          Array.isArray(i) &&
          i.length <= MAX_PARTS &&
          i.every(id) &&
          new Set(i).size === i.length,
      );
      continue;
    }
    ensure(id(i));
    if (k === 'p') ensure(op.length === 3 && (a === null || (wirePart(a) && a.id === i)));
    else if (k === 't') ensure(op.length === 3 && text(a));
    else if (k === 'v')
      ensure(op.length === 4 && text(a, 4096) && Array.isArray(b) && b.length <= 1 && json(b));
    else if (k === 'ps')
      ensure(
        op.length === 3 &&
          (a === null ||
            (Array.isArray(a) &&
              a.every(point) &&
              new Set(a.map((p) => p.uuid)).size === a.length)),
      );
    else if (k === 'pt')
      ensure(op.length === 4 && text(a, 4096) && (b === null || (point(b) && b.uuid === a)));
    else if (k === 'c') ensure(op.length === 3 && conns(a));
    else if (k === 'l') ensure(op.length === 3 && (a === null || isCFrame12(a)));
    else ensure(k === 'n' && op.length === 2);
  }
  return value as unknown as Delta;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value))
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
const same = (a: unknown, b: unknown) => a === b || canonical(a) === canonical(b);
export function deltaBetween(before: Doc, after: Doc): Delta {
  if (before === after) return [];
  const out: Op[] = [];
  for (const id of before.parts.keys()) if (!after.parts.has(id)) out.push(['p', id, null]);
  for (const [id, p] of after.parts) {
    const old = before.parts.get(id);
    if (!old) {
      out.push(['p', id, encodePart(p)]);
      continue;
    }
    if (old === p) continue;
    if (old.type !== p.type) out.push(['t', id, p.type]);
    if (!same(old.conns, p.conns)) out.push(['c', id, p.conns]);
    for (const key of new Set([...Object.keys(old.props), ...Object.keys(p.props)])) {
      if (
        Object.hasOwn(old.props, key) !== Object.hasOwn(p.props, key) ||
        !same(old.props[key], p.props[key])
      )
        out.push(['v', id, key, Object.hasOwn(p.props, key) ? [p.props[key]] : []]);
    }
    if (old.points === null && p.points !== null) {
      if (p.points.size === 0) out.push(['ps', id, []]);
      else for (const point of p.points.values()) out.push(['pt', id, point.uuid, point]);
    } else if (old.points !== null && p.points === null) {
      for (const key of old.points.keys()) out.push(['pt', id, key, null]);
      out.push(['ps', id, null]);
    } else if (old.points && p.points)
      for (const key of new Set([...old.points.keys(), ...p.points.keys()]))
        if (!same(old.points.get(key), p.points.get(key)))
          out.push(['pt', id, key, p.points.get(key) ?? null]);
  }
  for (const i of new Set([...before.layout.keys(), ...after.layout.keys()]))
    if (!same(before.layout.get(i), after.layout.get(i)))
      out.push(['l', i, after.layout.get(i) ?? null]);
  const natural = [
    ...before.order.filter((i) => after.parts.has(i)),
    ...after.order.filter((i) => !before.parts.has(i)),
  ];
  if (!same(natural, after.order)) out.push(['o', [...after.order]]);
  if (before.nextId !== after.nextId) out.push(['n', after.nextId]);
  return out;
}
export function valueAt(doc: Doc, op: Op): unknown {
  const [k, i] = op;
  if (k === 'o') return doc.order;
  if (k === 'n') return doc.nextId;
  const p = doc.parts.get(i);
  if (k === 'p') return p ? encodePart(p) : null;
  if (k === 'l') return doc.layout.get(i) ?? null;
  if (!p) return null;
  if (k === 'v') return Object.hasOwn(p.props, op[2]) ? [p.props[op[2]]] : [];
  if (k === 'pt') return p.points?.get(op[2]) ?? null;
  if (k === 'ps') return p.points ? [...p.points.values()] : null;
  return k === 't' ? p.type : p.conns;
}
export function applyDelta(doc: Doc, ops: Delta, guards?: readonly unknown[]): Doc {
  const accepted = guards ? ops.filter((op, i) => same(valueAt(doc, op), guards[i])) : ops;
  const result = transact(doc, 'Shared edit', (d) => {
    for (const op of accepted) {
      const [k, i] = op;
      if (k === 'o') {
        const wanted = i.filter((id) => d.get(id));
        d.setOrder([...wanted, ...d.order().filter((id) => !wanted.includes(id))]);
        continue;
      }
      if (k === 'n') continue;
      if (k === 'p') {
        if (op[2] === null) {
          if (d.get(i)) d.delete(i);
        } else {
          ensure(!d.get(i));
          d.add(decodePart(op[2]));
        }
        continue;
      }
      if (k === 'l') {
        if (d.get(i)) d.setLayout(i, op[2]);
        continue;
      }
      const p = d.get(i);
      if (!p) continue;
      if (k === 't') d.set({ ...p, type: op[2] });
      if (k === 'c') d.set({ ...p, conns: op[2] });
      if (k === 'v') {
        const props = { ...p.props };
        if (op[3].length)
          Object.defineProperty(props, op[2], {
            value: op[3][0],
            enumerable: true,
            configurable: true,
            writable: true,
          });
        else delete props[op[2]];
        d.set({ ...p, props });
      }
      if (k === 'ps')
        d.set({ ...p, points: op[2] ? new Map(op[2].map((p) => [p.uuid, p])) : null });
      if (k === 'pt') {
        const points = new Map(p.points);
        if (op[3]) points.set(op[2], op[3]);
        else points.delete(op[2]);
        d.set({ ...p, points });
      }
    }
  }).doc;
  const next = accepted.reduce(
    (value, op) => (op[0] === 'n' ? Math.max(value, op[1]) : value),
    result.nextId,
  );
  ensure(result.parts.size <= MAX_PARTS && id(next));
  return next === result.nextId ? result : { ...result, nextId: next };
}
export function conditionalInverse(before: Doc, after: Doc): Guarded {
  const ops = deltaBetween(after, before).filter((op) => op[0] !== 'n');
  return { ops, guards: ops.map((op) => valueAt(after, op)) };
}
function hash(text: string): string {
  let a = 2166136261,
    b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 2246822519);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
const partHashes = new WeakMap<Part, string>();
export function digest(doc: Doc): string {
  const values = doc.order.map((id) => {
    const p = doc.parts.get(id)!;
    let h = partHashes.get(p);
    if (!h) {
      const wire = encodePart(p);
      h = hash(
        canonical({
          ...wire,
          points: wire.points
            ? [...wire.points].sort((a, b) => (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0))
            : null,
        }),
      );
      partHashes.set(p, h);
    }
    return id + ':' + h + ':' + canonical(doc.layout.get(id) ?? null);
  });
  return hash(doc.nextId + '|' + values.join('|'));
}
