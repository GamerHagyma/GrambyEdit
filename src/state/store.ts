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
export const historySig = signal<History>(emptyHistory());
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
  const { doc, patch } = transact(docSig.value, label, fn);
  if (!patch) return null;
  batch(() => {
    docSig.value = doc;
    historySig.value = record(historySig.value, patch);
    sanitizeSelection(doc);
  });
  return patch;
}

export function undo(): boolean {
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
export function loadDoc(doc: Doc): void {
  batch(() => {
    docSig.value = doc;
    historySig.value = emptyHistory();
    clearSelection();
  });
}

export type ViewEvent =
  | { kind: 'frame-selection' }
  | { kind: 'frame-all' }
  | { kind: 'view'; axis: 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom' }
  | { kind: 'toggle-ortho' };

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
