import type { JSX } from 'preact';
import type { Issue } from '../../core/types';
import { Dialog } from '../layout/Dialog';

/** The blocking step before an export with error-severity issues: they are listed first, then Export anyway or Cancel. */
export function ExportErrorsDialog({
  issues,
  onExport,
  onClose,
}: {
  issues: readonly Issue[];
  onExport(): void;
  onClose(): void;
}): JSX.Element {
  return (
    <Dialog
      title="Export with errors?"
      open
      onClose={onClose}
      footer={
        <>
          <button class="button" onClick={onClose}>
            Cancel
          </button>
          <button class="button primary" onClick={onExport}>
            Export anyway
          </button>
        </>
      }
    >
      <p>The game may reject this build. Fix these errors, or confirm the export below.</p>
      <ul>
        {issues.map((issue, i) => (
          <li key={i}>
            <code>{issue.code}</code>: {issue.message}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
