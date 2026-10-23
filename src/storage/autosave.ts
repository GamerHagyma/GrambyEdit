// Crash recovery (spec §14): the current work, one record under the `autosave` store key `current`.
import { idbDelete, idbGet, idbPut } from './idb';
import type { EditorMeta } from './library';

export interface AutosaveRecord {
  readonly code: string;
  readonly editorMeta: EditorMeta;
  readonly savedAt: number;
  readonly creationId: string | null;
}

const KEY = 'current';

/** Rejects with a StorageError when the browser cannot store it. */
export function writeAutosave(a: AutosaveRecord): Promise<void> {
  return idbPut('autosave', a, KEY);
}

export function readAutosave(): Promise<AutosaveRecord | undefined> {
  return idbGet<AutosaveRecord>('autosave', KEY);
}

export function clearAutosave(): Promise<void> {
  return idbDelete('autosave', KEY);
}
