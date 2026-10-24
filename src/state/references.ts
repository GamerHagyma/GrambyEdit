// Session-only visual references. This module never reads or writes blueprint state.
import { batch, computed, signal } from '@preact/signals';

export interface ReferenceImage {
  readonly id: number;
  readonly src: string;
  readonly name: string;
  readonly local: boolean;
}

export const referencesSig = signal<readonly ReferenceImage[]>([]);
export const activeReferenceIdSig = signal<number | null>(null);
export const activeReferenceSig = computed(
  () => referencesSig.value.find((image) => image.id === activeReferenceIdSig.value) ?? null,
);
export const referenceFloatingSig = signal(false);
export const referenceErrorSig = signal<string | null>(null);

let nextId = 1;

function addImage(src: string, name: string, local: boolean): void {
  const image = { id: nextId++, src, name, local };
  batch(() => {
    referencesSig.value = [...referencesSig.value, image];
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
  batch(() => {
    referencesSig.value = referencesSig.value.filter((image) => image.id !== id);
    if (activeReferenceIdSig.value === id)
      activeReferenceIdSig.value = referencesSig.value.at(-1)?.id ?? null;
    referenceErrorSig.value = null;
  });
}

export function clearReferences(): void {
  for (const image of referencesSig.value) if (image.local) URL.revokeObjectURL(image.src);
  batch(() => {
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
