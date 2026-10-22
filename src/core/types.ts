// The central contract (spec §6). Every layer imports these names; change them only with the plan.

export type PartId = number;
export type SocketId = string;
export type Uuid = string;
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type RGB = readonly [number, number, number];
/** x, y, z, then r00…r22 row-major: Roblox `CFrame:GetComponents()` order. */
export type CFrame12 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type ConnTarget =
  | { readonly kind: 'socket'; readonly part: PartId; readonly socket: SocketId }
  | { readonly kind: 'point'; readonly part: PartId; readonly uuid: Uuid }
  | { readonly kind: 'raw'; readonly triple: readonly Json[] };

export interface Conn {
  readonly self: SocketId;
  readonly target: ConnTarget;
}

export interface Point {
  readonly uuid: Uuid;
  readonly partName: string;
  readonly cframe: CFrame12;
}

export interface Part {
  readonly id: PartId;
  readonly type: string;
  /** `conns[0]` decides the pose. */
  readonly conns: readonly Conn[];
  /** Every prop except `EphemeralAttachments`, key order kept. */
  readonly props: Readonly<Record<string, Json>>;
  /** `null` = key absent; an empty map is written as `[]`. */
  readonly points: ReadonlyMap<Uuid, Point> | null;
}

export interface Doc {
  readonly parts: ReadonlyMap<PartId, Part>;
  /** Export order: the index in the code is position + 1. */
  readonly order: readonly PartId[];
  /** Editor-only world pose of root parts. */
  readonly layout: ReadonlyMap<PartId, CFrame12>;
  readonly nextId: PartId;
}

export const EMPTY_DOC: Doc = { parts: new Map(), order: [], layout: new Map(), nextId: 1 };

export type Severity = 'error' | 'warning' | 'info';
export type IssueCode =
  | 'E-REF'
  | 'E-UUID'
  | 'E-MATE'
  | 'E-TEAR'
  | 'E-POINT-SHARED'
  | 'E-CODE-LIMIT'
  | 'W-SOCKET-UNKNOWN'
  | 'W-TYPE-UNKNOWN'
  | 'W-CYCLE'
  | 'W-PART-LIMIT'
  | 'I-POINT-UNUSED'
  | 'I-NO-ANCHOR'
  | 'I-RELAY-UNMOUNTED'
  | 'I-ROLE'
  | 'I-SELF-JOINT';

export interface Issue {
  readonly code: IssueCode;
  readonly severity: Severity;
  readonly parts: readonly PartId[];
  readonly message: string;
}

export type Verdict =
  { readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string };

export interface Limits {
  readonly codeChars: number;
  readonly partSoftCap: number;
  readonly partWarn: number;
}

export const DEFAULT_LIMITS: Limits = {
  codeChars: 8_000_000,
  partSoftCap: 8_000,
  partWarn: 16_000,
};

export type PointKey = `${number}:${string}`;
