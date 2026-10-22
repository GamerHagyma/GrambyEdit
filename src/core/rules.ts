// Structural rules (spec §7): what a tool may attach where, and the Issues list.
import type { Catalog, PartDef, SocketRole } from './catalog-types';
import { orderIndex } from './doc';
import { graphIndex, poseDescendants, roots } from './graph';
import type {
  Conn,
  Doc,
  Issue,
  IssueCode,
  Json,
  Limits,
  PartId,
  Severity,
  SocketId,
  Uuid,
  Verdict,
} from './types';

const OK: Verdict = { ok: true };
/** Types that dangle without an ephemeral mount (I-RELAY-UNMOUNTED). */
const RELAY_TYPES = new Set(['Wire', 'Splitter_1', 'Splitter_2', 'Splitter_3', 'Splitter_4']);
/** Above this many parts, a build needs an active Anchor (I-NO-ANCHOR). */
const ANCHOR_ABOVE = 200;

/** Own-key lookup, so a key such as "constructor" never reaches Object.prototype. */
function entry<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

const defOf = (cat: Catalog, type: string): PartDef | undefined => entry(cat.parts, type);

/** The 1-based export index of a part: the parent index a self-joint carries (I-SELF-JOINT). */
const exportIndex = (doc: Doc, id: PartId): number => orderIndex(doc).get(id)! + 1;

/** How every issue names a part: `Type (#index)`. */
const label = (doc: Doc, id: PartId): string =>
  `${doc.parts.get(id)!.type} (#${exportIndex(doc, id)})`;

const issue = (
  code: IssueCode,
  severity: Severity,
  parts: readonly PartId[],
  message: string,
): Issue => ({ code, severity, parts, message });

const isSignal = (role: SocketRole): boolean =>
  role === 'input' || role === 'output' || role === 'conductor';

/** The catalog role of a socket. Unknown types and sockets have none. */
export function socketRole(cat: Catalog, type: string, socket: SocketId): SocketRole {
  const def = defOf(cat, type);
  return def === undefined ? null : (entry(def.sockets, socket)?.role ?? null);
}

/** Every socket of `socket`'s piece, the socket itself included. A socket with no piece is its own piece. */
export function pieceSockets(def: PartDef | undefined, socket: SocketId): SocketId[] {
  const pieces = def?.pieces;
  const piece = pieces ? entry(pieces, socket) : undefined;
  if (!pieces || piece === undefined) return [socket];
  return Object.keys(pieces).filter((s) => pieces[s] === piece);
}

/** The sockets of `part` that carry an ephemeral mount: a conn with a point target. */
export function mountSockets(doc: Doc, part: PartId): SocketId[] {
  const owner = doc.parts.get(part);
  if (owner === undefined) return [];
  return [...new Set(owner.conns.filter((c) => c.target.kind === 'point').map((c) => c.self))];
}

/**
 * The two sockets of a self-joint: a raw conn `[a, b, own index]` with integer-or-string ids (I-SELF-JOINT).
 * Every other conn gives [].
 */
function selfJointSockets(conn: Conn, own: number): readonly SocketId[] {
  if (conn.target.kind !== 'raw') return [];
  const [a, b, index] = conn.target.triple;
  const isId = (v: Json): boolean => typeof v === 'string' || Number.isInteger(v);
  return isId(a) && isId(b) && index === own ? [String(a), String(b)] : [];
}

/** §7: a socket of `part` is used when a conn has it as `self`, a joint targets it, or a self-joint names it. */
export function isSocketUsed(doc: Doc, part: PartId, socket: SocketId): boolean {
  const owner = doc.parts.get(part);
  if (owner === undefined) return false;
  const own = exportIndex(doc, part);
  const onOwn = owner.conns.some(
    (c) => c.self === socket || selfJointSockets(c, own).includes(socket),
  );
  return onOwn || (graphIndex(doc).socketUsers.get(`${part}:${socket}`)?.length ?? 0) > 0;
}

/** §7: a signal joint joins output to input, or a conductor to any signal socket. */
export function isSignalJoint(
  cat: Catalog,
  childType: string,
  childSocket: SocketId,
  parentType: string,
  parentSocket: SocketId,
): boolean {
  const child = socketRole(cat, childType, childSocket);
  const parent = socketRole(cat, parentType, parentSocket);
  if (child === 'conductor' || parent === 'conductor') return isSignal(child) && isSignal(parent);
  return (child === 'output' && parent === 'input') || (child === 'input' && parent === 'output');
}

const socketUsed = (type: string, socket: SocketId): Verdict => ({
  ok: false,
  code: 'socket-used',
  message: `Socket ${socket} of this ${type} already has a joint.`,
});

/** §7.1 step 3: no socket of `socket`'s piece may carry an ephemeral mount of `part`. */
function pieceClear(doc: Doc, def: PartDef | undefined, part: PartId, socket: SocketId): Verdict {
  const piece = def?.pieces ? entry(def.pieces, socket) : undefined;
  const sockets = pieceSockets(def, socket);
  const mounted = mountSockets(doc, part).find((m) => sockets.includes(m));
  if (mounted === undefined || piece === undefined) return OK;
  return {
    ok: false,
    code: 'piece-mounted',
    message: `Socket ${socket} is unavailable: piece ${piece} of this ${doc.parts.get(part)!.type} is consumed by its ephemeral mount on socket ${mounted}.`,
  };
}

/** §7.1: may `socket` of `part` take a child? A mount needs its whole piece free. */
export function canBeChild(
  doc: Doc,
  cat: Catalog,
  part: PartId,
  socket: SocketId,
  kind: 'joint' | 'mount',
): Verdict {
  const { type } = doc.parts.get(part)!;
  const def = defOf(cat, type);
  if (def && !def.childSockets.includes(socket)) {
    return {
      ok: false,
      code: 'not-child-socket',
      message: `Socket ${socket} is not a child-side socket of ${type}.`,
    };
  }
  if (isSocketUsed(doc, part, socket)) return socketUsed(type, socket);
  const clear = pieceClear(doc, def, part, socket);
  if (!clear.ok || kind === 'joint') return clear;
  for (const other of pieceSockets(def, socket)) {
    if (other !== socket && isSocketUsed(doc, part, other)) {
      return {
        ok: false,
        code: 'piece-busy',
        message: `Socket ${socket} cannot carry a mount: socket ${other} of the same piece already has a joint.`,
      };
    }
  }
  return OK;
}

/** §7.1: may `socket` of `part` take a parent joint? */
export function canBeParent(doc: Doc, cat: Catalog, part: PartId, socket: SocketId): Verdict {
  const { type } = doc.parts.get(part)!;
  const def = defOf(cat, type);
  if (def && !def.parentSockets.includes(socket)) {
    return {
      ok: false,
      code: 'not-parent-socket',
      message: `Socket ${socket} is not a parent-side socket of ${type}.`,
    };
  }
  if (isSocketUsed(doc, part, socket)) return socketUsed(type, socket);
  return pieceClear(doc, def, part, socket);
}

/** §7.1: is point `uuid` of `host` free to carry a part? */
export function canTakeChild(doc: Doc, host: PartId, uuid: Uuid): Verdict {
  const owner = doc.parts.get(host);
  if (owner === undefined) {
    return {
      ok: false,
      code: 'point-missing',
      message: `Point ${uuid} does not exist: its part is not in this build.`,
    };
  }
  if (!owner.points?.has(uuid)) {
    return {
      ok: false,
      code: 'point-missing',
      message: `Point ${uuid} does not exist on this ${owner.type}.`,
    };
  }
  if (graphIndex(doc).pointUsers.has(`${host}:${uuid}`)) {
    return { ok: false, code: 'point-used', message: `Point ${uuid} already carries a part.` };
  }
  return OK;
}

/** Every issue of §7.2 for `doc`. `codeLength` is the length of the exported code. */
export function validate(doc: Doc, cat: Catalog, limits: Limits, codeLength: number): Issue[] {
  return [
    ...limitIssues(doc, limits, codeLength),
    ...partIssues(doc, cat),
    ...connIssues(doc, cat),
    ...jointIssues(doc, cat),
    ...pointIssues(doc),
    ...cycleIssues(doc),
  ];
}

/** Whole-build issues: code length, part count and the anchor rule. */
function limitIssues(doc: Doc, limits: Limits, codeLength: number): Issue[] {
  const out: Issue[] = [];
  const count = doc.order.length;
  if (codeLength > limits.codeChars) {
    out.push(
      issue(
        'E-CODE-LIMIT',
        'error',
        [],
        `Code length ${codeLength} is over the limit of ${limits.codeChars}.`,
      ),
    );
  }
  if (count > limits.partWarn) {
    out.push(
      issue(
        'W-PART-LIMIT',
        'warning',
        [],
        `Build has ${count} parts: beyond tested (over ${limits.partWarn}).`,
      ),
    );
  } else if (count > limits.partSoftCap) {
    out.push(
      issue(
        'W-PART-LIMIT',
        'warning',
        [],
        `Build has ${count} parts, over the soft cap of ${limits.partSoftCap}.`,
      ),
    );
  }
  const anchored = [...doc.parts.values()].some(
    (p) => p.type === 'Anchor' && p.props.Activated === true,
  );
  if (count > ANCHOR_ABOVE && !anchored) {
    out.push(
      issue(
        'I-NO-ANCHOR',
        'info',
        [],
        `Build has more than ${ANCHOR_ABOVE} parts and no Anchor with Activated set to true.`,
      ),
    );
  }
  return out;
}

/** E-REF: a raw conn that is not a self-joint, or a socket or point conn whose part is missing. */
function isBroken(doc: Doc, conn: Conn, own: number): boolean {
  return conn.target.kind === 'raw'
    ? selfJointSockets(conn, own).length === 0
    : !doc.parts.has(conn.target.part);
}

/** Issues about one part: unknown types, broken and self-joint conns, unused points, relays without a mount. */
function partIssues(doc: Doc, cat: Catalog): Issue[] {
  const out: Issue[] = [];
  const { pointUsers } = graphIndex(doc);
  for (const id of doc.order) {
    const part = doc.parts.get(id)!;
    const own = exportIndex(doc, id);
    if (defOf(cat, part.type) === undefined) {
      out.push(
        issue(
          'W-TYPE-UNKNOWN',
          'warning',
          [id],
          `Unknown part type "${part.type}" (#${own}): kept as-is, drawn as a placeholder.`,
        ),
      );
    }
    const broken = part.conns.filter((c) => isBroken(doc, c, own)).length;
    if (broken > 0) {
      out.push(
        issue(
          'E-REF',
          'error',
          [id],
          `${label(doc, id)} has ${broken} connection(s) that cannot be read or that point at a missing part.`,
        ),
      );
    }
    const selfJoints = part.conns.filter((c) => selfJointSockets(c, own).length > 0).length;
    if (selfJoints > 0) {
      out.push(
        issue(
          'I-SELF-JOINT',
          'info',
          [id],
          `${label(doc, id)} has ${selfJoints} joint(s) to its own sockets: kept as-is.`,
        ),
      );
    }
    const unused = [...(part.points?.keys() ?? [])].filter(
      (uuid) => !pointUsers.has(`${id}:${uuid}`),
    ).length;
    if (unused > 0) {
      out.push(
        issue(
          'I-POINT-UNUSED',
          'info',
          [id],
          `${label(doc, id)} has ${unused} unused point(s), each wasting about 110 characters.`,
        ),
      );
    }
    if (RELAY_TYPES.has(part.type) && !part.conns.some((c) => c.target.kind === 'point')) {
      out.push(
        issue(
          'I-RELAY-UNMOUNTED',
          'info',
          [id],
          `${label(doc, id)} has no ephemeral mount, so it dangles.`,
        ),
      );
    }
  }
  return out;
}

/** Issues about one conn: undeclared points, sockets the catalog does not list, joints between two inputs or two outputs. */
function connIssues(doc: Doc, cat: Catalog): Issue[] {
  const out: Issue[] = [];
  for (const id of doc.order) {
    const owner = doc.parts.get(id)!;
    const ownerDef = defOf(cat, owner.type);
    for (const conn of owner.conns) {
      const { target } = conn;
      if (target.kind === 'raw' || !doc.parts.has(target.part)) continue;
      const host = doc.parts.get(target.part)!;
      if (ownerDef && !ownerDef.childSockets.includes(conn.self)) {
        out.push(
          issue(
            'W-SOCKET-UNKNOWN',
            'warning',
            [id],
            `Socket ${conn.self} is not in the catalog for ${label(doc, id)}.`,
          ),
        );
      }
      if (target.kind === 'point') {
        if (!host.points?.has(target.uuid)) {
          out.push(
            issue(
              'E-UUID',
              'error',
              [id, target.part],
              `${label(doc, id)} mounts on point ${target.uuid}, which ${label(doc, target.part)} does not declare.`,
            ),
          );
        }
        continue;
      }
      const hostDef = defOf(cat, host.type);
      if (hostDef && !hostDef.parentSockets.includes(target.socket)) {
        out.push(
          issue(
            'W-SOCKET-UNKNOWN',
            'warning',
            [id, target.part],
            `Socket ${target.socket} is not in the catalog for ${label(doc, target.part)}.`,
          ),
        );
      }
      const role = socketRole(cat, owner.type, conn.self);
      if (
        (role === 'input' || role === 'output') &&
        role === socketRole(cat, host.type, target.socket)
      ) {
        out.push(
          issue(
            'I-ROLE',
            'info',
            [id, target.part],
            `Socket ${conn.self} of ${label(doc, id)} and socket ${target.socket} of ${label(doc, target.part)} are both ${role}s.`,
          ),
        );
      }
    }
  }
  return out;
}

/** E-MATE and E-TEAR, from the joints that land on each socket of each part. */
function jointIssues(doc: Doc, cat: Catalog): Issue[] {
  const uses = new Map<string, { part: PartId; socket: SocketId; joints: number }>();
  const touch = (part: PartId, socket: SocketId): void => {
    const key = `${part}:${socket}`;
    const use = uses.get(key);
    if (use === undefined) uses.set(key, { part, socket, joints: 1 });
    else use.joints += 1;
  };
  for (const id of doc.order) {
    const own = exportIndex(doc, id);
    for (const conn of doc.parts.get(id)!.conns) {
      const { target } = conn;
      if (target.kind === 'socket') {
        touch(id, conn.self);
        if (doc.parts.has(target.part)) touch(target.part, target.socket);
      } else if (target.kind === 'raw') {
        for (const socket of new Set(selfJointSockets(conn, own))) touch(id, socket);
      }
    }
  }
  const out: Issue[] = [];
  for (const { part, socket, joints } of uses.values()) {
    if (joints > 1) {
      out.push(
        issue(
          'E-MATE',
          'error',
          [part],
          `${label(doc, part)} has ${joints} joints on socket ${socket}.`,
        ),
      );
    }
  }
  for (const id of doc.order) {
    const def = defOf(cat, doc.parts.get(id)!.type);
    for (const mount of mountSockets(doc, id)) {
      const joint = pieceSockets(def, mount).find((s) => uses.has(`${id}:${s}`));
      if (joint !== undefined) {
        out.push(
          issue(
            'E-TEAR',
            'error',
            [id],
            `${label(doc, id)} has an ephemeral mount on socket ${mount} and a joint on socket ${joint} of the same piece.`,
          ),
        );
      }
    }
  }
  return out;
}

/** E-POINT-SHARED: a point that more than one conn targets. */
function pointIssues(doc: Doc): Issue[] {
  const out: Issue[] = [];
  for (const refs of graphIndex(doc).pointUsers.values()) {
    const first = refs[0];
    const { target } = doc.parts.get(first.child)!.conns[first.index];
    if (refs.length < 2 || target.kind !== 'point' || !doc.parts.has(target.part)) continue;
    const children = refs.map((r) => r.child);
    out.push(
      issue(
        'E-POINT-SHARED',
        'error',
        [target.part, ...children],
        `Point ${target.uuid} of ${label(doc, target.part)} carries ${refs.length} parts; a point takes one.`,
      ),
    );
  }
  return out;
}

/** W-CYCLE: parts that no root reaches through pose conns. They sit on a loop, or hang from a missing part. */
function cycleIssues(doc: Doc): Issue[] {
  const reached = new Set<PartId>();
  for (const root of roots(doc)) {
    reached.add(root);
    for (const id of poseDescendants(doc, root)) reached.add(id);
  }
  const stranded = doc.order.filter((id) => !reached.has(id));
  if (stranded.length === 0) return [];
  const list = stranded.map((id) => label(doc, id)).join(', ');
  return [
    issue(
      'W-CYCLE',
      'warning',
      stranded,
      `No root reaches these parts through first connections (a loop, or a missing part): ${list}.`,
    ),
  ];
}
