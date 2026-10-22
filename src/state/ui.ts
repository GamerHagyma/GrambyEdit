import { signal } from '@preact/signals';

export type DialogName =
  'import' | 'export' | 'library' | 'save' | 'settings' | 'about' | 'shortcuts' | 'palette';

/** The one open dialog, if any. Every dialog opens through `openDialog`. */
export const dialogSig = signal<DialogName | null>(null);

export function openDialog(name: DialogName): void {
  dialogSig.value = name;
}

export function closeDialog(): void {
  dialogSig.value = null;
}
