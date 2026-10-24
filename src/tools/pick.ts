// The Pick tool (spec §12.8): one click on a part answers a panel's question, such as which part a
// generated shape or a GasCap surface goes on. The question shows in the status bar and the cursor
// turns into an eyedropper; Esc cancels.
import { signal } from '@preact/signals';
import { hoverSig } from '../state/selection';
import { statusHintSig } from '../state/ui';
import { getViewport } from '../viewport/context';
import { pickPart, type Hit } from '../viewport/raycast';
import { setTool, toolSig, type Tool, type ToolId, type ToolPointer } from './manager';

export interface PickRequest {
  /** The status-bar line while picking. */
  readonly prompt: string;
  readonly onPick: (hit: Hit) => void;
  /** The tool after a pick; the tool from before the pick when omitted. */
  readonly then?: ToolId;
}

/** The pick in progress, if any. */
export const pickSig = signal<PickRequest | null>(null);
/** The tool to go back to when a pick ends. */
let before: ToolId = 'select';

export function startPick(req: PickRequest): void {
  if (toolSig.value !== 'pick') before = toolSig.value;
  pickSig.value = req;
  statusHintSig.value = req.prompt;
  setTool('pick');
}

/** Ends a pick without a choice, back in the tool from before it. */
export function cancelPick(): void {
  pickSig.value = null;
  if (toolSig.value === 'pick') setTool(before);
}

/** Movement past this many pixels turns a click into a drag, which picks nothing. */
const DRAG_PX = 4;

export function createPickTool(): Tool {
  let press: { x: number; y: number } | null = null;
  return {
    id: 'pick',
    activate() {
      statusHintSig.value = pickSig.value?.prompt ?? null;
      getViewport()?.canvas.classList.add('picking');
    },
    // Another tool chosen mid-pick drops the request and keeps that tool.
    deactivate() {
      getViewport()?.canvas.classList.remove('picking');
      press = null;
      pickSig.value = null;
      statusHintSig.value = null;
      hoverSig.value = null;
    },
    onPointer(e: ToolPointer) {
      if (e.kind === 'move' && e.button === -1) {
        const part = pickPart(e.ndc)?.part ?? null;
        if (hoverSig.value !== part) hoverSig.value = part;
        return;
      }
      if (e.button !== 0) return;
      if (e.kind === 'down') {
        press = { x: e.x, y: e.y };
        return;
      }
      if (e.kind !== 'up' || !press) return;
      const moved = Math.hypot(e.x - press.x, e.y - press.y) > DRAG_PX;
      press = null;
      const req = pickSig.value;
      const hit = req && !moved ? pickPart(e.ndc) : null;
      if (!req || !hit) return;
      pickSig.value = null;
      req.onPick(hit);
      setTool(req.then ?? before);
    },
    onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return false;
      cancelPick();
      return true;
    },
  };
}
