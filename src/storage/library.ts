// The creation library (spec §14): saved share codes in the `creations` store, keyed by id.
import type { Vec3 } from '../core/catalog-types';
import type { CFrame12 } from '../core/types';
import { idbAll, idbDelete, idbGet, idbPut } from './idb';

export interface EditorMeta {
  readonly rootLayout: Readonly<Record<number, CFrame12>>;
  readonly camera?: { readonly position: Vec3; readonly target: Vec3 };
}

export interface CreationRecord {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly hash: string;
  readonly partCount: number;
  readonly codeLength: number;
  readonly thumb: Blob | null;
  readonly tags: readonly string[];
  readonly notes: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly editorMeta: EditorMeta;
  readonly schemaVersion: 1;
}

/** Lower-case hex SHA-256 of the text; the library's duplicate check compares these. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Strictly increasing, so updatedAt orders records even when two writes share a millisecond.
let lastStamp = 0;
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

/**
 * Creates a creation, or overwrites the one with `input.id`. An update keeps its createdAt, and
 * its tags and notes when the input omits them.
 */
export async function saveCreation(input: {
  id?: string;
  name: string;
  code: string;
  partCount: number;
  thumb: Blob | null;
  editorMeta: EditorMeta;
  tags?: string[];
  notes?: string;
}): Promise<CreationRecord> {
  const previous = input.id === undefined ? undefined : await getCreation(input.id);
  const now = stamp();
  const record: CreationRecord = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    code: input.code,
    hash: await sha256Hex(input.code),
    partCount: input.partCount,
    codeLength: input.code.length,
    thumb: input.thumb,
    tags: input.tags ?? previous?.tags ?? [],
    notes: input.notes ?? previous?.notes ?? '',
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    editorMeta: input.editorMeta,
    schemaVersion: 1,
  };
  await idbPut('creations', record);
  return record;
}

/** Newest first. */
export async function listCreations(): Promise<CreationRecord[]> {
  const all = await idbAll<CreationRecord>('creations');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getCreation(id: string): Promise<CreationRecord | undefined> {
  return idbGet<CreationRecord>('creations', id);
}

async function requireCreation(id: string): Promise<CreationRecord> {
  const record = await getCreation(id);
  if (record === undefined) throw new Error('Creation not found.');
  return record;
}

export async function renameCreation(id: string, name: string): Promise<void> {
  const record = await requireCreation(id);
  await idbPut('creations', { ...record, name, updatedAt: stamp() });
}

/** A copy named `<name> (copy)` with the same code, thumbnail, layout, tags and notes. */
export async function duplicateCreation(id: string): Promise<CreationRecord> {
  const source = await requireCreation(id);
  return saveCreation({
    name: `${source.name} (copy)`,
    code: source.code,
    partCount: source.partCount,
    thumb: source.thumb,
    editorMeta: source.editorMeta,
    tags: [...source.tags],
    notes: source.notes,
  });
}

/** Deleting an id that is not saved does nothing. */
export function deleteCreation(id: string): Promise<void> {
  return idbDelete('creations', id);
}
