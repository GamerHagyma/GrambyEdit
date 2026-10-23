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

/** A short hint in the status bar, set by a tool while it applies (Place: root positions). */
export const statusHintSig = signal<string | null>(null);

/** An open right-click menu: where, and the commands it offers. */
export const contextMenuSig = signal<{
  readonly x: number;
  readonly y: number;
  readonly items: readonly { label: string; command: string; disabled?: boolean }[];
} | null>(null);
