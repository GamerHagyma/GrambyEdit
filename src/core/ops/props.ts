// Prop edits (spec §9.2). `UNSET` removes a key.
import type { Catalog } from '../catalog-types';
import type { Json, Part, PartId } from '../types';
import type { Draft } from './transact';

export const UNSET: unique symbol = Symbol('UNSET');

/** A key applies when the type's catalog props list it, or the part already holds it. */
export function propApplies(cat: Catalog, part: Part, key: string): boolean {
  const def = Object.hasOwn(cat.parts, part.type) ? cat.parts[part.type] : undefined;
  return def?.props.includes(key) === true || Object.hasOwn(part.props, key);
}

/** Sets `key` on every part it applies to; `UNSET` deletes it. The rest are skipped. */
export function setProp(
  d: Draft,
  cat: Catalog,
  ids: Iterable<PartId>,
  key: string,
  value: Json | typeof UNSET,
): { applied: PartId[]; skipped: PartId[] } {
  if (key === 'EphemeralAttachments') throw new Error('use point ops for EphemeralAttachments');
  const applied: PartId[] = [];
  const skipped: PartId[] = [];
  for (const id of ids) {
    const part = d.get(id)!;
    if (!propApplies(cat, part, key)) {
      skipped.push(id);
      continue;
    }
    const props = { ...part.props };
    if (value === UNSET) delete props[key];
    else props[key] = value;
    d.set({ ...part, props });
    applied.push(id);
  }
  return { applied, skipped };
}
