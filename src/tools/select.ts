// The Select tool (spec §12.1): click, Shift/Ctrl modifiers, box select from empty space (or anywhere
// after B). A click on a point marker selects that ephemeral point instead. L / Ctrl+L are commands
// (select.linked / select.connected).
import { signal } from '@preact/signals';
import type { Vector2 } from 'three';
import type { PartId, PointKey } from '../core/types';
import {
  hoverPieceSig,
  hoverPointSig,
  hoverSig,
  pointKey,
  select,
  selectPiece,
  selectPoints,
} from '../state/selection';
import { settingsSig } from '../state/settings';
import { catalogSig, docSig } from '../state/store';
import { getViewport } from '../viewport/context';
import { partsInRect, pickPart, pickPoint, type Hit } from '../viewport/raycast';
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

/** Two plain clicks on one part within this many ms and px make a double-click. */
const DOUBLE_MS = 400;
const DOUBLE_PX = 4;

/** A part with more than one body: a click on it selects one piece, a double-click the whole part. */
export function hasPieces(part: PartId): boolean {
  const cat = catalogSig.value;
  const type = docSig.value.parts.get(part)?.type;
  return type !== undefined && (cat?.parts[type]?.bodies?.length ?? 0) > 1;
}

/** The body of a part under the pointer; `body` is 0 for a one-piece part. */
export interface PieceHit {
  part: PartId;
  body: number;
}

/**
 * A click handler for one tool. A click on a multi-piece part selects that piece; a second plain click
 * on the same part at the same spot (a double-click) selects the whole part instead.
 */
export function createClickSelect(
  piecesOf: (part: PartId) => boolean,
): (
  hit: PieceHit | null,
  e: { shift: boolean; ctrl: boolean; x: number; y: number },
  now: number,
) => void {
  let last: { part: PartId; x: number; y: number; at: number } | null = null;
  return (hit, e, now) => {
    if (hit === null) {
      last = null;
      const { ids, op } = clickOp(null, e);
      select(ids, op);
      return;
    }
    const plain = !e.shift && !e.ctrl;
    const double =
      plain &&
      last !== null &&
      last.part === hit.part &&
      now - last.at <= DOUBLE_MS &&
      Math.hypot(e.x - last.x, e.y - last.y) <= DOUBLE_PX;
    last = plain && !double ? { part: hit.part, x: e.x, y: e.y, at: now } : null;
    const { ids, op } = clickOp(hit.part, double ? { shift: false, ctrl: false } : e);
    if (!double && piecesOf(hit.part)) selectPiece(hit.part, hit.body, op);
    else select(ids, op);
  };
}

/** The point marker under the cursor, if one is drawn there. */
function pointAt(ndc: Vector2): PointKey | null {
  const p = pickPoint(ndc);
  return p ? pointKey(p.host, p.uuid) : null;
}

/**
 * What a press lands on: a point marker, else a part. A part's own mount point yields to its mesh,
 * so Select/Move can carry ordinary parts as well as multi-piece bodies.
 */
export function pressAt(ndc: Vector2): { point: PointKey | null; hit: Hit | null } {
  const p = pickPoint(ndc);
  const hit = pickPart(ndc);
  if (!p) return { point: null, hit };
  const own =
    hit !== null &&
    (docSig.value.parts.get(hit.part)?.conns ?? []).some(
      (c) => c.target.kind === 'point' && c.target.part === p.host && c.target.uuid === p.uuid,
    );
  return own ? { point: null, hit } : { point: pointKey(p.host, p.uuid), hit: null };
}

export function createSelectTool(): Tool {
  let start: { x: number; y: number; hit: PieceHit | null; point: PointKey | null } | null = null;
  let box: HTMLDivElement | null = null;
  let cursor: Vector2 | null = null;
  let hoverFrame = 0;
  const click = createClickSelect(hasPieces);

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
      const hit = cursor ? pickPart(cursor) : null;
      const id = hit?.part ?? null;
      if (hoverSig.value !== id) hoverSig.value = id;
      const piece = hit && hasPieces(hit.part) ? hit.body : null;
      if (hoverPieceSig.value !== piece) hoverPieceSig.value = piece;
    });
  };

  return {
    id: 'select',
    activate() {},
    deactivate() {
      cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
      hoverSig.value = null;
      hoverPieceSig.value = null;
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
        const { point, hit } = boxed ? { point: null, hit: null } : pressAt(e.ndc);
        start = { x: e.x, y: e.y, hit: hit && { part: hit.part, body: hit.body }, point };
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
          click(start.hit, e, performance.now());
        }
        start = null;
      }
    },
  };
}
