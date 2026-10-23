// Deleting a point a part hangs from asks first (spec §12.3): detach the part, delete it too, or cancel.
import type { JSX } from 'preact';
import { orderIndex } from '../../core/doc';
import { docSig } from '../../state/store';
import { confirmPointDelete, pointDeleteSig } from '../../tools/point';
import { Dialog } from '../layout/Dialog';

export function PointDeleteDialog(): JSX.Element | null {
  const req = pointDeleteSig.value;
  if (!req) return null;
  const doc = docSig.value;
  const index = orderIndex(doc);
  const names = req.children.map((id) => `${doc.parts.get(id)?.type} #${(index.get(id) ?? 0) + 1}`);
  const cancel = () => {
    pointDeleteSig.value = null;
  };
  return (
    <Dialog
      title="Delete point"
      open
      onClose={cancel}
      footer={
        <>
          <button class="button" onClick={cancel}>
            Cancel
          </button>
          <button class="button" onClick={() => confirmPointDelete('detach')}>
            Detach
          </button>
          <button class="button primary" onClick={() => confirmPointDelete('delete')}>
            Delete part
          </button>
        </>
      }
    >
      <p>
        {names.join(', ')} {names.length === 1 ? 'hangs' : 'hang'} from this point. Detach keeps{' '}
        {names.length === 1 ? 'it' : 'them'} where {names.length === 1 ? 'it is' : 'they are'};
        Delete part removes {names.length === 1 ? 'it' : 'them'} with the point.
      </p>
    </Dialog>
  );
}
