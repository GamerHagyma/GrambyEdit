// Shared preview value: pose solving, Properties and export read this same unrounded angle.
import { signal } from '@preact/signals';
import type { Doc, PartId } from '../core/types';
import type { ServoDirection } from '../core/servo-simulation';
import { workspaceVersionSig } from './store';
export interface ServoPreview {
  readonly workspace: number;
  readonly doc: Doc;
  readonly id: PartId;
  readonly angle: number;
  readonly direction: ServoDirection;
}
export const servoPreviewSig = signal<ServoPreview | null>(null);

/** Editor-only preferences survive inspector remounts, scoped to this workspace's part IDs. */
const sustainSig = signal<{ workspace: number; ids: ReadonlySet<PartId> }>({
  workspace: -1,
  ids: new Set(),
});
export function servoSustainEnabled(id: PartId): boolean {
  const state = sustainSig.value;
  return state.workspace === workspaceVersionSig.value && state.ids.has(id);
}
export function setServoSustain(id: PartId, enabled: boolean): void {
  const workspace = workspaceVersionSig.peek(),
    state = sustainSig.peek();
  const ids = new Set(state.workspace === workspace ? state.ids : []);
  if (enabled) ids.add(id);
  else ids.delete(id);
  sustainSig.value = { workspace, ids };
}

export function withServoPreview(doc: Doc): Doc {
  const preview = servoPreviewSig.value;
  if (!preview || preview.doc !== doc || preview.workspace !== workspaceVersionSig.value)
    return doc;
  const part = doc.parts.get(preview.id);
  if (!part) return doc;
  const parts = new Map(doc.parts);
  parts.set(part.id, { ...part, props: { ...part.props, Rotation: preview.angle } });
  return { ...doc, parts };
}
