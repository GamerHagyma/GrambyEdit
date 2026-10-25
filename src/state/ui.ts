import { signal } from '@preact/signals';
import { loadPref, savePref } from '../storage/prefs';

export type DialogName =
  | 'collaboration'
  | 'new'
  | 'import'
  | 'export'
  | 'library'
  | 'save'
  | 'save-selection'
  | 'settings'
  | 'about'
  | 'shortcuts'
  | 'palette';

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

/** The left dock's tab outside the Sockets and Paint tools (pref `leftTab`): Parts or Generators. */
export const leftTabSig = signal<string>(loadPref<string>('leftTab', 'parts'));

export function showLeftTab(id: string): void {
  leftTabSig.value = id;
  savePref('leftTab', id);
}

/** The inspector tab on show (pref `rightTab`); Shell checks it against its tabs. */
export const inspectorTabSig = signal<string>(loadPref<string>('rightTab', 'properties'));

export function showInspectorTab(id: string): void {
  inspectorTabSig.value = id;
  savePref('rightTab', id);
}
