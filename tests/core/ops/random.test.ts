import { transact, applyPatch } from '../../../src/core/ops/transact';
import type { Draft, Patch } from '../../../src/core/ops/transact';
import { addPart, deleteParts } from '../../../src/core/ops/parts';
import { addConn, detach, draftDoc, makePoseJoint, removeConn } from '../../../src/core/ops/conns';
import { addPoint, deletePoint } from '../../../src/core/ops/points';
import { paint } from '../../../src/core/ops/paint';
import { computePoses } from '../../../src/core/pose';
import type { Poses } from '../../../src/core/pose';
import { DEFAULT_CONVENTIONS } from '../../../src/core/conventions';
import { checkInvariants } from '../../../src/core/invariants';
import { canBeChild, canBeParent, canTakeChild, validate } from '../../../src/core/rules';
import { fromEntries } from '../../../src/core/doc';
import { DEFAULT_LIMITS } from '../../../src/core/types';
import type { CFrame12, Conn, Json, PartId } from '../../../src/core/types';
import { APPENDIX_B_JSON } from '../../fixtures/spec-codes';
import { mulberry32 } from '../../helpers/random';
import { MINI } from '../../helpers/catalog';
import { mount, sock } from '../../helpers/doc';

/** Types the growing ops pick from. Splitter_2 and Wire are relays: their pieces carry faces. */
const NEW_TYPES = ['Part', 'Splitter_2', 'Wire'];

const pick = <T>(xs: readonly T[], rnd: () => number): T | undefined =>
  xs.length === 0 ? undefined : xs[Math.floor(rnd() * xs.length)];

/** One random edit, through the public ops only. Refused joints change nothing, as the tools do. */
function applyRandomOp(d: Draft, op: string, rnd: () => number, poses: Poses): void {
  const typeOf = (id: PartId) => MINI.parts[d.get(id)!.type];
  // A growing op needs a host. A build without one gets a root Base, so the build never dies out.
  const hostOf = (id: PartId): boolean =>
    op === 'addOnPoint'
      ? typeOf(id).props.includes('EphemeralAttachments')
      : typeOf(id).parentSockets.length > 0;
  if ((op === 'addOnSocket' || op === 'addOnPoint') && ![...d.order()].some(hostOf)) {
    addPart(d, 'Base');
  }
  const ids = [...d.order()];
  switch (op) {
    case 'addOnSocket': {
      const host = pick(ids.filter(hostOf), rnd);
      if (host === undefined) return;
      const type = pick(NEW_TYPES, rnd)!;
      const fresh = addPart(d, type);
      const doc = draftDoc(d);
      const child = pick(
        MINI.parts[type].childSockets.filter((s) => canBeChild(doc, MINI, fresh, s, 'joint').ok),
        rnd,
      );
      const socket = pick(typeOf(host).parentSockets, rnd);
      const joined =
        child !== undefined &&
        socket !== undefined &&
        addConn(d, MINI, fresh, sock(child, host, socket), { asPose: true }).ok;
      if (!joined) deleteParts(d, [fresh], poses);
      return;
    }
    case 'addOnPoint': {
      const host = pick(ids.filter(hostOf), rnd);
      if (host === undefined) return;
      const cframe: CFrame12 = [rnd() * 4 - 2, rnd() * 2, rnd() * 4 - 2, 1, 0, 0, 0, 1, 0, 0, 0, 1];
      const uuid = addPoint(d, host, cframe, typeOf(host).mainPartName);
      const type = pick(NEW_TYPES, rnd)!;
      const fresh = addPart(d, type);
      const socket = MINI.parts[type].defaultMount!;
      if (!addConn(d, MINI, fresh, mount(socket, host, uuid), { asPose: true }).ok) {
        deleteParts(d, [fresh], poses);
      }
      return;
    }
    case 'delete': {
      const victim = pick(ids, rnd);
      if (victim !== undefined) deleteParts(d, [victim], poses);
      return;
    }
    case 'paint': {
      const target = pick(ids, rnd);
      if (target !== undefined) {
        paint(d, MINI, [target], [Math.floor(rnd() * 256), Math.floor(rnd() * 256), 0]);
      }
      return;
    }
    case 'detach': {
      const target = pick(ids, rnd);
      if (target !== undefined) detach(d, target, poses);
      return;
    }
    case 'deletePoint': {
      const host = pick(
        ids.filter((id) => (d.get(id)!.points?.size ?? 0) > 0),
        rnd,
      );
      if (host === undefined) return;
      const uuid = pick([...d.get(host)!.points!.keys()], rnd)!;
      deletePoint(d, host, uuid, rnd() < 0.5 ? 'detach' : 'delete', poses);
      return;
    }
    case 'removeSecondary': {
      // Any conn past index 0 that is not the pose conn: removing the pose conn is detach's job.
      const candidates = ids.flatMap((id) => {
        const conns = d.get(id)!.conns;
        const pose = conns.findIndex((c) => c.target.kind !== 'raw');
        return conns.map((_, i) => [id, i] as const).filter(([, i]) => i > 0 && i !== pose);
      });
      const hit = pick(candidates, rnd);
      if (hit !== undefined) removeConn(d, hit[0], hit[1]);
      return;
    }
    case 'addSecondary': {
      // A second conn: a joint from a free child socket of a random part, to a free parent socket
      // or a free point of another part. Mounts on busy pieces are refused and change nothing.
      const owner = pick(ids, rnd);
      if (owner === undefined) return;
      const doc = draftDoc(d);
      const socket = pick(
        typeOf(owner).childSockets.filter((s) => canBeChild(doc, MINI, owner, s, 'joint').ok),
        rnd,
      );
      if (socket === undefined) return;
      const targets: Conn[] = [];
      for (const host of ids) {
        if (host === owner) continue;
        for (const s of typeOf(host).parentSockets) {
          if (canBeParent(doc, MINI, host, s).ok) targets.push(sock(socket, host, s));
        }
        for (const uuid of d.get(host)!.points?.keys() ?? []) {
          if (canTakeChild(doc, host, uuid).ok) targets.push(mount(socket, host, uuid));
        }
      }
      const conn = pick(targets, rnd);
      if (conn !== undefined) addConn(d, MINI, owner, conn, { asPose: false });
      return;
    }
    case 'makePose': {
      // A joint or mount past index 0 is moved to index 0: a random part, then one of its conns.
      const owners = ids.filter((id) =>
        d.get(id)!.conns.some((c, i) => i > 0 && c.target.kind !== 'raw'),
      );
      const owner = pick(owners, rnd);
      if (owner === undefined) return;
      const indexes = d
        .get(owner)!
        .conns.flatMap((c, i) => (i > 0 && c.target.kind !== 'raw' ? [i] : []));
      makePoseJoint(d, owner, pick(indexes, rnd)!);
      return;
    }
  }
}

test('1,000 random ops keep invariants and create no structural errors', () => {
  const rnd = mulberry32(7);
  const start = (fromEntries(APPENDIX_B_JSON as Json[]) as any).doc;
  let doc = start;
  const patches: Patch[] = [];
  const ops = [
    'addOnSocket',
    'addOnPoint',
    'delete',
    'paint',
    'detach',
    'deletePoint',
    'removeSecondary',
    'addSecondary',
    'makePose',
  ];
  for (let i = 0; i < 1000; i++) {
    const op = ops[Math.floor(rnd() * ops.length)];
    const poses = computePoses(doc, MINI, DEFAULT_CONVENTIONS);
    const r = transact(doc, op, (d) => applyRandomOp(d, op, rnd, poses));
    doc = r.doc;
    if (r.patch) patches.push(r.patch);
    expect(checkInvariants(doc)).toEqual([]);
    const bad = validate(doc, MINI, DEFAULT_LIMITS, 0).filter((x) =>
      ['E-MATE', 'E-TEAR', 'E-POINT-SHARED', 'E-UUID', 'E-REF'].includes(x.code),
    );
    expect(bad).toEqual([]);
  }
  for (const p of patches.reverse()) doc = applyPatch(doc, p, 'undo');
  expect(doc).toEqual(start);
});
