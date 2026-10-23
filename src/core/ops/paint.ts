// Paint (spec §9.2): sets RGB on paintable types only.
import type { Catalog } from '../catalog-types';
import type { PartId, RGB } from '../types';
import type { Draft } from './transact';

export function paint(
  d: Draft,
  cat: Catalog,
  ids: Iterable<PartId>,
  rgb: RGB,
): { applied: PartId[]; skipped: PartId[] } {
  const applied: PartId[] = [];
  const skipped: PartId[] = [];
  for (const id of ids) {
    const part = d.get(id)!;
    const def = Object.hasOwn(cat.parts, part.type) ? cat.parts[part.type] : undefined;
    if (def?.paintable !== true) {
      skipped.push(id);
      continue;
    }
    d.set({ ...part, props: { ...part.props, RGB: [...rgb] } });
    applied.push(id);
  }
  return { applied, skipped };
}
