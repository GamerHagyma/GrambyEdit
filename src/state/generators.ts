// The Generators panel's state (spec §13.9, §15): the request being built, its cost preview, and the presets
// kept in localStorage. The generators themselves are pure and live in core/generators.
import { computed, signal } from '@preact/signals';
import type { Catalog, Conventions } from '../core/catalog-types';
import { IDENTITY_CF, isCFrame12 } from '../core/cframe';
import {
  buildGeneratedSubDoc,
  SHAPES,
  type GenColor,
  type GenFill,
  type GenOrient,
  type GenRequest,
  type ShapeDef,
  type ShapeId,
  type ShapeInput,
} from '../core/generators';
import { insertSubDoc } from '../core/ops/clipboard';
import { transact } from '../core/ops/transact';
import { isRgb } from '../core/palette';
import { EMPTY_POSES } from '../core/pose';
import { codeSize, formatPercent } from '../core/size';
import type { Doc, Limits, RGB } from '../core/types';
import { loadPref, savePref } from '../storage/prefs';
import { settingsSig } from './settings';

const GEN_ORIENTS: readonly GenOrient[] = ['fixed', 'outward', 'tangent'];
const GEN_AXES: readonly ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
const PRESETS_KEY = 'genPresets';
const WHITE: RGB = [255, 255, 255];

const defaultParams = (def: ShapeDef): Record<string, number | string> =>
  Object.fromEntries(def.params.map((p): [string, number | string] => [p.key, p.default]));

/** `fill` when the shape offers it, else the shape's first fill. */
const fillFor = (def: ShapeDef, fill: GenFill): GenFill =>
  def.fills.includes(fill) ? fill : def.fills[0];

/** The request the panel starts from (spec §15): a ring of Parts on Connectors, outline, fixed, spacing 1. */
function startRequest(): GenRequest {
  const s = settingsSig.value;
  const ring = SHAPES.ring;
  return {
    shape: 'ring',
    input: {
      params: defaultParams(ring),
      fill: fillFor(ring, 'outline'),
      orient: 'fixed',
      spacing: 1,
    },
    element: 'Part',
    host: 'Connector',
    color: { mode: 'single', rgb: s.activeColor },
    transform: IDENTITY_CF,
    posDecimals: s.genPosDecimals,
    rotDecimals: s.genRotDecimals,
    maxElements: 20_000,
  };
}

export const genRequestSig = signal<GenRequest>(startRequest());

/** What the panel previews and generates: the generator's fields, with the precision from Settings as it is now. */
export const liveRequestSig = computed<GenRequest>(() => {
  const s = settingsSig.value;
  return { ...genRequestSig.value, posDecimals: s.genPosDecimals, rotDecimals: s.genRotDecimals };
});

export interface CostPreview {
  addParts: number;
  addChars: number;
  codeBefore: string;
  codeAfter: string;
  partsBefore: number;
  partsAfter: number;
  crossings: string[];
  text: string;
}

const en = (n: number): string => n.toLocaleString('en-US');

/**
 * What `req` adds to `doc`. The sub-doc goes in at the origin inside a scratch transaction and both builds are
 * measured. Poses are not computed: `insertSubDoc` does not read them for a root placement, and a 16K-part build
 * must keep each preview cheap.
 */
export function costPreview(
  doc: Doc,
  cat: Catalog,
  conv: Conventions,
  req: GenRequest,
  limits: Limits,
): { ok: true; cost: CostPreview } | { ok: false; error: string } {
  const built = buildGeneratedSubDoc(req, cat, conv);
  if (!built.ok) return { ok: false, error: built.error };
  if (built.elements === 0) {
    return { ok: false, error: 'This shape has no elements at this spacing.' };
  }
  const before = codeSize(doc);
  const { doc: after } = transact(doc, 'Preview generated shape', (d) =>
    insertSubDoc(d, cat, conv, EMPTY_POSES, built.sub, { root: IDENTITY_CF }),
  );
  const sized = codeSize(after);
  const c0 = before.base64Chars;
  const c1 = sized.base64Chars;
  const partsBefore = doc.order.length;
  const partsAfter = after.order.length;
  const { codeChars, partSoftCap, partWarn } = limits;

  const crossings: string[] = [];
  if (c0 < 0.75 * codeChars && 0.75 * codeChars <= c1) crossings.push('code 75%');
  if (c0 <= codeChars && codeChars < c1) crossings.push('code 100%');
  if (partsBefore <= partSoftCap && partSoftCap < partsAfter) crossings.push('part soft cap');
  if (partsBefore <= partWarn && partWarn < partsAfter) crossings.push('part warning');

  const addParts = built.sub.order.length;
  const addChars = c1 - c0;
  const codeBefore = formatPercent(c0, codeChars);
  const codeAfter = formatPercent(c1, codeChars);
  return {
    ok: true,
    cost: {
      addParts,
      addChars,
      codeBefore,
      codeAfter,
      partsBefore,
      partsAfter,
      crossings,
      text: `+${en(addParts)} parts · +${en(addChars)} chars · code ${codeBefore}% → ${codeAfter}% · parts ${en(partsBefore)} → ${en(partsAfter)}`,
    },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isShapeId = (v: unknown): v is ShapeId => typeof v === 'string' && Object.hasOwn(SHAPES, v);

/** The shape's parameters, each present with its type; keys the shape does not declare are dropped. */
function readParams(def: ShapeDef, v: unknown): Record<string, number | string> | null {
  if (!isRecord(v)) return null;
  const out: Record<string, number | string> = {};
  for (const p of def.params) {
    const x = v[p.key];
    if (!(p.kind === 'text' ? typeof x === 'string' : isNum(x))) return null;
    out[p.key] = x as number | string;
  }
  return out;
}

function readInput(def: ShapeDef, v: unknown): ShapeInput | null {
  if (!isRecord(v)) return null;
  const { params, fill, orient, spacing } = v;
  const p = readParams(def, params);
  const f = def.fills.find((x) => x === fill);
  const o = GEN_ORIENTS.find((x) => x === orient);
  return p !== null && f !== undefined && o !== undefined && isNum(spacing)
    ? { params: p, fill: f, orient: o, spacing }
    : null;
}

function readColor(v: unknown): GenColor | null {
  if (!isRecord(v)) return null;
  const { mode, rgb, from, to, axis, palette, seed } = v;
  const a = GEN_AXES.find((x) => x === axis);
  if (mode === 'single' && isRgb(rgb)) return { mode: 'single', rgb };
  if (mode === 'gradient' && isRgb(from) && isRgb(to) && a !== undefined) {
    return { mode: 'gradient', from, to, axis: a };
  }
  if (
    mode === 'random' &&
    Array.isArray(palette) &&
    palette.length > 0 &&
    palette.every(isRgb) &&
    isNum(seed)
  ) {
    return { mode: 'random', palette, seed };
  }
  return null;
}

/** A stored request, rebuilt field by field, or null when any field is missing or of the wrong type. */
function readRequest(v: unknown): GenRequest | null {
  if (!isRecord(v)) return null;
  const { shape, input, element, host, color, transform, posDecimals, rotDecimals, maxElements } =
    v;
  if (!isShapeId(shape)) return null;
  const readIn = readInput(SHAPES[shape], input);
  const readCol = readColor(color);
  if (
    readIn === null ||
    readCol === null ||
    typeof element !== 'string' ||
    typeof host !== 'string'
  ) {
    return null;
  }
  if (!isCFrame12(transform) || !isInt(posDecimals, 0, 10) || !isInt(rotDecimals, 0, 10))
    return null;
  if (!isInt(maxElements, 1, Number.MAX_SAFE_INTEGER)) return null;
  return {
    shape,
    input: readIn,
    element,
    host,
    color: readCol,
    transform,
    posDecimals,
    rotDecimals,
    maxElements,
  };
}

/** The presets in localStorage. Stored values are untrusted: an entry is kept only when it reads back whole. */
export function loadPresets(): Record<string, GenRequest> {
  const stored = loadPref<unknown>(PRESETS_KEY, {});
  if (!isRecord(stored)) return {};
  const kept: [string, GenRequest][] = [];
  for (const [name, raw] of Object.entries(stored)) {
    const req = readRequest(raw);
    if (req !== null) kept.push([name, req]);
  }
  return Object.fromEntries(kept);
}

export const presetsSig = signal<Readonly<Record<string, GenRequest>>>(loadPresets());

export function savePreset(name: string, req: GenRequest): void {
  const next = { ...presetsSig.value, [name]: req };
  savePref(PRESETS_KEY, next);
  presetsSig.value = next;
}

/** Puts a saved preset into the request. An unknown name changes nothing. */
export function loadPreset(name: string): void {
  if (Object.hasOwn(presetsSig.value, name)) genRequestSig.value = presetsSig.value[name];
}

/** Switches the shape. Its parameters go back to their defaults; the fill stays when the new shape offers it. */
export function setShape(shape: ShapeId): void {
  const cur = genRequestSig.value;
  if (cur.shape === shape) return;
  const def = SHAPES[shape];
  genRequestSig.value = {
    ...cur,
    shape,
    input: { ...cur.input, params: defaultParams(def), fill: fillFor(def, cur.input.fill) },
  };
}

export function setParam(key: string, value: number | string): void {
  const cur = genRequestSig.value;
  genRequestSig.value = {
    ...cur,
    input: { ...cur.input, params: { ...cur.input.params, [key]: value } },
  };
}

export function updateRequest(patch: Partial<GenRequest>): void {
  genRequestSig.value = { ...genRequestSig.value, ...patch };
}

export function updateInput(patch: Partial<ShapeInput>): void {
  const cur = genRequestSig.value;
  genRequestSig.value = { ...cur, input: { ...cur.input, ...patch } };
}

/** Switches the colour mode. The request's first colour carries over; the other colours start white. */
export function setColorMode(mode: GenColor['mode']): void {
  const cur = genRequestSig.value.color;
  const first =
    cur.mode === 'single' ? cur.rgb : cur.mode === 'gradient' ? cur.from : cur.palette[0];
  const color: GenColor =
    mode === 'single'
      ? { mode: 'single', rgb: first }
      : mode === 'gradient'
        ? { mode: 'gradient', from: first, to: WHITE, axis: 'x' }
        : { mode: 'random', palette: [first, WHITE], seed: 1 };
  updateRequest({ color });
}

/** Test helper: the request back to its starting values, and the presets read again from storage. */
export function resetGeneratorsForTests(): void {
  genRequestSig.value = startRequest();
  presetsSig.value = loadPresets();
}
