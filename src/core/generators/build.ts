// A generated shape as a sub-doc (spec §15): one host part carrying one ephemeral point per element, and
// each element mounted on its point. Placing the sub-doc puts the whole shape in a single history entry.
import { Matrix4 } from 'three';
import type { Catalog, Conventions } from '../catalog-types';
import { cfToMatrix4, IDENTITY_CF, roundCf } from '../cframe';
import { pointFrameFor } from '../conventions';
import { childSocketMatrix, subPartMatrix } from '../pose';
import type { CFrame12, Doc, Json, Part, PartId, Point, RGB, SocketId, Uuid } from '../types';
import { newUuid } from '../uuid';
import { GenerateLimitError } from './common';
import { SHAPES } from './registry';
import type { ShapeId, ShapeInput } from './types';

/** How elements are coloured: one colour, a gradient along an axis, or a seeded random palette. */
export type Tint<A extends string> =
  | { mode: 'single'; rgb: RGB }
  | { mode: 'gradient'; from: RGB; to: RGB; axis: A }
  | { mode: 'random'; palette: readonly RGB[]; seed: number };

export type GenColor = Tint<'x' | 'y' | 'z'>;

export interface GenRequest {
  shape: ShapeId;
  input: ShapeInput;
  element: string;
  host: string;
  color: GenColor;
  /** False leaves RGB unset, using native part colors. Missing retains existing preset behavior. */
  colorEnabled?: boolean;
  /** Where the shape's origin sits on the host. */
  transform: CFrame12;
  posDecimals: number;
  rotDecimals: number;
  maxElements: number;
}

const WHITE: RGB = [255, 255, 255];
const AXIS = { x: 0, y: 1, z: 2 } as const;

/** Seeded 32-bit PRNG (mulberry32): the same seed gives the same sequence in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One colour per element, in element order. `along(axis, i)` places element `i` on the gradient's axis;
 * the lowest gets `from` and the highest `to`.
 */
export function tintColors<A extends string>(
  tint: Tint<A>,
  n: number,
  along: (axis: A, i: number) => number,
): RGB[] {
  if (tint.mode === 'single') return Array.from({ length: n }, () => tint.rgb);
  if (tint.mode === 'random') {
    const next = mulberry32(tint.seed);
    const { palette } = tint;
    return Array.from({ length: n }, () => palette[Math.floor(next() * palette.length)] ?? WHITE);
  }
  const at = Array.from({ length: n }, (_, i) => along(tint.axis, i));
  const lo = Math.min(...at);
  const span = Math.max(...at) - lo;
  return at.map((v) => {
    const t = span > 0 ? (v - lo) / span : 0;
    const mix = (i: number) => Math.round(tint.from[i] + (tint.to[i] - tint.from[i]) * t);
    return [mix(0), mix(1), mix(2)];
  });
}

/** `tint` in another mode: its first colour carries over, the other colours start white. */
export function withTintMode<A extends string>(
  tint: Tint<A>,
  mode: Tint<A>['mode'],
  axis: A,
): Tint<A> {
  const first =
    tint.mode === 'single' ? tint.rgb : tint.mode === 'gradient' ? tint.from : tint.palette[0];
  if (mode === 'single') return { mode, rgb: first };
  if (mode === 'gradient') return { mode, from: first, to: WHITE, axis };
  return { mode, palette: [first, WHITE], seed: 1 };
}

/**
 * A host part carrying one new point per frame, with an `element` mounted on each. `frames` are the
 * elements' part frames in the host's part space; each point frame is the exact inverse of the mount
 * (§9.3), so the elements land where the frames say.
 */
export function mountSubDoc(
  cat: Catalog,
  conv: Conventions,
  host: { readonly type: string; readonly partName: string },
  element: { readonly type: string; readonly mount: SocketId },
  frames: readonly Matrix4[],
  tints: readonly RGB[] | null,
  decimals: { readonly pos: number; readonly rot: number },
): Doc {
  const sub = subPartMatrix(cat, host.type, host.partName).m;
  const socket = childSocketMatrix(cat, element.type, element.mount, 'point').m;
  const hostWorld = new Matrix4();
  const points = new Map<Uuid, Point>();
  const parts = new Map<PartId, Part>();
  frames.forEach((world, i) => {
    const cframe = roundCf(
      pointFrameFor(hostWorld, sub, world, socket, {}, conv),
      decimals.pos,
      decimals.rot,
    );
    const uuid = newUuid();
    points.set(uuid, { uuid, partName: host.partName, cframe });
    const id = i + 2;
    const props: Record<string, Json> = tints ? { RGB: [...tints[i]] } : {};
    parts.set(id, {
      id,
      type: element.type,
      conns: [{ self: element.mount, target: { kind: 'point', part: 1, uuid } }],
      props,
      points: null,
    });
  });
  parts.set(1, { id: 1, type: host.type, conns: [], props: {}, points });
  const order = [1, ...frames.map((_, i) => i + 2)];
  return { parts, order, layout: new Map([[1, IDENTITY_CF]]), nextId: frames.length + 2 };
}

export function buildGeneratedSubDoc(
  req: GenRequest,
  cat: Catalog,
  conv: Conventions,
): { ok: true; sub: Doc; elements: number } | { ok: false; error: string } {
  const element = Object.hasOwn(cat.parts, req.element) ? cat.parts[req.element] : undefined;
  const mount = element?.defaultMount ?? null;
  if (!element || mount === null) {
    return {
      ok: false,
      error: `"${req.element}" cannot be mounted on a point: it has no child socket.`,
    };
  }
  // Any part type can host points (spec §7); an unknown type is a placeholder with the default names.
  const hostDef = Object.hasOwn(cat.parts, req.host) ? cat.parts[req.host] : undefined;
  const host = { type: req.host, partName: hostDef?.mainPartName ?? req.host };
  let frames: CFrame12[];
  try {
    frames = SHAPES[req.shape].generate(req.input);
  } catch (e) {
    if (e instanceof GenerateLimitError) return { ok: false, error: e.message };
    throw e;
  }
  if (frames.length > req.maxElements) {
    return {
      ok: false,
      error: `This shape would create ${frames.length} parts; the limit is ${req.maxElements}.`,
    };
  }

  const origin = cfToMatrix4(req.transform);
  const worlds = frames.map((f) => origin.clone().multiply(cfToMatrix4(f)));
  const tints =
    element.paintable && req.colorEnabled !== false
      ? tintColors(req.color, frames.length, (axis, i) => frames[i][AXIS[axis]])
      : null;
  const sub = mountSubDoc(cat, conv, host, { type: element.type, mount }, worlds, tints, {
    pos: req.posDecimals,
    rot: req.rotDecimals,
  });
  return { ok: true, sub, elements: frames.length };
}
