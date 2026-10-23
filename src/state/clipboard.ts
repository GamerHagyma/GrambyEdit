// Copy and paste (spec §9.2). A copy keeps the selection as a sub-doc inside the editor (it keeps the
// roots' relative layout) and puts its share code on the system clipboard, so it also pastes into another
// tab or the game. Paste uses the system clipboard's code when it holds one, else the editor's copy, and
// arms the Place tool with it.
import { signal } from '@preact/signals';
import { encode } from '../core/codec';
import { toEntries } from '../core/doc';
import { extractSubDoc } from '../core/ops/clipboard';
import { parseShareText } from '../core/share';
import type { Doc } from '../core/types';
import { posesSig } from './derived';
import { arm } from './place';
import { selectionSig } from './selection';
import { docSig } from './store';
import { toast } from './toasts';

/** The last copy, and its code (a paste of that same code uses the sub-doc, which keeps the layout). */
export const clipboardSig = signal<{ readonly sub: Doc; readonly code: string } | null>(null);

const parts = (n: number) => `${n} ${n === 1 ? 'part' : 'parts'}`;

/** The selection as a sub-doc and its share code; null when no part is selected. */
export function copyPayload(): { sub: Doc; code: string } | null {
  const doc = docSig.value;
  const ids = doc.order.filter((id) => selectionSig.value.parts.has(id));
  if (ids.length === 0) return null;
  const sub = extractSubDoc(doc, posesSig.value, ids);
  return { sub, code: encode(toEntries(sub)) };
}

/** Keeps a copy for pasting inside the editor. */
export function rememberCopy(payload: { sub: Doc; code: string }): void {
  clipboardSig.value = payload;
  toast(`Copied ${parts(payload.sub.order.length)}.`);
}

/** Copies the selection (palette and menus; the Ctrl+C key goes through the browser's copy event). */
export async function copySelection(): Promise<void> {
  const payload = copyPayload();
  if (!payload) {
    toast('Select parts to copy.', 'warn');
    return;
  }
  try {
    await navigator.clipboard.writeText(payload.code);
    rememberCopy(payload);
  } catch (e) {
    clipboardSig.value = payload;
    toast(
      `Copied inside the editor only; the browser refused the clipboard: ${(e as Error).message}`,
      'warn',
    );
  }
}

/**
 * Pastes the clipboard's text when it is a share code (the editor's own copy, which keeps the layout,
 * when it is that copy). Text that is not a build is refused. With no text (the clipboard could not be
 * read, or holds no text) the editor's copy is pasted.
 */
export function pasteText(text: string | null): void {
  const kept = clipboardSig.value;
  const trimmed = text?.trim() ?? '';
  let sub: Doc | null = null;
  if (trimmed === '') sub = kept?.sub ?? null;
  else if (trimmed === kept?.code) sub = kept.sub;
  else {
    const r = parseShareText(trimmed);
    if (!r.ok) {
      toast(`The clipboard does not hold a build: ${r.message}`, 'warn');
      return;
    }
    sub = r.doc;
  }
  if (!sub) {
    toast('Nothing to paste. Copy parts or a share code first.', 'warn');
    return;
  }
  arm({ kind: 'paste', sub });
}

/** Pastes from the system clipboard (palette and menus), or the editor's copy when it cannot be read. */
export async function pasteFromClipboard(): Promise<void> {
  let text: string | null = null;
  try {
    text = await navigator.clipboard.readText();
  } catch (e) {
    if (!clipboardSig.value) {
      toast(
        `The browser refused to read the clipboard: ${(e as Error).message}. Press Ctrl+V instead.`,
        'warn',
      );
      return;
    }
  }
  pasteText(text);
}
