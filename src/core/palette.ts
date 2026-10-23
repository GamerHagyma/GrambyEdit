// The colours of a build and the helpers the Paint tool and panel share (spec §12.5). Pure.
import type { Doc, PartId, RGB } from './types';

/** How many recent colours are kept. */
const RECENT_MAX = 12;

/** Three integers from 0 to 255. Stored values are untrusted, so this checks their shape. */
export const isRgb = (v: unknown): v is RGB =>
  Array.isArray(v) && v.length === 3 && v.every((c) => Number.isInteger(c) && c >= 0 && c <= 255);

const sameRgb = (a: RGB, b: RGB): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** The distinct `RGB` props of the build, most used first; ties keep the order of first use. */
export function buildPalette(doc: Doc): { rgb: RGB; count: number }[] {
  const byKey = new Map<string, { rgb: RGB; count: number }>();
  for (const id of doc.order) {
    const rgb = doc.parts.get(id)?.props.RGB;
    if (!isRgb(rgb)) continue;
    const key = rgb.join(',');
    const entry = byKey.get(key);
    if (entry) entry.count++;
    else byKey.set(key, { rgb: [rgb[0], rgb[1], rgb[2]], count: 1 });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

/** The parts whose `RGB` prop is `c`, in export order. */
export function partsWithColor(doc: Doc, c: RGB): PartId[] {
  return doc.order.filter((id) => {
    const rgb = doc.parts.get(id)?.props.RGB;
    return isRgb(rgb) && sameRgb(rgb, c);
  });
}

/** `c` at the front of `list`, with any equal entry removed and the list capped at 12. */
export function pushRecentColor(list: readonly RGB[], c: RGB): RGB[] {
  return [c, ...list.filter((x) => !sameRgb(x, c))].slice(0, RECENT_MAX);
}

/** Lower-case `#rrggbb`. */
export function rgbToHex(c: RGB): string {
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** `#rrggbb` or `rrggbb`, in any case; anything else is null. */
export function hexToRgb(h: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (m === null) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
