// The Select tool (spec §12.1): click, Shift/Ctrl modifiers, box select from empty space, L / Ctrl+L.
import type { Vector2 } from 'three';
import { component, poseDescendants } from '../core/graph';
import type { PartId } from '../core/types';
import { hoverSig, select } from '../state/selection';
import { settingsSig } from '../state/settings';
import { docSig } from '../state/store';
import { getViewport } from '../viewport/context';
import { partsInRect, pickPart } from '../viewport/raycast';
import type { Tool, ToolPointer } from './manager';

/** Movement past this many pixels turns a click on empty space into a box drag. */
const DRAG_PX = 4;

/** What a click does: replace, Shift toggles, Ctrl removes; an empty-space click clears unless modified. */
export function clickOp(
  hit: PartId | null,
  mods: { shift: boolean; ctrl: boolean },
): { ids: PartId[]; op: 'replace' | 'add' | 'toggle' | 'remove' } {
  if (hit === null) return { ids: [], op: mods.shift || mods.ctrl ? 'add' : 'replace' };
  if (mods.shift) return { ids: [hit], op: 'toggle' };
  if (mods.ctrl) return { ids: [hit], op: 'remove' };
  return { ids: [hit], op: 'replace' };
}

export function createSelectTool(): Tool {
  let start: { x: number; y: number; hit: PartId | null } | null = null;
  let box: HTMLDivElement | null = null;
  let cursor: Vector2 | null = null;
  let hoverFrame = 0;

  const showBox = (x0: number, y0: number, x1: number, y1: number) => {
    const vp = getViewport();
    if (!vp) return;
    const host = vp.canvas.parentElement!;
    if (!box) {
      box = document.createElement('div');
      box.className = 'select-box';
      host.append(box);
    }
    const r = host.getBoundingClientRect();
    Object.assign(box.style, {
      left: `${Math.min(x0, x1) - r.left}px`,
      top: `${Math.min(y0, y1) - r.top}px`,
      width: `${Math.abs(x1 - x0)}px`,
      height: `${Math.abs(y1 - y0)}px`,
    });
  };
  const hideBox = () => {
    box?.remove();
    box = null;
  };

  /** Hover picks at most once per animation frame, after the pointer moves (spec §11.2). */
  const hover = (ndc: Vector2) => {
    cursor = ndc;
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      const id = cursor ? (pickPart(cursor)?.part ?? null) : null;
      if (hoverSig.value !== id) hoverSig.value = id;
    });
  };

  return {
    id: 'select',
    activate() {},
    deactivate() {
      cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
      hoverSig.value = null;
      start = null;
      hideBox();
    },
    onPointer(e: ToolPointer) {
      if (e.kind === 'move' && e.button === -1) return hover(e.ndc);
      if (e.button !== 0) return;
      if (e.kind === 'down') {
        start = { x: e.x, y: e.y, hit: pickPart(e.ndc)?.part ?? null };
      } else if (e.kind === 'move' && start) {
        cursor = e.ndc;
        const far = Math.hypot(e.x - start.x, e.y - start.y) > DRAG_PX;
        if (start.hit === null && (box || far)) showBox(start.x, start.y, e.x, e.y);
      } else if (e.kind === 'up' && start) {
        if (box) {
          const rect = { x0: start.x, y0: start.y, x1: e.x, y1: e.y };
          const ids = partsInRect(rect, settingsSig.value.xray ? 'xray' : 'visible');
          select(ids, e.shift ? 'add' : e.ctrl ? 'remove' : 'replace');
          hideBox();
        } else {
          const { ids, op } = clickOp(start.hit, e);
          select(ids, op);
        }
        start = null;
      }
    },
    onKey(e: KeyboardEvent) {
      if (e.code !== 'KeyL' || e.altKey || e.shiftKey || !cursor) return false;
      const hit = pickPart(cursor)?.part;
      if (hit === undefined) return true;
      const doc = docSig.value;
      const ids =
        e.ctrlKey || e.metaKey ? component(doc, hit, () => true) : new Set([hit, ...poseDescendants(doc, hit)]);
      select(ids, 'add');
      return true;
    },
  };
}
