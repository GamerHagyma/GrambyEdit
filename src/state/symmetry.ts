// Per-browser guide and preview. Only the resulting ordinary placement transaction is shared.
import { computed, effect, signal } from '@preact/signals';
import { Matrix4 } from 'three';
import { poseDescendants } from '../core/graph';
import { draftDoc } from '../core/ops/conns';
import { symmetryCopies } from '../core/ops/symmetry';
import { transact, type Draft } from '../core/ops/transact';
import { computePoses } from '../core/pose';
import {
  copyFrame,
  mirroredType,
  symmetryFrame,
  symmetryTransforms,
  type SymmetryAxis,
  type SymmetryMode,
} from '../core/symmetry';
import type { Doc, PartId } from '../core/types';
import { committedPosesSig } from './derived';
import { selectionSig, select } from './selection';
import { canEditWorkspace, catalogSig, commit, docSig, workspaceVersionSig } from './store';
import { toast } from './toasts';
import { inspectorTabSig } from './ui';
export interface SymmetrySettings {
  anchor: PartId | null;
  mode: SymmetryMode;
  axis: SymmetryAxis;
  offset: number;
  rotation: [number, number, number];
  count: number;
  size: number;
  auto: boolean;
  guide: boolean;
  preview: boolean;
  children: boolean;
  skipCentered: boolean;
}
const initial = (): SymmetrySettings => ({
  anchor: null,
  mode: 'plane',
  axis: 'x',
  offset: 0,
  rotation: [0, 0, 0],
  count: 4,
  size: 10,
  auto: false,
  guide: true,
  preview: true,
  children: true,
  skipCentered: true,
});
export const symmetrySig = signal<SymmetrySettings>(initial());
export const symmetryFrameSig = computed(() => {
  const s = symmetrySig.value,
    anchor = s.anchor === null ? null : committedPosesSig.value.world.get(s.anchor);
  return anchor ? symmetryFrame(anchor, s.axis, s.offset, s.rotation) : null;
});
export function chooseSymmetryAnchor(): void {
  const selection = selectionSig.peek(),
    id = typeof selection.active === 'number' ? selection.active : null;
  const p = id === null ? null : docSig.peek().parts.get(id);
  if (!p || !['Part', 'Connector'].includes(p.type) || selection.parts.size !== 1) {
    toast('Select one Part or Connector to anchor the mirror.', 'warn');
    return;
  }
  symmetrySig.value = { ...symmetrySig.peek(), anchor: id, offset: 0, rotation: [0, 0, 0] };
}
export function clearSymmetry(): void {
  symmetrySig.value = initial();
}
export function startSymmetryLifecycle(): () => void {
  let workspace = workspaceVersionSig.peek();
  return effect(() => {
    const current = workspaceVersionSig.value,
      doc = docSig.value,
      s = symmetrySig.value;
    if (
      current !== workspace ||
      (s.anchor !== null && !['Part', 'Connector'].includes(doc.parts.get(s.anchor)?.type ?? ''))
    )
      clearSymmetry();
    workspace = current;
  });
}
export function symmetrySelection(): PartId[] {
  const s = symmetrySig.value,
    doc = docSig.value,
    chosen = new Set([...selectionSig.value.parts].filter((id) => id !== s.anchor));
  if (s.children)
    for (const id of [...chosen])
      for (const child of poseDescendants(doc, id)) if (child !== s.anchor) chosen.add(child);
  return doc.order.filter((id) => chosen.has(id));
}
function transforms(): Matrix4[] {
  const s = symmetrySig.value,
    frame = symmetryFrameSig.value;
  return frame ? symmetryTransforms(frame, s.mode, s.axis, s.count) : [];
}
export function addPlacementSymmetry(d: Draft, ids: readonly PartId[]): PartId[] {
  const s = symmetrySig.peek(),
    cat = catalogSig.peek();
  if (!s.auto || s.anchor === null || !cat || !d.get(s.anchor)) return [];
  const doc = draftDoc(d),
    poses = computePoses(doc, cat, cat.conventions);
  const frame = symmetryFrame(poses.world.get(s.anchor)!, s.axis, s.offset, s.rotation);
  return symmetryCopies(
    d,
    cat,
    poses,
    ids,
    s.anchor,
    symmetryTransforms(frame, s.mode, s.axis, s.count),
    s.skipCentered,
  );
}
export function applySymmetry(): void {
  if (!canEditWorkspace()) return;
  const s = symmetrySig.peek(),
    cat = catalogSig.peek(),
    ids = symmetrySelection();
  if (s.anchor === null || !cat || !ids.length) return;
  let made: PartId[] = [];
  try {
    commit(s.mode === 'plane' ? 'Mirror selection' : 'Radial copies', (d) => {
      made = symmetryCopies(
        d,
        cat,
        committedPosesSig.value,
        ids,
        s.anchor!,
        transforms(),
        s.skipCentered,
      );
    });
  } catch (e) {
    toast((e as Error).message, 'warn');
    return;
  }
  if (made.length) {
    select(made, 'replace');
    toast(`Created ${made.length} symmetry ${made.length === 1 ? 'copy' : 'copies'}.`);
  } else toast('No copies needed: parts are centered or already present.');
}
export const symmetryPreviewSig = computed(() => {
  const s = symmetrySig.value,
    cat = catalogSig.value,
    doc = docSig.value;
  if (inspectorTabSig.value !== 'mirror' || !s.preview || s.anchor === null || !cat) return null;
  const ids = symmetrySelection();
  if (!ids.length) return null;
  if (ids.length * (s.mode === 'plane' ? 1 : s.count - 1) > 500)
    return { error: 'Preview hidden above 500 copies. Apply is still available.', shown: null };
  try {
    let made: PartId[] = [];
    const result = transact(doc, 'Mirror preview', (d) => {
      made = symmetryCopies(
        d,
        cat,
        committedPosesSig.value,
        ids,
        s.anchor!,
        transforms(),
        s.skipCentered,
      );
    }).doc;
    const poses = computePoses(result, cat, cat.conventions);
    const preview: Doc = {
      ...result,
      parts: new Map(made.map((id) => [id, result.parts.get(id)!])),
      order: made,
    };
    return { error: '', shown: { doc: preview, poses }, count: made.length };
  } catch (e) {
    return { error: (e as Error).message, shown: null };
  }
});
/** Cheap extra ghost instances while placing; never commit or consume actual IDs. */
export function placementSymmetryGhosts(
  sub: Doc,
  worlds: ReadonlyMap<PartId, Matrix4>,
): { type: string; world: Matrix4 }[] {
  const s = symmetrySig.value;
  if (!s.auto || s.anchor === null) return [];
  return transforms().flatMap((t) =>
    sub.order.flatMap((id) => {
      const w = worlds.get(id),
        p = sub.parts.get(id)!;
      if (!w) return [];
      if (
        s.skipCentered &&
        w.elements
          .slice(12, 15)
          .every(
            (_, i) =>
              Math.abs(copyFrame(t, w, p.type).elements[12 + i] - w.elements[12 + i]) < 1e-5,
          )
      )
        return [];
      return [
        {
          type: t.determinant() < 0 ? mirroredType(p.type) : p.type,
          world: copyFrame(t, w, p.type),
        },
      ];
    }),
  );
}
