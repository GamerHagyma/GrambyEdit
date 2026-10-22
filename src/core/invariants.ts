// Model invariants I1–I4 (spec §6.1). Tests assert these after every op.
import type { Doc, Part, PartId } from './types';

const isRoot = (part: Part): boolean => part.conns.every((c) => c.target.kind === 'raw');

/** One message per violated invariant; [] when I1–I4 hold. Imports may break I3 and I5, which surface as issues. */
export function checkInvariants(doc: Doc): string[] {
  const out: string[] = [];

  const seen = new Set<PartId>();
  let permutation = doc.order.length === doc.parts.size;
  for (const id of doc.order) {
    if (!doc.parts.has(id) || seen.has(id)) permutation = false;
    seen.add(id);
  }
  if (!permutation) out.push('I1: order is not a permutation of the part ids');
  for (const [id, part] of doc.parts) {
    if (part.id !== id) out.push(`I1: part ${id} carries id ${part.id}`);
    if (id >= doc.nextId) out.push(`I1: part ${id} is not below nextId ${doc.nextId}`);
  }

  for (const [id, part] of doc.parts) {
    for (const [i, conn] of part.conns.entries()) {
      const t = conn.target;
      if (t.kind === 'raw') continue;
      if (!doc.parts.has(t.part)) {
        out.push(`I2: part ${id} conn ${i} targets missing part ${t.part}`);
      } else if (t.part === id) {
        out.push(`I2: part ${id} conn ${i} targets its own part`);
      }
    }
  }

  for (const id of doc.layout.keys()) {
    const part = doc.parts.get(id);
    if (!part || !isRoot(part)) out.push(`I4: layout holds non-root part ${id}`);
  }
  return out;
}
