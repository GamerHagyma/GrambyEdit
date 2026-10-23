// The creation library in the editor (spec §14): save and open builds with their root layout and
// camera, save a selection as a prefab, and autosave the work 2 s after each change.
import { effect, signal } from '@preact/signals';
import type { Vec3 } from '../core/catalog-types';
import { orderIndex } from '../core/doc';
import { extractSubDoc } from '../core/ops/clipboard';
import { parseShareText, toShareCode } from '../core/share';
import type { CFrame12, Doc, PartId } from '../core/types';
import { writeAutosave } from '../storage/autosave';
import {
  getCreation,
  listCreations,
  saveCreation,
  type CreationRecord,
  type EditorMeta,
} from '../storage/library';
import { getViewport } from '../viewport/context';
import { posesSig } from './derived';
import { selectionSig } from './selection';
import { docSig, loadDoc, viewBus } from './store';
import { toast } from './toasts';

export const creationsSig = signal<readonly CreationRecord[]>([]);
/** The creation the open build was opened from or last saved as, for Save and autosave. */
export const openCreationIdSig = signal<string | null>(null);
/** The browser's answer to `navigator.storage.persist()`, asked once per session on the first save. */
export const persistentSig = signal<boolean | null>(null);

export async function refreshCreations(): Promise<void> {
  creationsSig.value = await listCreations();
}

/** The roots' layouts, keyed by 0-based entry index (share codes do not store them). */
export function editorMetaOf(doc: Doc): EditorMeta {
  const index = orderIndex(doc);
  const rootLayout: Record<number, CFrame12> = {};
  for (const [id, cf] of doc.layout) {
    const at = index.get(id);
    if (at !== undefined) rootLayout[at] = cf;
  }
  return { rootLayout };
}

/** The viewport camera, when one is mounted. */
function cameraMeta(): EditorMeta['camera'] {
  const rig = getViewport()?.rig;
  if (!rig) return undefined;
  const v = (x: { x: number; y: number; z: number }): Vec3 => [x.x, x.y, x.z];
  return { position: v(rig.camera.position), target: v(rig.target) };
}

async function askPersistence(): Promise<void> {
  if (persistentSig.value !== null) return;
  try {
    persistentSig.value = (await navigator.storage?.persist?.()) ?? false;
  } catch {
    persistentSig.value = false;
  }
}

/** Tags and notes a save may carry (spec §14). */
export interface SaveExtra {
  readonly tags?: string[];
  readonly notes?: string;
}

/** Saves the open build (over `id` when given) with a thumbnail of the view. */
export async function saveCurrent(
  name: string,
  id?: string,
  extra: SaveExtra = {},
): Promise<CreationRecord> {
  const doc = docSig.value;
  const thumb = (await getViewport()?.snapshot()) ?? null;
  const record = await saveCreation({
    id,
    name,
    code: toShareCode(doc),
    partCount: doc.order.length,
    thumb,
    editorMeta: { ...editorMetaOf(doc), camera: cameraMeta() },
    ...extra,
  });
  openCreationIdSig.value = record.id;
  await askPersistence();
  await refreshCreations();
  return record;
}

/** Saves the selected parts as a new creation (a prefab). */
export async function saveSelectionAsCreation(
  name: string,
  extra: SaveExtra = {},
): Promise<CreationRecord> {
  const doc = docSig.value;
  const ids = doc.order.filter((id) => selectionSig.value.parts.has(id));
  if (ids.length === 0) throw new Error('Select the parts to save first.');
  const sub = extractSubDoc(doc, posesSig.value, ids);
  const record = await saveCreation({
    name,
    code: toShareCode(sub),
    partCount: sub.order.length,
    thumb: null,
    editorMeta: editorMetaOf(sub),
    ...extra,
  });
  await askPersistence();
  await refreshCreations();
  return record;
}

/** A creation's build with its root layout restored. */
export function creationDoc(record: CreationRecord): Doc {
  const r = parseShareText(record.code);
  if (!r.ok) throw new Error(`"${record.name}" cannot be opened: ${r.message}`);
  const layout = new Map(r.doc.layout);
  for (const [at, cf] of Object.entries(record.editorMeta.rootLayout)) {
    const id: PartId | undefined = r.doc.order[Number(at)];
    if (id !== undefined) layout.set(id, cf);
  }
  return { ...r.doc, layout };
}

/** Opens a creation in place of the current build, with its layout and camera. */
export async function openCreation(id: string): Promise<void> {
  const record = await getCreation(id);
  if (!record) throw new Error('That creation is no longer in the library.');
  loadDoc(creationDoc(record));
  openCreationIdSig.value = record.id;
  const camera = record.editorMeta.camera;
  viewBus.emit(camera ? { kind: 'look', ...camera } : { kind: 'frame-all' });
}

/** Writes the build to the autosave slot 2 s after the last change; returns the stopper. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let first = true;
  const stopEffect = effect(() => {
    const doc = docSig.value;
    if (first) {
      first = false;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      writeAutosave({
        code: toShareCode(doc),
        editorMeta: editorMetaOf(doc),
        savedAt: Date.now(),
        creationId: openCreationIdSig.peek(),
      }).catch((e: unknown) => toast(`Autosave failed: ${(e as Error).message}`, 'error'));
    }, 2_000);
  });
  return () => {
    clearTimeout(timer);
    stopEffect();
  };
}
