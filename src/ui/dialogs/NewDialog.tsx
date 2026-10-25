import type { JSX } from 'preact';
import { newBlueprint } from '../../state/new-blueprint';
import { Dialog } from '../layout/Dialog';

export function NewDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): JSX.Element | null {
  return (
    <Dialog
      title="New blueprint"
      open={open}
      onClose={onClose}
      footer={
        <>
          <button class="button" onClick={onClose}>
            Cancel
          </button>
          <button
            class="button primary"
            onClick={() => {
              newBlueprint();
              onClose();
            }}
          >
            New blueprint
          </button>
        </>
      }
    >
      <p>Are you sure? This will clear the current workspace and undo history.</p>
      <p class="muted">Saved creations and reference images will remain available.</p>
    </Dialog>
  );
}
