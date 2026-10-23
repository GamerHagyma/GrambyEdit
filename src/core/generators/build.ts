// A generated shape as a sub-doc (spec §15): one host part carrying one ephemeral point per element, and
// each element mounted on its point. Placing the sub-doc puts the whole shape in a single history entry.
import { Matrix4 } from 'three';
import type { Catalog, Conventions } from '../catalog-types';
import { cfToMatrix4, IDENTITY_CF, roundCf } from '../cframe';
import { pointFrameFor } from '../conventions';
import { socketMatrix, subPartMatrix } from '../pose';
import type { CFrame12, Doc, Json, Part, PartId, Point, RGB, Uuid } from '../types';
import { newUuid } from '../uuid';
import { GenerateLimitError } from './common';
import { SHAPES } from './registry';
import type { ShapeId, ShapeInput } from './types';

export type GenColor =
  | { mode: 'single'; rgb: RGB }
  | { mode: 'gradient'; from: RGB; to: RGB; axis: 'x' | 'y' | 'z' }
  | { mode: 'random'; palette: readonly RGB[]; seed: number };

export interface GenRequest {
  shape: ShapeId;
  input: ShapeInput;
  element: string;
  host: string;
  color: GenColor;
  /** Where the shape's origin sits on the host. */
  transform: CFrame12;
  posDecimals: number;
  rotDecimals: number;
  maxElements: number;
}

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

/** One color per element, in element order. */
function colors(color: GenColor, frames: readonly CFrame12[]): RGB[] {
  if (color.mode === 'single') return frames.map(() => color.rgb);
  if (color.mode === 'random') {
    const next = mulberry32(color.seed);
    const { palette } = color;
    return frames.map(() => palette[Math.floor(next() * palette.length)] ?? [255, 255, 255]);
  }
  const k = color.axis === 'x' ? 0 : color.axis === 'y' ? 1 : 2;
  const along = frames.map((f) => f[k]);
  const lo = Math.min(...along);
  const span = Math.max(...along) - lo;
  return along.map((v) => {
    const t = span > 0 ? (v - lo) / span : 0;
    const mix = (i: number) => Math.round(color.from[i] + (color.to[i] - color.from[i]) * t);
    return [mix(0), mix(1), mix(2)];
  });
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
  const host = { type: req.host, mainPartName: hostDef?.mainPartName ?? req.host };
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

  const partName = host.mainPartName;
  const sub = subPartMatrix(cat, host.type, partName).m;
  const socket = socketMatrix(cat, element.type, mount).m;
  const origin = cfToMatrix4(req.transform);
  const hostWorld = new Matrix4();
  const tints = element.paintable ? colors(req.color, frames) : null;

  const points = new Map<Uuid, Point>();
  const parts = new Map<PartId, Part>();
  frames.forEach((frame, i) => {
    const world = origin.clone().multiply(cfToMatrix4(frame));
    const cframe = roundCf(
      pointFrameFor(hostWorld, sub, world, socket, {}, conv),
      req.posDecimals,
      req.rotDecimals,
    );
    const uuid = newUuid();
    points.set(uuid, { uuid, partName, cframe });
    const id = i + 2;
    const props: Record<string, Json> = tints ? { RGB: [...tints[i]] } : {};
    parts.set(id, {
      id,
      type: element.type,
      conns: [{ self: mount, target: { kind: 'point', part: 1, uuid } }],
      props,
      points: null,
    });
  });
  parts.set(1, { id: 1, type: host.type, conns: [], props: {}, points });
  const order = [1, ...frames.map((_, i) => i + 2)];
  return {
    ok: true,
    sub: { parts, order, layout: new Map([[1, IDENTITY_CF]]), nextId: frames.length + 2 },
    elements: frames.length,
  };
}
