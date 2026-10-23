import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { EXAMPLES } from '../../core/examples';
import { importText } from '../../state/io';
import { loadDoc, viewBus } from '../../state/store';
import { toast } from '../../state/toasts';
import { loadPref, savePref } from '../../storage/prefs';
import { Dialog } from '../layout/Dialog';

const PREF = 'firstRunDone';

/**
 * Shown once, on the first visit: three tips, then a choice of loading the first example or
 * starting empty. Every way out of the dialog counts as seen.
 */
export function FirstRun(): JSX.Element | null {
  const [done, setDone] = useState(() => loadPref(PREF, false));
  if (done) return null;

  const finish = () => {
    savePref(PREF, true);
    setDone(true);
  };
  const loadExample = () => {
    const r = importText(EXAMPLES[0].code);
    if (!r.ok) {
      toast(r.message, 'error');
      return;
    }
    loadDoc(r.doc);
    viewBus.emit({ kind: 'frame-all' });
    finish();
  };

  return (
    <Dialog
      title="Welcome to GrambyEdit"
      open
      onClose={finish}
      footer={
        <>
          <button class="button" onClick={finish}>
            Start empty
          </button>
          <button class="button primary" onClick={loadExample}>
            Load example
          </button>
        </>
      }
    >
      <ul>
        <li>
          Choose pieces in the Parts panel on the left. The Inspector on the right edits what you
          select.
        </li>
        <li>Ctrl+O imports a share code and Ctrl+E exports the build as one.</li>
        <li>Press ? for every shortcut, or Ctrl+Shift+P for the command palette.</li>
      </ul>
    </Dialog>
  );
}
