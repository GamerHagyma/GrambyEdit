// Session-only visual references. This module never reads or writes blueprint state.
import { batch, computed, signal } from '@preact/signals';

export interface ReferenceImage {
  readonly id: number;
  readonly src: string;
  readonly name: string;
  readonly local: boolean;
}

export interface ReferenceView {
  scale: number;
  x: number;
  y: number;
}

export const referenceViews = new Map<number, ReferenceView>();
export const referenceControlsCollapsedSig = signal(false);
export const referencesSig = signal<readonly ReferenceImage[]>([]);
export const activeReferenceIdSig = signal<number | null>(null);
export const activeReferenceSig = computed(
  () => referencesSig.value.find((image) => image.id === activeReferenceIdSig.value) ?? null,
);
export const referenceFloatingSig = signal(false);
export const referenceErrorSig = signal<string | null>(null);

export type ReferenceVector = readonly [number, number, number];
export interface ReferencePlane {
  readonly position: ReferenceVector;
  /** Euler XYZ angles in degrees. */
  readonly rotation: ReferenceVector;
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
  readonly visible: boolean;
}
export const referenceAspects = new Map<number, number>();
export const referencePlanesSig = signal<ReadonlyMap<number, ReferencePlane>>(new Map());
export const editingReferencePlaneSig = signal<number | null>(null);
export const referencePlaneModeSig = signal<'translate' | 'rotate' | 'scale' | null>('translate');

/** Bound a resize without distorting its starting proportions while Ctrl is held. */
export function referencePlaneSize(
  start: Pick<ReferencePlane, 'width' | 'height'>,
  width: number,
  height: number,
  uniform: boolean,
): Pick<ReferencePlane, 'width' | 'height'> {
  if (![width, height].every(Number.isFinite)) return start;
  width = Math.abs(width);
  height = Math.abs(height);
  if (uniform) {
    const x = width / start.width,
      y = height / start.height;
    const factor = Math.max(
      0.01 / start.width,
      0.01 / start.height,
      Math.min(1e5 / start.width, 1e5 / start.height, Math.abs(x - 1) >= Math.abs(y - 1) ? x : y),
    );
    return { width: start.width * factor, height: start.height * factor };
  }
  return {
    width: Math.max(0.01, Math.min(1e5, width)),
    height: Math.max(0.01, Math.min(1e5, height)),
  };
}

export function insertReferencePlane(
  id: number,
  position: ReferenceVector = [0, 0, 0],
  rotation: ReferenceVector = [0, 0, 0],
): void {
  if (!referencesSig.peek().some((image) => image.id === id)) return;
  if (!referencePlanesSig.peek().has(id)) {
    const planes = new Map(referencePlanesSig.peek());
    planes.set(id, {
      position,
      rotation,
      width: 10,
      height: 10 / (referenceAspects.get(id) ?? 1),
      opacity: 0.65,
      visible: true,
    });
    referencePlanesSig.value = planes;
  }
  editingReferencePlaneSig.value = id;
}

export function updateReferencePlane(id: number, patch: Partial<ReferencePlane>): void {
  const old = referencePlanesSig.peek().get(id);
  if (!old) return;
  const p = { ...old, ...patch };
  if (
    ![p.position, p.rotation].every(
      (v) => v.length === 3 && v.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e6),
    ) ||
    ![p.width, p.height].every((n) => Number.isFinite(n) && n >= 0.01 && n <= 1e5) ||
    !Number.isFinite(p.opacity) ||
    p.opacity < 0 ||
    p.opacity > 1 ||
    typeof p.visible !== 'boolean'
  )
    return;
  const planes = new Map(referencePlanesSig.peek());
  planes.set(id, p);
  referencePlanesSig.value = planes;
}

export function removeReferencePlane(id: number): void {
  const planes = new Map(referencePlanesSig.peek());
  planes.delete(id);
  batch(() => {
    referencePlanesSig.value = planes;
    if (editingReferencePlaneSig.peek() === id) editingReferencePlaneSig.value = null;
  });
}

let nextId = 1;

function addImage(src: string, name: string, local: boolean): void {
  const image = { id: nextId++, src, name, local };
  batch(() => {
    referencesSig.value = [...referencesSig.value, image];
    editingReferencePlaneSig.value = null;
    activeReferenceIdSig.value = image.id;
    referenceErrorSig.value = null;
  });
}

export function addReferenceUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      throw new Error();
    addImage(url.href, url.pathname.split('/').pop() || url.hostname, false);
    return true;
  } catch {
    referenceErrorSig.value = 'Enter a direct http:// or https:// image URL.';
    return false;
  }
}

export function addReferenceFile(file: File): boolean {
  if (!file.type.startsWith('image/')) {
    referenceErrorSig.value = 'Choose an image file or paste an image.';
    return false;
  }
  try {
    addImage(URL.createObjectURL(file), file.name || 'Pasted image', true);
    return true;
  } catch {
    referenceErrorSig.value = 'Could not open this image. Try choosing the file again.';
    return false;
  }
}

export function removeReference(id: number): void {
  const removed = referencesSig.value.find((image) => image.id === id);
  if (!removed) return;
  if (removed.local) URL.revokeObjectURL(removed.src);
  removeReferencePlane(id);
  referenceAspects.delete(id);
  referenceViews.delete(id);
  batch(() => {
    referencesSig.value = referencesSig.value.filter((image) => image.id !== id);
    if (activeReferenceIdSig.value === id)
      activeReferenceIdSig.value = referencesSig.value.at(-1)?.id ?? null;
    referenceErrorSig.value = null;
  });
}

export function clearReferences(): void {
  for (const image of referencesSig.value) if (image.local) URL.revokeObjectURL(image.src);
  referenceViews.clear();
  referenceAspects.clear();
  batch(() => {
    referencePlanesSig.value = new Map();
    editingReferencePlaneSig.value = null;
    referenceControlsCollapsedSig.value = false;
    referencesSig.value = [];
    activeReferenceIdSig.value = null;
    referenceFloatingSig.value = false;
    referenceErrorSig.value = null;
  });
}

/** Clipboard images win over the HTML/text that often accompanies them. */
export function pasteReference(data: {
  readonly files: Iterable<File>;
  getData(type: string): string;
}): boolean {
  const files = [...data.files].filter((file) => file.type.startsWith('image/'));
  if (files.length === 0) return addReferenceUrl(data.getData('text/plain'));
  let added = false;
  for (const file of files) added = addReferenceFile(file) || added;
  return added;
}
