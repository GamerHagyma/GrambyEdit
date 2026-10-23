// Library bundles (spec §14). Export leaves out thumbnails; import treats the file as untrusted.
import type { Vec3 } from '../core/catalog-types';
import type { CFrame12 } from '../core/types';
import {
  listCreations,
  saveCreation,
  sha256Hex,
  type CreationRecord,
  type EditorMeta,
} from './library';

const NOT_LIBRARY = 'Not a GrambyEdit library file.';

export function exportBundle(records: readonly CreationRecord[]): string {
  const creations = records.map(({ thumb: _thumb, ...record }) => record);
  return JSON.stringify({
    format: 'grambyedit-library',
    version: 1,
    exportedAt: Date.now(),
    creations,
  });
}

/**
 * Merges a bundle into the library. A record is skipped when its code (hashed here, never the
 * file's hash) is already saved or the record is malformed. A name in use becomes `Name (2)`,
 * `Name (3)`, and so on.
 */
export async function importBundle(
  json: string,
): Promise<{ added: number; skipped: number; renamed: number }> {
  const items = parseBundle(json);
  const existing = await listCreations();
  const hashes = new Set(existing.map((r) => r.hash));
  const names = new Set(existing.map((r) => r.name));
  const result = { added: 0, skipped: 0, renamed: 0 };
  for (const item of items) {
    const entry = parseCreation(item);
    if (entry === undefined) {
      result.skipped++;
      continue;
    }
    const hash = await sha256Hex(entry.code);
    if (hashes.has(hash)) {
      result.skipped++;
      continue;
    }
    const name = uniqueName(entry.name, names);
    if (name !== entry.name) result.renamed++;
    await saveCreation({ ...entry, name, thumb: null });
    hashes.add(hash);
    names.add(name);
    result.added++;
  }
  return result;
}

/** The `creations` array of a library bundle. Any other content is not a library file. */
function parseBundle(json: string): unknown[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(NOT_LIBRARY);
  }
  if (
    !isRecord(data) ||
    data.format !== 'grambyedit-library' ||
    data.version !== 1 ||
    !Array.isArray(data.creations)
  ) {
    throw new Error(NOT_LIBRARY);
  }
  return data.creations;
}

interface ImportedCreation {
  readonly name: string;
  readonly code: string;
  readonly partCount: number;
  readonly tags: string[];
  readonly notes: string;
  readonly editorMeta: EditorMeta;
}

/** The fields kept from one record of the file, or undefined when any of them is malformed. */
function parseCreation(raw: unknown): ImportedCreation | undefined {
  if (!isRecord(raw)) return undefined;
  const tags = raw.tags === undefined ? [] : raw.tags;
  const notes = raw.notes === undefined ? '' : raw.notes;
  const editorMeta = parseEditorMeta(raw.editorMeta);
  if (
    typeof raw.name !== 'string' ||
    typeof raw.code !== 'string' ||
    !isCount(raw.partCount) ||
    raw.schemaVersion !== 1 ||
    !isStrings(tags) ||
    typeof notes !== 'string' ||
    editorMeta === undefined
  ) {
    return undefined;
  }
  return { name: raw.name, code: raw.code, partCount: raw.partCount, tags, notes, editorMeta };
}

/** The layout and optional camera of a record; undefined when either is malformed. */
function parseEditorMeta(raw: unknown): EditorMeta | undefined {
  if (!isRecord(raw) || !isLayout(raw.rootLayout)) return undefined;
  if (raw.camera === undefined) return { rootLayout: raw.rootLayout };
  const camera = raw.camera;
  if (!isRecord(camera) || !isVec3(camera.position) || !isVec3(camera.target)) return undefined;
  return {
    rootLayout: raw.rootLayout,
    camera: { position: camera.position, target: camera.target },
  };
}

/** The name itself, or the first of `name (2)`, `name (3)`, and so on, that is not taken. */
function uniqueName(name: string, taken: ReadonlySet<string>): string {
  let candidate = name;
  for (let n = 2; taken.has(candidate); n++) candidate = `${name} (${n})`;
  return candidate;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isCount(v: unknown): v is number {
  return isNumber(v) && Number.isInteger(v) && v >= 0;
}

function isStrings(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

function isNumbers(v: unknown, length: number): boolean {
  return Array.isArray(v) && v.length === length && v.every(isNumber);
}

function isCFrame(v: unknown): v is CFrame12 {
  return isNumbers(v, 12);
}

function isVec3(v: unknown): v is Vec3 {
  return isNumbers(v, 3);
}

/** Entry indices (integer keys) mapped to CFrame12 values. */
function isLayout(v: unknown): v is Readonly<Record<number, CFrame12>> {
  return (
    isRecord(v) && Object.entries(v).every(([key, frame]) => /^\d+$/.test(key) && isCFrame(frame))
  );
}
