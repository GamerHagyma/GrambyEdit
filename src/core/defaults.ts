// Smart defaults for new joints and new parts (spec §12.2 step 3, §12.5 auto-color).
import { pairKey, type Catalog, type PartDef, type SocketRole } from './catalog-types';
import type { Json, RGB, SocketId } from './types';

const defOf = (cat: Catalog, type: string): PartDef | undefined =>
  Object.hasOwn(cat.parts, type) ? cat.parts[type] : undefined;

/** The child roles that complete a parent socket's role. */
const COMPLEMENT: Partial<Record<NonNullable<SocketRole>, readonly SocketRole[]>> = {
  output: ['input', 'conductor'],
  input: ['output', 'conductor'],
  conductor: ['input', 'output', 'conductor'],
  socket: ['mount'],
  mount: ['socket'],
};

/** True when a child socket of role `child` completes a parent socket of role `parent`. */
export function complements(parent: SocketRole, child: SocketRole): boolean {
  return parent !== null && (COMPLEMENT[parent] ?? []).includes(child);
}

/**
 * The child socket a new `childType` attaches by onto `parentType`'s `parentSocket`: the most
 * frequent corpus pair (ties in catalog order), else the first role complement, else the default
 * mount, else the first child socket; null when the type has none or is unknown.
 */
export function defaultChildSocket(
  cat: Catalog,
  childType: string,
  parentType: string,
  parentSocket: SocketId,
): SocketId | null {
  const child = defOf(cat, childType);
  if (!child) return null;
  let best: SocketId | null = null;
  let bestCount = 0;
  for (const cs of child.childSockets) {
    const n = cat.pairs[pairKey(childType, cs, parentType, parentSocket)] ?? 0;
    if (n > bestCount) [best, bestCount] = [cs, n];
  }
  if (best !== null) return best;
  const role = defOf(cat, parentType)?.sockets[parentSocket]?.role ?? null;
  const complement = child.childSockets.find((cs) => complements(role, child.sockets[cs].role));
  return complement ?? child.defaultMount ?? child.childSockets[0] ?? null;
}

/** Can attach to a socket: the type has at least one child socket. */
export function eligibleForSocket(cat: Catalog, type: string): boolean {
  return (defOf(cat, type)?.childSockets.length ?? 0) > 0;
}

/** Can mount on a point: the type has a default mount socket. */
export function eligibleForPoint(cat: Catalog, type: string): boolean {
  return (defOf(cat, type)?.defaultMount ?? null) !== null;
}

/** Props for a newly placed part: the active color when auto-color is on and the type is paintable. */
export function newPartProps(
  cat: Catalog,
  type: string,
  s: { autoColor: boolean; activeColor: RGB },
): Record<string, Json> {
  return s.autoColor && defOf(cat, type)?.paintable === true ? { RGB: [...s.activeColor] } : {};
}
