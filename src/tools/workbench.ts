// The Sockets tool (spec §12.7): in the workbench, a click on a ring selects that socket; with a
// socket selected, a click on a candidate dot or on the mesh captures the socket's frame there.
import { captureProgress, captureSocket, wbSocketSig, wbTypeSig } from '../state/workbench';
import { catalogSig, socketOverridesSig } from '../state/store';
import { toast } from '../state/toasts';
import { getViewport } from '../viewport/context';
import type { Tool, ToolPointer } from './manager';

const CLICK_PX = 4;

export function createWorkbenchTool(): Tool {
  let down: { x: number; y: number } | null = null;
  return {
    id: 'sockets',
    activate() {
      const cat = catalogSig.value;
      if (wbTypeSig.value === null && cat) {
        wbTypeSig.value = captureProgress(cat, socketOverridesSig.value)[0]?.type ?? null;
      }
    },
    deactivate() {
      down = null;
    },
    onPointer(e: ToolPointer) {
      const vp = getViewport();
      const view = vp?.workbench;
      if (!vp || !view || e.button !== 0) return;
      if (e.kind === 'down') {
        down = view.gizmoBusy() ? null : { x: e.x, y: e.y };
        return;
      }
      if (e.kind !== 'up' || !down) return;
      const moved = Math.hypot(e.x - down.x, e.y - down.y) > CLICK_PX;
      down = null;
      if (moved) return;
      const pick = view.pick(e.ndc, vp.rig.camera);
      const type = wbTypeSig.value;
      if (!pick || !type) return;
      if (pick.kind === 'socket') {
        wbSocketSig.value = pick.socket;
        return;
      }
      const socket = wbSocketSig.value;
      if (socket === null) {
        toast('Select a socket first, then click where it sits.', 'info');
        return;
      }
      captureSocket(type, socket, pick.cframe).catch((err: unknown) =>
        toast((err as Error).message, 'error'),
      );
    },
    onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && wbSocketSig.value !== null) {
        wbSocketSig.value = null;
        return true;
      }
      return false;
    },
  };
}
