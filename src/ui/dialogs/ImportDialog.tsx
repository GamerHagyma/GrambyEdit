import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { importText } from '../../state/io';
import { historySig, loadDoc, viewBus } from '../../state/store';
import { toast } from '../../state/toasts';
import { Dialog } from '../layout/Dialog';

/** Paste or drop a share code, check its summary, then open it in place of the current build. */
export function ImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): JSX.Element | null {
  return open ? <ImportBody onClose={onClose} /> : null;
}

/** Mounted only while open, so each opening starts empty. */
function ImportBody({ onClose }: { onClose(): void }): JSX.Element {
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);
  // Parsed once per edit, not per render: a pasted code can be 8 M characters long.
  const result = useMemo(() => (text.trim() === '' ? null : importText(text)), [text]);

  const edit = (value: string) => {
    setText(value);
    setConfirming(false);
  };
  const readFile = async (file: File) => {
    if (!/\.(txt|json)$/i.test(file.name)) {
      toast('Only .txt and .json files can be imported.', 'error');
      return;
    }
    try {
      edit(await file.text());
    } catch (e) {
      toast(`Could not read ${file.name}: ${(e as Error).message}`, 'error');
    }
  };
  const replace = () => {
    if (!result || !result.ok) return;
    loadDoc(result.doc);
    viewBus.emit({ kind: 'frame-all' });
    onClose();
  };
  const openBuild = () => {
    if (!result || !result.ok) return;
    if (historySig.value.past.length > 0) setConfirming(true);
    else replace();
  };

  return (
    <Dialog
      title="Import code"
      open
      onClose={onClose}
      footer={
        confirming ? (
          <>
            <button class="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button class="button primary" onClick={replace}>
              Replace
            </button>
          </>
        ) : (
          <>
            <button class="button" onClick={onClose}>
              Cancel
            </button>
            <button class="button primary" disabled={!result || !result.ok} onClick={openBuild}>
              Open (replace)
            </button>
          </>
        )
      }
    >
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer?.files[0];
          if (file) void readFile(file);
        }}
      >
        <textarea
          class="mono"
          aria-label="Share code or JSON"
          rows={6}
          spellcheck={false}
          placeholder="Paste a share code or a JSON list of parts"
          style={{ width: '100%' }}
          value={text}
          onInput={(e) => edit(e.currentTarget.value)}
        />
        <p class="muted">
          Or drop a .txt or .json file here, or choose one:{' '}
          <input
            type="file"
            accept=".txt,.json,text/plain,application/json"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void readFile(file);
            }}
          />
        </p>
        {result && result.ok && (
          <p>
            {`Parts ${result.summary.parts.toLocaleString('en-US')} · Part types ${result.summary.types} · Errors ${result.summary.errors} · Warnings ${result.summary.warnings}`}
          </p>
        )}
        {result && !result.ok && (
          <p role="alert" style={{ color: 'var(--bad)' }}>
            {result.message}
          </p>
        )}
        {confirming && <p role="alert">Replace the current build? Unsaved changes are lost.</p>}
      </div>
    </Dialog>
  );
}
