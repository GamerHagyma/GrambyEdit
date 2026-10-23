import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { openCreationIdSig, saveCurrent, saveSelectionAsCreation } from '../../state/library';
import { toast } from '../../state/toasts';
import { getCreation } from '../../storage/library';
import { Dialog } from '../layout/Dialog';

/** Saves the build to the library, or the selected parts as a new creation (spec §13.8). */
export function SaveDialog({
  open,
  onClose,
  selectionOnly = false,
}: {
  open: boolean;
  onClose(): void;
  selectionOnly?: boolean;
}): JSX.Element | null {
  return open ? <SaveBody onClose={onClose} selectionOnly={selectionOnly} /> : null;
}

/** Mounted only while open, so each opening starts from the open creation again. */
function SaveBody({
  onClose,
  selectionOnly,
}: {
  onClose(): void;
  selectionOnly: boolean;
}): JSX.Element {
  // A selection is always a new creation. An open creation is read before Save is enabled: saving
  // over it with tags and notes the fields do not hold would clear them.
  const openId = selectionOnly ? null : openCreationIdSig.value;
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(openId !== null);
  const [busy, setBusy] = useState(false);
  const ready = !loading && !busy && name.trim() !== '';

  useEffect(() => {
    if (openId === null) return;
    getCreation(openId).then(
      (r) => {
        if (r) {
          setName(r.name);
          setTags(r.tags.join(', '));
          setNotes(r.notes);
        }
        setLoading(false);
      },
      // The form stays disabled: a failed read must not let Save overwrite the creation blind.
      (e: unknown) => toast((e as Error).message, 'error'),
    );
  }, []);

  const save = async (asNew: boolean) => {
    const title = name.trim();
    setBusy(true);
    try {
      const extra = { tags: parseTags(tags), notes: notes.trim() };
      if (selectionOnly) await saveSelectionAsCreation(title, extra);
      else await saveCurrent(title, asNew ? undefined : (openId ?? undefined), extra);
      toast(`Saved "${title}".`);
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={selectionOnly ? 'Save selection as creation' : 'Save build'}
      open
      onClose={onClose}
      footer={
        <>
          <button class="button" onClick={onClose}>
            Cancel
          </button>
          {openId !== null && (
            <button class="button" disabled={!ready} onClick={() => void save(true)}>
              Save as new
            </button>
          )}
          <button class="button primary" disabled={!ready} onClick={() => void save(false)}>
            Save
          </button>
        </>
      }
    >
      <div class="save-form">
        <label>
          <span>Name</span>
          <input
            type="text"
            value={name}
            disabled={loading}
            required
            onInput={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready) void save(false);
            }}
          />
        </label>
        <label>
          <span>Tags (comma-separated)</span>
          <input
            type="text"
            value={tags}
            disabled={loading}
            onInput={(e) => setTags(e.currentTarget.value)}
          />
        </label>
        <label>
          <span>Notes</span>
          <textarea
            rows={3}
            value={notes}
            disabled={loading}
            onInput={(e) => setNotes(e.currentTarget.value)}
          />
        </label>
      </div>
    </Dialog>
  );
}

/** Comma-separated tags, trimmed, without blanks or repeats. */
function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t !== ''),
    ),
  ];
}
