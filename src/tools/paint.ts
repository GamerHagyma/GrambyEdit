// The Paint tool (spec §12.5): click, fill, box, brush and branch paint the active colour, and Alt+click
// picks a colour from a part. Every paint is one commit.
import { signal } from '@preact/signals';
import type { Vector2 } from 'three';
import { component, poseDescendants } from '../core/graph';
import { paint } from '../core/ops/paint';
import { transact } from '../core/ops/transact';
import { isRgb, pushRecentColor } from '../core/palette';
import type { Doc, Part, PartId, RGB } from '../core/types';
import { loadPref, savePref } from '../storage/prefs';
import { hoverSig } from '../state/selection';
import { settingsSig, updateSettings } from '../state/settings';
import { catalogSig, commit, docSig } from '../state/store';
import { toast } from '../state/toasts';
import { getViewport } from '../viewport/context';
import type { Tool, ToolPointer } from './manager';

export type PaintMode = 'click' | 'fill' | 'box' | 'brush' | 'branch';
export type FillMatch = 'color' | 'type' | 'any';

export const paintModeSig = signal<PaintMode>('click');
export const fillMatchSig = signal<FillMatch>('color');
/** Brush radius in CSS pixels. */
export const brushRadiusSig = signal<number>(24);
/** Colours painted with, newest first (pref `recentColors`). */
export const recentColorsSig = signal<readonly RGB[]>(loadRecentColors());

/** The stored list is untrusted: valid triples only, unique, newest first. */
function loadRecentColors(): RGB[] {
  const stored = loadPref<unknown>('recentColors', []);
  const valid = Array.isArray(stored) ? stored.filter(isRgb) : [];
  // Folding from the oldest entry leaves the newest occurrence of each colour at the front.
  return valid.reduceRight<RGB[]>((list, c) => pushRecentColor(list, c), []);
}

/**
 * The parts a click, fill or branch from `hit` paints. A fill floods joint-connected parts that match
 * `hit` by colour (the RGB prop; parts without one match each other), by type, or by anything.
 */
export function paintTargets(
  doc: Doc,
  mode: 'click' | 'fill' | 'branch',
  hit: PartId,
  match: FillMatch,
): PartId[] {
  const start = doc.parts.get(hit);
  if (start === undefined) return [];
  if (mode === 'click') return [hit];
  if (mode === 'branch') return [hit, ...poseDescendants(doc, hit)];
  return [...component(doc, hit, fillTest(match, start))];
}

function fillTest(match: FillMatch, start: Part): (p: Part) => boolean {
  if (match === 'any') return () => true;
  if (match === 'type') return (p) => p.type === start.type;
  const color = JSON.stringify(start.props.RGB ?? null);
  return (p) => JSON.stringify(p.props.RGB ?? null) === color;
}

/**
 * Paints `ids` with the active colour in one commit. Parts that cannot take paint are skipped, and a toast
 * says how many. The commit label counts the parts that change, so a dry run counts them before the commit.
 */
export function paintParts(ids: Iterable<PartId>): void {
  const cat = catalogSig.value;
  const targets = [...ids];
  if (cat === null || targets.length === 0) return;
  const rgb = settingsSig.value.activeColor;
  let painted = 0;
  let skipped = 0;
  transact(docSig.value, '', (d) => {
    const r = paint(d, cat, targets, rgb);
    painted = r.applied.length;
    skipped = r.skipped.length;
  });
  if (painted > 0) {
    commit(`Paint ${painted} parts`, (d) => {
      paint(d, cat, targets, rgb);
    });
    recentColorsSig.value = pushRecentColor(recentColorsSig.value, rgb);
    savePref('recentColors', recentColorsSig.value);
  }
  if (skipped > 0) toast(`Skipped ${skipped} parts that can't be painted.`);
}

export interface PaintPickers {
  part(ndc: Vector2): PartId | null;
  inRect(rect: { x0: number; y0: number; x1: number; y1: number }, mode: 'visible' | 'xray'): Set<PartId>;
  inDisc(c: { x: number; y: number }, r: number): Set<PartId>;
}

/** Movement past this many pixels turns a press into a drag. */
const DRAG_PX = 4;

/** A left-button press: where it began, the part under it, and the mode it began in. */
interface Press {
  readonly x: number;
  readonly y: number;
  readonly hit: PartId | null;
  readonly mode: PaintMode;
}

export function createPaintTool(pickers: PaintPickers): Tool {
  let press: Press | null = null;
  /** The parts a brush stroke has touched so far. */
  let brushed = new Set<PartId>();
  let cursor: Vector2 | null = null;
  let hoverFrame = 0;
  let box: HTMLDivElement | null = null;
  let ring: HTMLDivElement | null = null;

  /** Places the overlay `el`, created on first use, over the client rectangle `r` in the viewport host. */
  const place = (
    el: HTMLDivElement | null,
    className: string,
    r: { x: number; y: number; w: number; h: number },
  ): HTMLDivElement | null => {
    const vp = getViewport();
    if (!vp) return null;
    const host = vp.canvas.parentElement!;
    const div = el ?? document.createElement('div');
    if (el === null) {
      div.className = className;
      host.append(div);
    }
    const origin = host.getBoundingClientRect();
    Object.assign(div.style, {
      left: `${r.x - origin.left}px`,
      top: `${r.y - origin.top}px`,
      width: `${r.w}px`,
      height: `${r.h}px`,
    });
    return div;
  };
  const showBox = (x0: number, y0: number, x1: number, y1: number) => {
    box = place(box, 'select-box', {
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      w: Math.abs(x1 - x0),
      h: Math.abs(y1 - y0),
    });
  };
  const hideBox = () => {
    box?.remove();
    box = null;
  };
  /** The brush's outline: a circle of the brush radius around the pointer. */
  const showRing = (x: number, y: number) => {
    const R = brushRadiusSig.value;
    ring = place(ring, 'brush-cursor', { x: x - R, y: y - R, w: 2 * R, h: 2 * R });
  };
  const hideRing = () => {
    ring?.remove();
    ring = null;
  };

  /** Hover picks at most once per animation frame, after the pointer moves (spec §11.2). */
  const hover = (ndc: Vector2) => {
    cursor = ndc;
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      const id = cursor ? pickers.part(cursor) : null;
      if (hoverSig.value !== id) hoverSig.value = id;
    });
  };

  /** Adds the parts under the brush disc centred on client point (x, y). */
  const dab = (x: number, y: number) => {
    for (const id of pickers.inDisc({ x, y }, brushRadiusSig.value)) brushed.add(id);
  };

  const moved = (p: Press, e: ToolPointer): boolean => Math.hypot(e.x - p.x, e.y - p.y) > DRAG_PX;

  /** Alt+click: the picked part's colour becomes the active colour. */
  const eyedrop = (ndc: Vector2) => {
    const id = pickers.part(ndc);
    if (id === null) return;
    const rgb = docSig.value.parts.get(id)?.props.RGB;
    if (isRgb(rgb)) updateSettings({ activeColor: [rgb[0], rgb[1], rgb[2]] });
    else toast('That part has no color.', 'warn');
  };

  /** The release of a press: paints what the press began. A box that never moved paints nothing. */
  const release = (p: Press, e: ToolPointer) => {
    if (p.mode === 'box') {
      if (!moved(p, e)) return;
      const rect = { x0: p.x, y0: p.y, x1: e.x, y1: e.y };
      paintParts(pickers.inRect(rect, settingsSig.value.xray ? 'xray' : 'visible'));
    } else if (p.mode === 'brush') {
      paintParts(brushed);
    } else if (p.hit !== null) {
      paintParts(paintTargets(docSig.value, p.mode, p.hit, fillMatchSig.value));
    }
  };

  return {
    id: 'paint',
    activate() {},
    deactivate() {
      cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
      hoverSig.value = null;
      press = null;
      brushed = new Set();
      hideBox();
      hideRing();
    },
    onPointer(e: ToolPointer) {
      if (e.kind === 'move' && e.button === -1) {
        hover(e.ndc);
        if (paintModeSig.value === 'brush') showRing(e.x, e.y);
        else hideRing();
        return;
      }
      if (e.button !== 0) return;
      if (e.kind === 'down') {
        if (e.alt) {
          eyedrop(e.ndc);
          return;
        }
        press = { x: e.x, y: e.y, hit: pickers.part(e.ndc), mode: paintModeSig.value };
        brushed = new Set();
        if (press.mode === 'brush') dab(e.x, e.y);
      } else if (e.kind === 'move' && press) {
        if (press.mode === 'box' && moved(press, e)) showBox(press.x, press.y, e.x, e.y);
        if (press.mode === 'brush') {
          dab(e.x, e.y);
          showRing(e.x, e.y);
        }
      } else if (e.kind === 'up' && press) {
        release(press, e);
        press = null;
        brushed = new Set();
        hideBox();
      }
    },
  };
}
