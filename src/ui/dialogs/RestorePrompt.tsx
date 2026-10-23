import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { parseShareText } from '../../core/share';
import { openCreationIdSig } from '../../state/library';
import { loadDoc, viewBus } from '../../state/store';
import { toast } from '../../state/toasts';
import { clearAutosave, readAutosave, type AutosaveRecord } from '../../storage/autosave';
import { Dialog } from '../layout/Dialog';

/** Checks the autosave once at startup and offers the unsaved work it holds (spec §14). */
export function RestorePrompt(): JSX.Element | null {
  const [saved, setSaved] = useState<AutosaveRecord | null>(null);

  useEffect(() => {
    readAutosave().then(
      (record) => {
        if (record) setSaved(record);
      },
      (e: unknown) => toast((e as Error).message, 'error'),
    );
  }, []);

  if (saved === null) return null;
  const discard = () => {
    setSaved(null);
    clearAutosave().catch((e: unknown) => toast((e as Error).message, 'error'));
  };

  // Closing without a choice keeps the autosave, so the question comes back at the next start.
  return (
    <Dialog
      title="Unsaved work"
      open
      onClose={() => setSaved(null)}
      footer={
        <>
          <button class="button" onClick={discard}>
            Discard
          </button>
          <button
            class="button primary"
            onClick={() => {
              setSaved(null);
              restoreBuild(saved);
            }}
          >
            Restore
          </button>
        </>
      }
    >
      <p>{`Restore unsaved work from ${new Date(saved.savedAt).toLocaleString()}?`}</p>
    </Dialog>
  );
}

/** Loads the autosaved build with its root layout, as `creationDoc` does for a creation. */
function restoreBuild(record: AutosaveRecord): void {
  const parsed = parseShareText(record.code);
  if (!parsed.ok) {
    toast(`The unsaved work cannot be restored: ${parsed.message}`, 'error');
    return;
  }
  const layout = new Map(parsed.doc.layout);
  for (const [at, cf] of Object.entries(record.editorMeta.rootLayout)) {
    const id = parsed.doc.order[Number(at)];
    if (id !== undefined) layout.set(id, cf);
  }
  loadDoc({ ...parsed.doc, layout });
  openCreationIdSig.value = record.creationId;
  viewBus.emit({ kind: 'frame-all' });
}
