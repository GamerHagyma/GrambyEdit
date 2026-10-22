// Pure pieces of the runtime catalog build (plan Task 7, build rules 2–4 and 10).
import { approxSocketFrame } from '../../src/core/approx';
import {
  pairKey,
  type FrameSource,
  type SocketDef,
  type SocketRole,
  type Vec3,
} from '../../src/core/catalog-types';
import { decode } from '../../src/core/codec';
import type { CFrame12, SocketId } from '../../src/core/types';

/** One part of `data/part_catalog.json`, as far as the build reads it. */
export interface RawSocket {
  readonly role?: string;
  readonly name?: string;
  readonly corpus_count?: number;
}
export interface RawPart {
  readonly sockets: {
    readonly child?: Readonly<Record<SocketId, RawSocket>>;
    readonly parent?: Readonly<Record<SocketId, RawSocket>>;
  };
  readonly pieces: Readonly<Record<SocketId, string>> | null;
  readonly props: Readonly<Record<string, unknown>> | null;
  readonly mesh: { readonly obj: string } | null;
}

const ROLES: ReadonlySet<string> = new Set(['input', 'output', 'conductor', 'mount', 'socket']);
/** `Base` names its sockets by position; they are ordinary parent sockets. */
const POSITIONAL: ReadonlySet<string> = new Set([
  'left',
  'right',
  'front',
  'back',
  'top',
  'bottom',
]);

export function normaliseRole(role: string | undefined): SocketRole {
  if (role === undefined) return null;
  if (ROLES.has(role)) return role as SocketRole;
  return POSITIONAL.has(role) ? 'socket' : null;
}

/** Numeric order (`['4', '6', '10']`), never JSON key order. */
export const byNumber = (a: string, b: string) => Number(a) - Number(b) || a.localeCompare(b);

/**
 * Positions snap to 1e-3 and rotations to 1e-6. The Workshop scene puts Part's sockets 0.000356
 * studs off the faces of the verified 1×1×1 mesh; unsnapped, that drifts 0.36 studs over 1,000 stacked parts.
 */
const clean = (v: readonly number[]): CFrame12 =>
  v.map((x, i) => {
    const s = i < 3 ? 1e3 : 1e6;
    return Math.round(x * s) / s + 0;
  }) as readonly number[] as CFrame12;

/**
 * The Workshop's `Part.tscn` socket transforms, read row-major (spec §24.1). Socket 1 is the ball:
 * it is right-multiplied by Rx(180°) (Y and Z columns negated) so its +Y faces out of the part.
 */
export function workshopFrames(tscn: string): Record<SocketId, CFrame12> {
  const out: Record<SocketId, CFrame12> = {};
  const re = /\[node name="(\d+)" parent="\."[^\]]*\]\s*transform = Transform\(([^)]*)\)/g;
  for (const m of tscn.matchAll(re)) {
    const v = m[2].split(',').map((s) => Number(s.trim()));
    if (v.length !== 12 || v.some((x) => !Number.isFinite(x))) continue;
    const [r00, r01, r02, r10, r11, r12, r20, r21, r22, x, y, z] = v;
    const f = m[1] === '1' ? -1 : 1;
    out[m[1]] = clean([
      x,
      y,
      z,
      r00,
      r01 * f,
      r02 * f,
      r10,
      r11 * f,
      r12 * f,
      r20,
      r21 * f,
      r22 * f,
    ]);
  }
  return out;
}

export interface SocketsResult {
  sockets: Record<SocketId, SocketDef>;
  childSockets: SocketId[];
  parentSockets: SocketId[];
  defaultMount: SocketId | null;
}

/**
 * Rule 2 (sockets, roles, role fixes, pieces), rule 3 without captures (Workshop frames, else
 * approx; captures are applied afterwards) and rule 4 (`defaultMount`).
 */
export function buildSockets(
  raw: RawPart,
  roleFix: Readonly<Record<SocketId, SocketRole>> | undefined,
  bbox: { readonly min: Vec3; readonly max: Vec3 },
  workshop: Readonly<Record<SocketId, CFrame12>> | null,
): SocketsResult {
  const child = raw.sockets.child ?? {};
  const parent = raw.sockets.parent ?? {};
  const childSockets = Object.keys(child).sort(byNumber);
  const parentSockets = Object.keys(parent).sort(byNumber);
  const sockets: Record<SocketId, SocketDef> = {};
  for (const id of [...new Set([...childSockets, ...parentSockets])].sort(byNumber)) {
    const c = child[id];
    const p = parent[id];
    const side = c && p ? 'both' : c ? 'child' : 'parent';
    const name = c?.name ?? p?.name ?? null;
    const role = roleFix && id in roleFix ? roleFix[id] : normaliseRole(c?.role ?? p?.role);
    const fixed = workshop?.[id];
    const frameSource: FrameSource = fixed ? 'workshop' : 'approx';
    sockets[id] = {
      side,
      role,
      name,
      piece: raw.pieces?.[id] ?? null,
      frame: fixed ?? approxSocketFrame({ ...bbox, socket: id, side, name, parentSockets }),
      frameSource,
    };
  }
  const mount = childSockets.find((id) => sockets[id].role === 'mount');
  const busiest = [...childSockets].sort(
    (a, b) => (child[b].corpus_count ?? 0) - (child[a].corpus_count ?? 0),
  )[0];
  return { sockets, childSockets, parentSockets, defaultMount: mount ?? busiest ?? null };
}

/**
 * Rule 10: corpus joint counts per `pairKey`, over connections with an in-range integer parent
 * index and a parent socket that is not a uuid. Lines that do not decode are skipped.
 */
export function countPairs(lines: readonly string[]): Record<string, number> {
  const pairs: Record<string, number> = {};
  for (const line of lines) {
    const r = decode(line);
    if (!r.ok) continue;
    const entries = r.value;
    for (const e of entries) {
      if (!Array.isArray(e) || typeof e[0] !== 'string' || !Array.isArray(e[1])) continue;
      for (const c of e[1]) {
        if (!Array.isArray(c) || c.length !== 3) continue;
        const [cs, ps, pi] = c;
        if (typeof pi !== 'number' || !Number.isInteger(pi) || pi < 1 || pi > entries.length)
          continue;
        if (typeof ps === 'string' && ps.startsWith('{')) continue;
        const target = entries[pi - 1];
        if (!Array.isArray(target) || typeof target[0] !== 'string') continue;
        const key = pairKey(e[0], String(cs), target[0], String(ps));
        pairs[key] = (pairs[key] ?? 0) + 1;
      }
    }
  }
  return pairs;
}
