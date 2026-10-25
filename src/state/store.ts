// The document store: the doc, its undo history and the catalog (spec §4). Every edit goes through commit().
import { batch, computed, signal, type ReadonlySignal } from '@preact/signals';
import type { Assets } from '../assets/geometry';
import type { Catalog } from '../core/catalog-types';
import { transact, type Draft, type Patch } from '../core/ops/transact';
import {
  applySocketGeometry,
  emptySocketGeometry,
  type SocketGeometryFile,
} from '../core/socket-geometry';
import { EMPTY_DOC, type Doc } from '../core/types';
import { emptyHistory, record, redoStep, undoStep, type History } from './history';
import { clearSelection, resetSelectionForTests, sanitizeSelection } from './selection';

export const docSig = signal<Doc>(EMPTY_DOC);
/** Changes on workspace replacement, so pending library operations cannot revive an old workspace. */
export const workspaceVersionSig = signal(0);
export const historySig = signal<History>(emptyHistory());
export const historyAvailabilitySig = signal<{ undo: boolean; redo: boolean } | null>(null);
/** The optional room boundary. Solo editing has no adapter and retains the ordinary history. */
export interface StoreAdapter {
  canEdit(): boolean;
  canReplace(): boolean;
  allocate(): number;
  changed(before: Doc, after: Doc): void;
  undo(redo: boolean): boolean;
}
let adapter: StoreAdapter | null = null;
export function setStoreAdapter(next: StoreAdapter | null): void {
  adapter = next;
}
export function canEditWorkspace(): boolean {
  return adapter?.canEdit() ?? true;
}
export function canReplaceWorkspace(): boolean {
  return adapter?.canReplace() ?? true;
}

/** Installs an authoritative shared state without feeding it back into the network. */
export function installSharedDoc(doc: Doc, replace = false): void {
  const before = docSig.peek();
  batch(() => {
    if (replace) {
      workspaceVersionSig.value++;
      historySig.value = emptyHistory();
      clearSelection();
    } else {
      const patch: Patch = {
        label: 'Shared update',
        parts: [...new Set([...before.parts.keys(), ...doc.parts.keys()])]
          .filter((id) => before.parts.get(id) !== doc.parts.get(id))
          .map((id) => [id, before.parts.get(id), doc.parts.get(id)] as const),
        order: before.order === doc.order ? null : [before.order, doc.order],
        layout: [...new Set([...before.layout.keys(), ...doc.layout.keys()])]
          .filter((id) => before.layout.get(id) !== doc.layout.get(id))
          .map((id) => [id, before.layout.get(id), doc.layout.get(id)] as const),
        nextId: [before.nextId, doc.nextId],
      };
      historySig.value = record(historySig.value, patch);
    }
    docSig.value = doc;
    sanitizeSelection(doc);
  });
}
/** The loaded mesh pack and catalog; null until `loadAssets` resolves. */
export const assetsSig = signal<Assets | null>(null);
export const baseCatalogSig = signal<Catalog | null>(null);
/** Socket Workbench captures, applied live on top of the shipped catalog. */
export const socketOverridesSig = signal<SocketGeometryFile>(emptySocketGeometry());
export const catalogSig: ReadonlySignal<Catalog | null> = computed(() => {
  const base = baseCatalogSig.value;
  return base && applySocketGeometry(base, socketOverridesSig.value);
});

/** Runs one undoable edit. Returns null, and records nothing, when the edit changed nothing. */
export function commit(label: string, fn: (d: Draft) => void): Patch | null {
  if (!canEditWorkspace()) return null;
  const before = docSig.value;
  const { doc, patch } = transact(
    before,
    label,
    fn,
    adapter ? () => adapter!.allocate() : undefined,
  );
  if (!patch) return null;
  batch(() => {
    docSig.value = doc;
    historySig.value = record(historySig.value, patch);
    sanitizeSelection(doc);
  });
  adapter?.changed(before, doc);
  return patch;
}

export function undo(): boolean {
  if (adapter) return adapter.canEdit() && adapter.undo(false);
  const r = undoStep(historySig.value, docSig.value);
  if (!r) return false;
  batch(() => {
    historySig.value = r.h;
    docSig.value = r.doc;
    sanitizeSelection(r.doc);
  });
  return true;
}

export function redo(): boolean {
  if (adapter) return adapter.canEdit() && adapter.undo(true);
  const r = redoStep(historySig.value, docSig.value);
  if (!r) return false;
  batch(() => {
    historySig.value = r.h;
    docSig.value = r.doc;
    sanitizeSelection(r.doc);
  });
  return true;
}

/** Replaces the doc; clears history and selection. */
export function loadDoc(doc: Doc): boolean {
  if (!canReplaceWorkspace()) return false;
  batch(() => {
    workspaceVersionSig.value++;
    docSig.value = doc;
    historySig.value = emptyHistory();
    clearSelection();
  });
  return true;
}

export type ViewEvent =
  | { kind: 'frame-selection' }
  | { kind: 'frame-all' }
  | { kind: 'view'; axis: 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom' }
  | { kind: 'toggle-ortho' }
  | { kind: 'flip-view' }
  | {
      kind: 'look';
      readonly position: readonly [number, number, number];
      readonly target: readonly [number, number, number];
    };

const viewListeners = new Set<(e: ViewEvent) => void>();

/** Camera commands from menus, keys and the nav gizmo to the viewport. */
export const viewBus = {
  emit(e: ViewEvent): void {
    for (const fn of [...viewListeners]) fn(e);
  },
  on(fn: (e: ViewEvent) => void): () => void {
    viewListeners.add(fn);
    return () => {
      viewListeners.delete(fn);
    };
  },
};

export function resetStoreForTests(): void {
  adapter = null;
  historyAvailabilitySig.value = null;
  batch(() => {
    docSig.value = EMPTY_DOC;
    historySig.value = emptyHistory();
    assetsSig.value = null;
    baseCatalogSig.value = null;
    socketOverridesSig.value = emptySocketGeometry();
    resetSelectionForTests();
  });
  viewListeners.clear();
}
