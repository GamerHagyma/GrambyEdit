// The runtime catalog and mesh-pack contract (spec §5.2).
import type { CFrame12, Json, RGB, SocketId } from './types';

export type Vec3 = readonly [number, number, number];

export const CATEGORIES = [
  'Structure',
  'Vehicle',
  'Logic',
  'Sensors & Input',
  'Motion',
  'Weapons',
  'Fun & Misc',
] as const;
export type Category = (typeof CATEGORIES)[number];

export type SocketRole = 'input' | 'output' | 'conductor' | 'mount' | 'socket' | null;
export type FrameSource = 'captured' | 'workshop' | 'approx';

export interface SocketDef {
  readonly side: 'child' | 'parent' | 'both';
  readonly role: SocketRole;
  readonly name: string | null;
  readonly piece: string | null;
  /** Outward: local +Y points out of the part. */
  readonly frame: CFrame12;
  readonly frameSource: FrameSource;
}

/**
 * One separately placed body of a multi-piece part (D-F3): a Wire end, a splitter circle, a button's
 * base. `anchor` picks its mesh pieces (`splitBodies`); `pivot` (part space) is what `Orientation`
 * turns it about.
 */
export interface BodyDef {
  readonly name: string;
  readonly sockets: readonly SocketId[];
  readonly anchor: Vec3;
  readonly pivot: Vec3;
}

export interface MeshRef {
  readonly id: number;
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface PartDef {
  readonly type: string;
  readonly category: Category;
  readonly tooltip: string | null;
  readonly paintable: boolean;
  readonly corpusCount: number;
  readonly sockets: Readonly<Record<SocketId, SocketDef>>;
  /** Sorted numerically. */
  readonly childSockets: readonly SocketId[];
  /** Sorted numerically. */
  readonly parentSockets: readonly SocketId[];
  /** Socket used when mounting on a point or placing; `null` = root-only part (Chassis). */
  readonly defaultMount: SocketId | null;
  readonly pieces: Readonly<Record<SocketId, string>> | null;
  /** Bodies placed separately, the default lead first; absent or null for one-piece parts. */
  readonly bodies?: readonly BodyDef[] | null;
  /** The `partName` written into new points on this host. */
  readonly mainPartName: string;
  readonly subParts: Readonly<
    Record<string, { readonly cframe: CFrame12; readonly approx: boolean }>
  >;
  readonly props: readonly string[];
  readonly mesh: MeshRef | null;
}

export type PropWidget =
  'bool' | 'number' | 'int' | 'string' | 'rgb' | 'key' | 'text' | 'orientation';

export interface PropMeta {
  readonly widget: PropWidget;
  readonly label: string;
  readonly step?: number;
  readonly min?: number;
  readonly max?: number;
  readonly default?: Json;
  readonly description?: string;
}

export interface Conventions {
  readonly mating: 'rx180' | 'rz180';
  readonly orientationOrder: 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX';
  readonly orientationOnPoints: boolean;
  /**
   * What `Orientation` turns about: the part's own origin after mating (`'part'`, as the in-game rotate
   * tool turns parts about their centre), or the parent socket before mating (`'socket'`, the v1 guess).
   */
  readonly orientationPivot: 'part' | 'socket';
}

export interface Catalog {
  readonly version: string;
  readonly parts: Readonly<Record<string, PartDef>>;
  /** Corpus joint counts keyed by `pairKey`. */
  readonly pairs: Readonly<Record<string, number>>;
  readonly propMeta: Readonly<Record<string, PropMeta>>;
  readonly conventions: Conventions;
}

export function pairKey(
  childType: string,
  childSocket: SocketId,
  parentType: string,
  parentSocket: SocketId,
): string {
  return `${childType}.${childSocket}>${parentType}.${parentSocket}`;
}

export interface MeshGroup {
  readonly subPart: string;
  readonly color: RGB;
  readonly paintable: boolean;
  readonly start: number;
  readonly count: number;
}

export interface MeshEntry {
  readonly type: string;
  readonly vertexOffset: number;
  readonly vertexCount: number;
  readonly indexOffset: number;
  readonly indexCount: number;
  readonly groups: readonly MeshGroup[];
}

export interface Manifest {
  readonly version: string;
  /** Each section is `[byteOffset, byteLength]` into `parts.bin`. */
  readonly sections: {
    readonly positions: readonly [number, number];
    readonly normals: readonly [number, number];
    readonly colors: readonly [number, number];
    readonly indices: readonly [number, number];
  };
  readonly meshes: readonly MeshEntry[];
}
