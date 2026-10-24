// The captured socket-geometry file (spec Appendix B) and its merge into the catalog.
import type { Catalog, PartDef, SocketDef } from './catalog-types';
import { isCFrame12 } from './cframe';
import type { CFrame12, SocketId } from './types';

export interface SocketGeometryFile {
  format: 'grambyedit-sockets';
  version: 1;
  captured: string;
  method: string;
  units: 'studs';
  cframeFormat: 'roblox-components';
  frameConvention: 'outward-y';
  relativeTo: 'mesh-origin';
  /** Changes when the mesh origin/basis changes; legacy files have no tag. */
  meshCoordinateSpace?: string;
  parts: Record<
    string,
    { sockets: Record<SocketId, { cframe: CFrame12 }>; subParts?: Record<string, CFrame12> }
  >;
}

export function emptySocketGeometry(): SocketGeometryFile {
  return {
    format: 'grambyedit-sockets',
    version: 1,
    captured: '',
    method: 'socket-workbench',
    units: 'studs',
    cframeFormat: 'roblox-components',
    frameConvention: 'outward-y',
    relativeTo: 'mesh-origin',
    parts: {},
  };
}

const HEADER: readonly (readonly [string, unknown])[] = [
  ['format', 'grambyedit-sockets'],
  ['version', 1],
  ['frameConvention', 'outward-y'],
  ['units', 'studs'],
  ['cframeFormat', 'roblox-components'],
  ['relativeTo', 'mesh-origin'],
];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates untrusted JSON. Metadata strings may be missing; every frame must be well formed. */
export function parseSocketGeometry(
  json: unknown,
): { ok: true; file: SocketGeometryFile } | { ok: false; error: string } {
  if (!isObject(json)) return { ok: false, error: 'not a JSON object' };
  for (const [key, want] of HEADER) {
    if (json[key] !== want) return { ok: false, error: `${key} must be ${JSON.stringify(want)}` };
  }
  if (!isObject(json.parts)) return { ok: false, error: 'parts must be an object' };
  if (
    json.meshCoordinateSpace !== undefined &&
    (typeof json.meshCoordinateSpace !== 'string' || !json.meshCoordinateSpace)
  ) {
    return { ok: false, error: 'meshCoordinateSpace must be a nonempty string' };
  }
  const parts: SocketGeometryFile['parts'] = {};
  for (const [type, entry] of Object.entries(json.parts)) {
    const at = `parts.${type}`;
    if (!isObject(entry) || !isObject(entry.sockets)) {
      return { ok: false, error: `${at}.sockets must be an object` };
    }
    const sockets: Record<SocketId, { cframe: CFrame12 }> = {};
    for (const [id, s] of Object.entries(entry.sockets)) {
      const cframe = isObject(s) ? s.cframe : undefined;
      if (!isCFrame12(cframe)) {
        return { ok: false, error: `${at}.sockets.${id}.cframe must be 12 finite numbers` };
      }
      sockets[id] = { cframe };
    }
    parts[type] = { sockets };
    if (entry.subParts === undefined) continue;
    if (!isObject(entry.subParts)) return { ok: false, error: `${at}.subParts must be an object` };
    const subParts: Record<string, CFrame12> = {};
    for (const [name, cf] of Object.entries(entry.subParts)) {
      if (!isCFrame12(cf)) {
        return { ok: false, error: `${at}.subParts.${name} must be 12 finite numbers` };
      }
      subParts[name] = cf;
    }
    parts[type].subParts = subParts;
  }
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    ok: true,
    file: {
      ...emptySocketGeometry(),
      captured: text(json.captured),
      method: text(json.method),
      ...(typeof json.meshCoordinateSpace === 'string'
        ? { meshCoordinateSpace: json.meshCoordinateSpace }
        : {}),
      parts,
    },
  };
}

export function socketGeometryCompatible(cat: Catalog, file: SocketGeometryFile): boolean {
  return cat.socketGeometrySpace === file.meshCoordinateSpace;
}

/**
 * Overrides catalog frames with captured ones (`frameSource: 'captured'`, sub-parts `approx: false`).
 * Types and sockets the catalog does not know are ignored. Unchanged parts and sockets keep their
 * identity, and the catalog itself is returned when nothing applies.
 */
export function applySocketGeometry(cat: Catalog, file: SocketGeometryFile): Catalog {
  if (!socketGeometryCompatible(cat, file)) return cat;
  let parts: Record<string, PartDef> | null = null;
  for (const [type, entry] of Object.entries(file.parts)) {
    const def = cat.parts[type];
    if (!def) continue;
    let sockets: Record<SocketId, SocketDef> | null = null;
    for (const [id, { cframe }] of Object.entries(entry.sockets)) {
      if (!def.sockets[id]) continue;
      sockets ??= { ...def.sockets };
      sockets[id] = { ...def.sockets[id], frame: cframe, frameSource: 'captured' };
    }
    const subEntries = Object.entries(entry.subParts ?? {});
    if (!sockets && !subEntries.length) continue;
    const subParts = { ...def.subParts };
    for (const [name, cframe] of subEntries) subParts[name] = { cframe, approx: false };
    parts ??= { ...cat.parts };
    parts[type] = {
      ...def,
      sockets: sockets ?? def.sockets,
      subParts: subEntries.length ? subParts : def.subParts,
    };
  }
  return parts ? { ...cat, parts } : cat;
}
