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
