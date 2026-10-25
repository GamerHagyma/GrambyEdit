import { batch } from '@preact/signals';
import { EMPTY_DOC } from '../core/types';
import { cancelModal } from '../tools/modal';
import { setTool } from '../tools/manager';
import { cancelPick } from '../tools/pick';
import { clearGenHost } from './generators';
import { openCreationIdSig } from './library';
import { disarm } from './place';
import { hiddenSig, hoverPieceSig, hoverPointSig, hoverSig } from './selection';
import { clearSurface } from './surfaces';
import { canReplaceWorkspace, loadDoc, viewBus } from './store';
import { contextMenuSig, statusHintSig } from './ui';

/** Called only after confirmation; references, preferences and saved creations are preserved. */
export function newBlueprint(): void {
  if (!canReplaceWorkspace()) return;
  cancelModal();
  cancelPick();
  disarm();
  setTool('select');
  batch(() => {
    clearGenHost();
    clearSurface();
    hiddenSig.value = new Set();
    hoverSig.value = null;
    hoverPieceSig.value = null;
    hoverPointSig.value = null;
    contextMenuSig.value = null;
    statusHintSig.value = null;
    openCreationIdSig.value = null;
    loadDoc(EMPTY_DOC);
  });
  viewBus.emit({ kind: 'frame-all' });
}
