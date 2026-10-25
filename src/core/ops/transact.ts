import type { CFrame12, Doc, Part, PartId } from '../types';

/** A copy-on-write view of a Doc that edit operations mutate inside `transact`. */
export interface Draft {
  readonly base: Doc;
  get(id: PartId): Part | undefined;
  /** Replaces an existing part (throws when missing). */
  set(part: Part): void;
  /** Adds a new part at the end of the order (throws when present). */
  add(part: Part): void;
  /** Removes a part from parts, order and layout (throws when missing). */
  delete(id: PartId): void;
  order(): readonly PartId[];
  /** Throws unless `order` is a permutation of the current parts. */
  setOrder(order: readonly PartId[]): void;
  layout(id: PartId): CFrame12 | undefined;
  /** `null` removes the entry. */
  setLayout(id: PartId, cf: CFrame12 | null): void;
  allocId(): PartId;
}

/** Before/after values of everything a transaction changed; applying it either way is exact. */
export interface Patch {
  readonly label: string;
  readonly parts: readonly (readonly [PartId, Part | undefined, Part | undefined])[];
  readonly order: readonly [readonly PartId[], readonly PartId[]] | null;
  readonly layout: readonly (readonly [PartId, CFrame12 | undefined, CFrame12 | undefined])[];
  readonly nextId: readonly [PartId, PartId];
}

const sameCf = (a: CFrame12 | undefined, b: CFrame12 | undefined) =>
  a === b || (a !== undefined && b !== undefined && a.every((v, i) => v === b[i]));

const sameIds = (a: readonly PartId[], b: readonly PartId[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Runs `fn` on a draft of `doc`. Untouched parts keep their identity. Returns `doc` itself and a
 * null patch when nothing changed. If `fn` throws, `doc` is untouched and the error propagates.
 */
export function transact(
  doc: Doc,
  label: string,
  fn: (d: Draft) => void,
  allocate?: () => PartId,
): { doc: Doc; patch: Patch | null } {
  let parts: Map<PartId, Part> | null = null;
  let order: PartId[] | null = null;
  let layout: Map<PartId, CFrame12> | null = null;
  let nextId = doc.nextId;
  const partsBefore = new Map<PartId, Part | undefined>();
  const layoutBefore = new Map<PartId, CFrame12 | undefined>();

  const readParts = (): ReadonlyMap<PartId, Part> => parts ?? doc.parts;
  const readLayout = (): ReadonlyMap<PartId, CFrame12> => layout ?? doc.layout;
  const writeParts = (id: PartId) => {
    if (!partsBefore.has(id)) partsBefore.set(id, doc.parts.get(id));
    return (parts ??= new Map(doc.parts));
  };
  const writeLayout = (id: PartId) => {
    if (!layoutBefore.has(id)) layoutBefore.set(id, doc.layout.get(id));
    return (layout ??= new Map(doc.layout));
  };
  const writeOrder = () => (order ??= [...doc.order]);

  fn({
    base: doc,
    get: (id) => readParts().get(id),
    set(part) {
      if (!readParts().has(part.id)) throw new Error(`set: part ${part.id} does not exist`);
      writeParts(part.id).set(part.id, part);
    },
    add(part) {
      if (readParts().has(part.id)) throw new Error(`add: part ${part.id} already exists`);
      writeParts(part.id).set(part.id, part);
      writeOrder().push(part.id);
      nextId = Math.max(nextId, part.id + 1);
    },
    delete(id) {
      if (!readParts().has(id)) throw new Error(`delete: part ${id} does not exist`);
      writeParts(id).delete(id);
      const o = writeOrder();
      o.splice(o.indexOf(id), 1);
      if (readLayout().has(id)) writeLayout(id).delete(id);
    },
    order: () => order ?? doc.order,
    setOrder(next) {
      const current = readParts();
      const valid =
        next.length === current.size &&
        new Set(next).size === next.length &&
        next.every((id) => current.has(id));
      if (!valid) throw new Error('setOrder: not a permutation of the current parts');
      order = [...next];
    },
    layout: (id) => readLayout().get(id),
    setLayout(id, cf) {
      if (cf !== null) writeLayout(id).set(id, cf);
      else if (readLayout().has(id)) writeLayout(id).delete(id);
    },
    allocId: () => {
      const id = allocate ? allocate() : nextId;
      nextId = Math.max(nextId, id + 1);
      return id;
    },
  });

  const partChanges: [PartId, Part | undefined, Part | undefined][] = [];
  for (const [id, before] of partsBefore) {
    const after = readParts().get(id);
    if (after !== before) partChanges.push([id, before, after]);
  }
  const layoutChanges: [PartId, CFrame12 | undefined, CFrame12 | undefined][] = [];
  for (const [id, before] of layoutBefore) {
    const after = readLayout().get(id);
    if (!sameCf(before, after)) layoutChanges.push([id, before, after]);
  }
  const orderChange = order && !sameIds(doc.order, order) ? ([doc.order, order] as const) : null;
  if (!partChanges.length && !layoutChanges.length && !orderChange && nextId === doc.nextId) {
    return { doc, patch: null };
  }
  return {
    doc: {
      parts: partChanges.length ? readParts() : doc.parts,
      order: orderChange ? orderChange[1] : doc.order,
      layout: layoutChanges.length ? readLayout() : doc.layout,
      nextId,
    },
    patch: {
      label,
      parts: partChanges,
      order: orderChange,
      layout: layoutChanges,
      nextId: [doc.nextId, nextId],
    },
  };
}

/** Re-applies (`redo`) or reverts (`undo`) a patch on the doc it was recorded against. */
export function applyPatch(doc: Doc, patch: Patch, dir: 'redo' | 'undo'): Doc {
  const side = dir === 'redo' ? 2 : 1;
  let parts = doc.parts;
  if (patch.parts.length) {
    const m = new Map(doc.parts);
    for (const e of patch.parts) {
      const v = e[side];
      if (v === undefined) m.delete(e[0]);
      else m.set(e[0], v);
    }
    parts = m;
  }
  let layout = doc.layout;
  if (patch.layout.length) {
    const m = new Map(doc.layout);
    for (const e of patch.layout) {
      const v = e[side];
      if (v === undefined) m.delete(e[0]);
      else m.set(e[0], v);
    }
    layout = m;
  }
  return {
    parts,
    order: patch.order ? patch.order[side - 1] : doc.order,
    layout,
    nextId: patch.nextId[side - 1],
  };
}
