import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { toEntries } from '../../core/doc';
import { formatPercent } from '../../core/size';
import { codePreview, exportCurrent } from '../../state/io';
import { settingsSig } from '../../state/settings';
import { docSig } from '../../state/store';
import { withServoPreview } from '../../state/servo-preview';
import { toast } from '../../state/toasts';
import { dateStamp, downloadText } from '../download';
import { Dialog } from '../layout/Dialog';
import { ExportErrorsDialog } from './ExportErrorsDialog';

/** The current build as a share code: copy it, or download it as text or as pretty JSON. */
export function ExportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): JSX.Element | null {
  return open ? <ExportBody onClose={onClose} /> : null;
}

/** Mounted only while open, so each opening encodes the build again and asks about errors again. */
function ExportBody({ onClose }: { onClose(): void }): JSX.Element {
  const [source] = useState(() => withServoPreview(docSig.value));
  const [includeRotation, setIncludeRotation] = useState(true);
  const { doc, code, issues } = exportCurrent(includeRotation, source);
  const [confirmed, setConfirmed] = useState(false);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0 && !confirmed) {
    return (
      <ExportErrorsDialog issues={errors} onExport={() => setConfirmed(true)} onClose={onClose} />
    );
  }

  const { limits } = settingsSig.value;
  const parts = doc.order.length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const summary =
    `Parts ${parts.toLocaleString('en-US')} / ${limits.partSoftCap.toLocaleString('en-US')} · ` +
    `Code ${formatPercent(code.length, limits.codeChars)}% used · ` +
    `${code.length.toLocaleString('en-US')} characters · ` +
    `Errors ${errors.length} · Warnings ${warnings}`;

  return (
    <Dialog
      title="Export build"
      open
      onClose={onClose}
      footer={
        <>
          <button class="button primary" onClick={() => copyCode(code)}>
            Copy code
          </button>
          <button
            class="button"
            onClick={() => downloadText(`GrambyEdit-${dateStamp()}.txt`, code, 'text/plain')}
          >
            Download .txt
          </button>
          <button
            class="button"
            onClick={() =>
              downloadText(
                `GrambyEdit-${dateStamp()}.json`,
                JSON.stringify(toEntries(doc), null, 2),
                'application/json',
              )
            }
          >
            Download .json
          </button>
        </>
      }
    >
      <p>{summary}</p>
      <label class="servo-sustain">
        <input
          type="checkbox"
          checked={includeRotation}
          onChange={(e) => setIncludeRotation(e.currentTarget.checked)}
        />
        Include servo rotation values
      </label>
      <code class="mono" style={{ display: 'block', overflowWrap: 'anywhere' }}>
        {codePreview(code)}
      </code>
    </Dialog>
  );
}

async function copyCode(code: string): Promise<void> {
  if (!navigator.clipboard) {
    toast('This browser cannot copy here. Download the code instead.', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(code);
    toast('Code copied.');
  } catch (e) {
    toast(`Could not copy the code: ${(e as Error).message}`, 'error');
  }
}
