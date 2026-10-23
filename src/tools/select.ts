// The Select tool (spec §12.1): click, Shift/Ctrl modifiers, box select from empty space (or anywhere
// after B). A click on a point marker selects that ephemeral point instead. L / Ctrl+L are commands
// (select.linked / select.connected).
import { signal } from '@preact/signals';
import type { Vector2 } from 'three';
import type { PartId, PointKey } from '../core/types';
import { hoverPointSig, hoverSig, pointKey, select, selectPoints } from '../state/selection';
import { settingsSig } from '../state/settings';
import { getViewport } from '../viewport/context';
import { partsInRect, pickPart, pickPoint } from '../viewport/raycast';
import type { Tool, ToolPointer } from './manager';

/** Set by `select.box`: the next press starts a box select wherever it lands. */
export const boxNextSig = signal(false);

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

/** The point marker under the cursor, if one is drawn there. */
function pointAt(ndc: Vector2): PointKey | null {
  const p = pickPoint(ndc);
  return p ? pointKey(p.host, p.uuid) : null;
}

export function createSelectTool(): Tool {
  let start: { x: number; y: number; hit: PartId | null; point: PointKey | null } | null = null;
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
      const point = cursor ? pointAt(cursor) : null;
      if (hoverPointSig.value !== point) hoverPointSig.value = point;
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
      hoverPointSig.value = null;
      start = null;
      hideBox();
    },
    onPointer(e: ToolPointer) {
      if (e.kind === 'move' && e.button === -1) return hover(e.ndc);
      if (e.button !== 0) return;
      if (e.kind === 'down') {
        // B (select.box) makes the next drag a box even when it starts on a part.
        const boxed = boxNextSig.peek();
        boxNextSig.value = false;
        const point = boxed ? null : pointAt(e.ndc);
        const hit = boxed || point ? null : (pickPart(e.ndc)?.part ?? null);
        start = { x: e.x, y: e.y, hit, point };
      } else if (e.kind === 'move' && start) {
        cursor = e.ndc;
        const far = Math.hypot(e.x - start.x, e.y - start.y) > DRAG_PX;
        if (start.hit === null && start.point === null && (box || far)) {
          showBox(start.x, start.y, e.x, e.y);
        }
      } else if (e.kind === 'up' && start) {
        if (box) {
          const rect = { x0: start.x, y0: start.y, x1: e.x, y1: e.y };
          const ids = partsInRect(rect, settingsSig.value.xray ? 'xray' : 'visible');
          select(ids, e.shift ? 'add' : e.ctrl ? 'remove' : 'replace');
          hideBox();
        } else if (start.point !== null) {
          selectPoints([start.point], e.shift ? 'toggle' : e.ctrl ? 'remove' : 'replace');
        } else {
          const { ids, op } = clickOp(start.hit, e);
          select(ids, op);
        }
        start = null;
      }
    },
  };
}
