import { applyPatch, type Patch } from '../core/ops/transact';
import type { Doc } from '../core/types';

/** Undo stack: `past` ends with the latest edit; `future` ends with the next redo. */
export interface History {
  readonly past: readonly Patch[];
  readonly future: readonly Patch[];
}

export function emptyHistory(): History {
  return { past: [], future: [] };
}

/** Pushes an edit, dropping the oldest beyond `cap`, and clears the redo stack. */
export function record(h: History, p: Patch, cap = 500): History {
  const keep = h.past.length >= cap ? h.past.slice(h.past.length - cap + 1) : h.past;
  return { past: [...keep, p], future: [] };
}

export function undoStep(h: History, doc: Doc): { h: History; doc: Doc } | null {
  const p = h.past.at(-1);
  if (!p) return null;
  return {
    h: { past: h.past.slice(0, -1), future: [...h.future, p] },
    doc: applyPatch(doc, p, 'undo'),
  };
}

export function redoStep(h: History, doc: Doc): { h: History; doc: Doc } | null {
  const p = h.future.at(-1);
  if (!p) return null;
  return {
    h: { past: [...h.past, p], future: h.future.slice(0, -1) },
    doc: applyPatch(doc, p, 'redo'),
  };
}
