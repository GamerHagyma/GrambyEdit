// Selection of parts and points, the selection mode, and hidden parts (spec §12.1).
import { signal } from '@preact/signals';
import { poseDescendants } from '../core/graph';
import type { Doc, PartId, PointKey, Uuid } from '../core/types';
import { docSig } from './store';

export interface Selection {
  readonly parts: ReadonlySet<PartId>;
  /** A selected part listed here is selected by that body only; unlisted parts are whole. */
  readonly pieces: ReadonlyMap<PartId, number>;
  readonly points: ReadonlySet<PointKey>;
  readonly active: PartId | PointKey | null;
}

type Op = 'replace' | 'add' | 'toggle' | 'remove';

const EMPTY: Selection = { parts: new Set(), pieces: new Map(), points: new Set(), active: null };

export const selectionSig = signal<Selection>(EMPTY);
/** `attached` expands every pick to the part plus everything posed off it. */
export const selectModeSig = signal<'part' | 'attached'>('part');
export const hiddenSig = signal<ReadonlySet<PartId>>(new Set());
/** The part under the pointer, for the hover outline and socket rings. */
export const hoverSig = signal<PartId | null>(null);
/** The body under the pointer on a multi-piece part, else null. */
export const hoverPieceSig = signal<number | null>(null);
/** The point marker under the pointer: its host keeps showing its points while the pointer is on it. */
export const hoverPointSig = signal<PointKey | null>(null);

export function pointKey(host: PartId, uuid: Uuid): PointKey {
  return `${host}:${uuid}`;
}

function applyOp<T>(current: ReadonlySet<T>, ids: readonly T[], op: Op): Set<T> {
  if (op === 'replace') return new Set(ids);
  const next = new Set(current);
  for (const id of ids) {
    if (op === 'add' || (op === 'toggle' && !next.has(id))) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** The last picked item that ended up selected; else the previous active one if it still is. */
function activeAfter<T extends PartId | PointKey>(
  picked: readonly T[],
  selected: ReadonlySet<T>,
  previous: Selection['active'],
): Selection['active'] {
  for (let i = picked.length - 1; i >= 0; i--) if (selected.has(picked[i])) return picked[i];
  return previous !== null && (selected as ReadonlySet<unknown>).has(previous) ? previous : null;
}

export function select(ids: Iterable<PartId>, op: Op): void {
  const picked = [...ids];
  let targets = picked;
  if (selectModeSig.value === 'attached') {
    const doc = docSig.value;
    const all = new Set(picked);
    for (const id of picked) for (const d of poseDescendants(doc, id)) all.add(d);
    targets = [...all];
  }
  const cur = selectionSig.value;
  const parts = applyOp(cur.parts, targets, op);
  // A whole pick drops its piece entry; a replace drops them all.
  const pieces = new Map(op === 'replace' ? [] : cur.pieces);
  for (const id of targets) pieces.delete(id);
  const points = op === 'replace' ? new Set<PointKey>() : cur.points;
  selectionSig.value = { parts, pieces, points, active: activeAfter(picked, parts, cur.active) };
}

/** Selects one body of a multi-piece part; in attached mode, the whole part plus its posed children. */
export function selectPiece(id: PartId, body: number, op: Op): void {
  if (selectModeSig.value === 'attached') {
    select([id], op);
    return;
  }
  const cur = selectionSig.value;
  const parts = new Set(op === 'replace' ? [] : cur.parts);
  const pieces = new Map(op === 'replace' ? [] : cur.pieces);
  const held = cur.parts.has(id);
  const same = cur.pieces.get(id) === body;
  if (op === 'replace' || (!held && op !== 'remove')) {
    parts.add(id);
    pieces.set(id, body);
  } else if (op === 'remove' || (op === 'toggle' && same)) {
    parts.delete(id);
    pieces.delete(id);
  } else if (!same) {
    // A whole part stays whole; a part picked by another body becomes whole.
    pieces.delete(id);
  }
  const points = op === 'replace' ? new Set<PointKey>() : cur.points;
  selectionSig.value = { parts, pieces, points, active: activeAfter([id], parts, cur.active) };
}

export function selectPoints(keys: Iterable<PointKey>, op: Op): void {
  const picked = [...keys];
  const cur = selectionSig.value;
  const points = applyOp(cur.points, picked, op);
  const parts = op === 'replace' ? new Set<PartId>() : cur.parts;
  const pieces = op === 'replace' ? new Map<PartId, number>() : cur.pieces;
  selectionSig.value = { parts, pieces, points, active: activeAfter(picked, points, cur.active) };
}

/** Drops parts, points and hidden ids the doc no longer has. Leaves the signals alone when nothing changed. */
const pointExists = (doc: Doc, key: PointKey): boolean => {
  const at = key.indexOf(':');
  return doc.parts.get(Number(key.slice(0, at)))?.points?.has(key.slice(at + 1)) ?? false;
};

export function sanitizeSelection(doc: Doc): void {
  const cur = selectionSig.value;
  const parts = [...cur.parts].filter((id) => doc.parts.has(id));
  const points = [...cur.points].filter((key) => pointExists(doc, key));
  const pieces = [...cur.pieces].filter(([id]) => doc.parts.has(id) && cur.parts.has(id));
  if (
    parts.length !== cur.parts.size ||
    points.length !== cur.points.size ||
    pieces.length !== cur.pieces.size
  ) {
    const p = new Set(parts);
    const q = new Set(points);
    const active =
      cur.active !== null && (p.has(cur.active as PartId) || q.has(cur.active as PointKey))
        ? cur.active
        : null;
    selectionSig.value = { parts: p, pieces: new Map(pieces), points: q, active };
  }
  if (hoverSig.value !== null && !doc.parts.has(hoverSig.value)) {
    hoverSig.value = null;
    hoverPieceSig.value = null;
  }
  if (hoverPointSig.value !== null && !pointExists(doc, hoverPointSig.value)) {
    hoverPointSig.value = null;
  }
  const hidden = hiddenSig.value;
  if ([...hidden].some((id) => !doc.parts.has(id))) {
    hiddenSig.value = new Set([...hidden].filter((id) => doc.parts.has(id)));
  }
}

export function clearSelection(): void {
  selectionSig.value = EMPTY;
}

export function resetSelectionForTests(): void {
  selectionSig.value = EMPTY;
  selectModeSig.value = 'part';
  hiddenSig.value = new Set();
  hoverSig.value = null;
  hoverPieceSig.value = null;
  hoverPointSig.value = null;
}
