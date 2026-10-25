// Native capture overlay. Community data continues to supply gameplay metadata.
import { isCFrame12 } from '../../src/core/cframe';
import type { CFrame12 } from '../../src/core/types';
import type { RawPart } from './catalog';

export interface RuntimePart {
  obj: string;
  mtl: string;
  primaryPart: string;
  subParts: Record<string, CFrame12>;
  groups: Record<string, string>;
  sockets: Record<
    string,
    {
      side: 'child' | 'parent' | 'both';
      childCFrame?: CFrame12;
      cframe: CFrame12;
      parentPath: string;
      /** The attachment's attributes, as captured (HingeType, MountType, Angle, ...). */
      attributes?: Record<string, unknown>;
    }
  >;
  blockedSockets: string[];
  textureAlphaBlend?: Record<string, boolean>;
}

export interface RuntimeParts {
  meshCoordinateSpace: string;
  parts: Record<string, RuntimePart>;
}

const object = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Fail at the capture boundary rather than generating guessed geometry. */
export function parseRuntimeParts(value: unknown): RuntimeParts {
  if (
    !object(value) ||
    value.format !== 'grambyedit-runtime-parts' ||
    value.version !== 1 ||
    value.meshCoordinateSpace !== 'roblox-primary-part-v1' ||
    !object(value.parts)
  )
    throw new Error('data/runtime_parts.json: unsupported capture format');
  for (const [name, part] of Object.entries(value.parts)) {
    const fail = () => {
      throw new Error(`data/runtime_parts.json: malformed ${name}`);
    };
    if (!object(part)) return fail();
    if (
      typeof part.obj !== 'string' ||
      !part.obj.startsWith('meshes/runtime/parts/') ||
      part.obj.includes('..') ||
      typeof part.mtl !== 'string' ||
      !part.mtl.startsWith('meshes/runtime/parts/') ||
      part.mtl.includes('..') ||
      typeof part.primaryPart !== 'string' ||
      !object(part.subParts) ||
      !object(part.groups) ||
      !object(part.sockets) ||
      !Array.isArray(part.blockedSockets) ||
      !part.blockedSockets.every((x) => typeof x === 'string')
    )
      return fail();
    if (
      !Object.values(part.subParts).every(isCFrame12) ||
      !Object.values(part.groups).every((x) => typeof x === 'string')
    )
      return fail();
    if (
      part.textureAlphaBlend !== undefined &&
      (!object(part.textureAlphaBlend) ||
        !Object.values(part.textureAlphaBlend).every((x) => typeof x === 'boolean'))
    )
      return fail();
    for (const socket of Object.values(part.sockets)) {
      if (
        !object(socket) ||
        !['child', 'parent', 'both'].includes(String(socket.side)) ||
        (socket.childCFrame !== undefined && !isCFrame12(socket.childCFrame)) ||
        (socket.side === 'both' && socket.childCFrame === undefined) ||
        !isCFrame12(socket.cframe) ||
        typeof socket.parentPath !== 'string' ||
        !part.subParts[socket.parentPath] ||
        (socket.attributes !== undefined && !object(socket.attributes))
      )
        return fail();
    }
  }
  return value as unknown as RuntimeParts;
}

/** Native IDs/sides replace inferred inventory; retain known roles and properties. */
export function runtimeRawPart(legacy: RawPart | undefined, native: RuntimePart): RawPart {
  const child: Record<string, object> = {};
  const parent: Record<string, object> = {};
  for (const [id, socket] of Object.entries(native.sockets)) {
    const metadata = legacy?.sockets.child?.[id] ?? legacy?.sockets.parent?.[id] ?? {};
    if (socket.side !== 'parent') child[id] = metadata;
    if (socket.side !== 'child') parent[id] = metadata;
  }
  return {
    sockets: { child, parent },
    pieces: legacy?.pieces ?? null,
    props: legacy?.props ?? null,
    mesh: { obj: native.obj },
  };
}
