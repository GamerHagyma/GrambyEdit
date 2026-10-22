// Exact code-size meter (spec §13.5). Its total equals a full `encode`, without building the entries.
// Each part caches its entry bytes with every resolved parent index written as one `0`; each call then
// adds the real digits of the target indices, which depend on the export order.
import { utf8Length } from './codec';
import { entryOf, orderIndex } from './doc';
import type { Doc, Part, PartId } from './types';

/** Keyed by the immutable `Part`, so a changed part gets a new entry and unchanged parts are never re-stringified. */
const cache = new WeakMap<Part, number>();

function cachedBytes(part: Part): number {
  let bytes = cache.get(part);
  if (bytes === undefined) {
    // Socket, point and self-joint conns all write a parent index; it is cached as the digit `0`.
    const resolved = part.conns.filter((c) => c.target.kind !== 'raw' || c.target.self).length;
    bytes = utf8Length(JSON.stringify(entryOf(part, () => 0))) - resolved;
    cache.set(part, bytes);
  }
  return bytes;
}

/** UTF-8 bytes of one part's export entry. `position` maps each part id to its 0-based export position. */
export function entryBytes(part: Part, position: ReadonlyMap<PartId, number>): number {
  let bytes = cachedBytes(part);
  for (const { target } of part.conns) {
    if (target.kind === 'raw' && !target.self) continue;
    const id = target.kind === 'raw' ? part.id : target.part;
    const at = position.get(id);
    if (at === undefined) throw new Error(`connection target ${id} is not in the export order`);
    bytes += String(at + 1).length;
  }
  return bytes;
}

/** Base64 length of `jsonBytes` bytes, padding included. */
export function base64Length(jsonBytes: number): number {
  return 4 * Math.ceil(jsonBytes / 3);
}

/** Exact size of `encode(toEntries(doc))`: the brackets, one comma between entries, then the entries. */
export function codeSize(doc: Doc): { jsonBytes: number; base64Chars: number } {
  const position = orderIndex(doc);
  let jsonBytes = 2 + Math.max(doc.order.length - 1, 0);
  for (const id of doc.order) jsonBytes += entryBytes(doc.parts.get(id)!, position);
  return { jsonBytes, base64Chars: base64Length(jsonBytes) };
}

/** `value` as a percentage of `limit`, with exactly two decimals; `0.00` when there is no limit. */
export function formatPercent(value: number, limit: number): string {
  return limit > 0 ? ((value / limit) * 100).toFixed(2) : '0.00';
}
