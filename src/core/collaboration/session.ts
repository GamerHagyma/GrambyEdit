// Host ordering and optimistic guests, independent of WebRTC/DOM for deterministic testing.
import {
  applyDelta,
  conditionalInverse,
  compactDelta,
  decodeDelta,
  decodeDoc,
  deltaBetween,
  digest,
  encodeDoc,
  type Delta,
  type Guarded,
  type Op,
  type WireDoc,
} from './document';
import type { Doc } from '../types';
export type Role = 'viewer' | 'editor';
export type Update = { type: 'update'; rev: number; ops: Delta; author: string; request?: number };
export type Snapshot = { type: 'snapshot'; rev: number; doc: WireDoc; accepted: number };
export type ServerMessage =
  | Update
  | Snapshot
  | { type: 'check'; rev: number; hash: string }
  | { type: 'ack'; request: number; rev: number }
  | { type: 'reject'; request: number; reason: string };
export type Edit = {
  type: 'edit';
  request: number;
  ops: Delta;
  guards?: readonly unknown[];
  label: string;
};
export type ClientMessage = Edit | { type: 'repair'; rev: number; hash: string };
export interface Lease {
  start: number;
  end: number;
}
const LEASE = 1_000_000;
const count = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
const obj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
class UserHistory {
  past: Guarded[] = [];
  future: Guarded[] = [];
  record(before: Doc, after: Doc) {
    const entry = conditionalInverse(before, after);
    if (!entry.ops.length) return;
    this.past.push(entry);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
  }
  take(
    doc: Doc,
    redo: boolean,
    allow: (op: Op, guard: unknown) => boolean = () => true,
  ): { after: Doc; edit: Guarded } | null {
    const from = redo ? this.future : this.past,
      to = redo ? this.past : this.future,
      entry = from.pop();
    if (!entry) return null;
    const indices = entry.ops.map((_, i) => i).filter((i) => allow(entry.ops[i], entry.guards[i]));
    const edit = {
      ops: indices.map((i) => entry.ops[i]),
      guards: indices.map((i) => entry.guards[i]),
    };
    const after = applyDelta(doc, edit.ops, edit.guards);
    to.push(conditionalInverse(doc, after));
    return { after, edit };
  }
}
export class HostSession {
  rev = 0;
  doc: Doc;
  get canUndo() {
    return this.history.past.length > 0;
  }
  get canRedo() {
    return this.history.future.length > 0;
  }
  private peers = new Map<string, { role: Role; lease: Lease; cursor: number; request: number }>();
  private nextLease: number;
  private history = new UserHistory();
  private journal: Update[] = [];
  private journalSizes: number[] = [];
  private journalSize = 0;
  private repairTimes = new Map<string, number>();
  private deletedBy = new Map<number, string>();
  constructor(
    doc: Doc,
    private send: (to: string, msg: ServerMessage) => void,
    private install: (doc: Doc) => void = () => {},
  ) {
    this.doc = doc;
    this.nextLease = Math.ceil(doc.nextId / LEASE) * LEASE;
    this.addPeer('host', 'editor');
  }
  addPeer(peer: string, role: Role): Lease {
    if (this.peers.has(peer)) throw new Error('Peer already joined.');
    const lease = { start: this.nextLease, end: this.nextLease + LEASE };
    if (lease.end >= 1e12) throw new Error('Part identifier space exhausted.');
    this.nextLease = lease.end;
    this.peers.set(peer, { role, lease, cursor: lease.start, request: 0 });
    return lease;
  }
  removePeer(peer: string) {
    this.peers.delete(peer);
    this.repairTimes.delete(peer);
  }
  setRole(peer: string, role: Role) {
    const p = this.peers.get(peer);
    if (p) p.role = role;
  }
  allocate(peer: string): number {
    const p = this.peers.get(peer);
    if (!p || p.cursor >= p.lease.end)
      throw new Error('Part identifier lease exhausted. Rejoin this room.');
    return p.cursor++;
  }
  snapshot(peer: string): Snapshot {
    return {
      type: 'snapshot',
      rev: this.rev,
      doc: encodeDoc(this.doc),
      accepted: this.peers.get(peer)?.request ?? 0,
    };
  }
  local(before: Doc, after: Doc) {
    this.history.record(before, after);
    this.publish(after, 'host');
  }
  private deliver(peer: string, u: Update) {
    this.send(peer, u.author === peer ? u : { ...u, request: undefined });
  }
  private publish(after: Doc, author: string, request?: number) {
    const ops = deltaBetween(this.doc, after);
    for (const op of ops)
      if (op[0] === 'p') {
        if (op[2] === null) this.deletedBy.set(op[1], author);
        else this.deletedBy.delete(op[1]);
      }
    this.doc = after;
    if (!ops.length) {
      if (request !== undefined) this.send(author, { type: 'ack', request, rev: this.rev });
      return;
    }
    const update: Update = { type: 'update', rev: ++this.rev, ops, author, request };
    this.journal.push(update);
    const size = JSON.stringify(update).length;
    this.journalSizes.push(size);
    this.journalSize += size;
    while (this.journal.length > 256 || this.journalSize > 4 * 1024 * 1024) {
      this.journal.shift();
      this.journalSize -= this.journalSizes.shift()!;
    }
    this.install(after);
    for (const peer of this.peers.keys()) if (peer !== 'host') this.deliver(peer, update);
  }
  receive(peer: string, data: unknown): void {
    const p = this.peers.get(peer);
    if (!p || peer === 'host' || !obj(data)) return;
    if (data.type === 'repair') {
      if (!count(data.rev) || typeof data.hash !== 'string' || data.hash.length !== 16)
        throw new Error('Invalid repair request.');
      const now = Date.now(),
        last = this.repairTimes.get(peer) ?? -Infinity;
      if (now - last < 2000) return;
      this.repairTimes.set(peer, now);
      if (data.rev === this.rev && data.hash === digest(this.doc)) return;
      const missing = this.journal.filter((u) => u.rev > Number(data.rev));
      if (
        Number(data.rev) < this.rev &&
        missing.length &&
        missing[0].rev === Number(data.rev) + 1
      ) {
        for (const u of missing) this.deliver(peer, u);
      } else this.send(peer, this.snapshot(peer));
      return;
    }
    if (
      data.type !== 'edit' ||
      !count(data.request) ||
      Number(data.request) < 1 ||
      typeof data.label !== 'string' ||
      data.label.length > 160
    )
      throw new Error('Invalid edit message.');
    const request = Number(data.request);
    if (request <= p.request) {
      this.send(peer, { type: 'ack', request, rev: this.rev });
      return;
    }
    const ops = decodeDelta(data.ops);
    if (
      data.guards !== undefined &&
      (!Array.isArray(data.guards) || data.guards.length !== ops.length)
    )
      throw new Error('Invalid undo guards.');
    p.request = request;
    if (p.role !== 'editor') {
      this.send(peer, { type: 'reject', request, reason: 'You have view-only permission.' });
      return;
    }
    for (const [index, op] of ops.entries())
      if (
        op[0] === 'p' &&
        op[2] !== null &&
        !this.doc.parts.has(op[1]) &&
        (Array.isArray(data.guards) && data.guards[index] === null
          ? this.deletedBy.get(op[1]) !== peer
          : op[1] < p.lease.start || op[1] >= p.lease.end)
      ) {
        this.send(peer, {
          type: 'reject',
          request,
          reason: 'This part was removed by someone else or is outside your identifier lease.',
        });
        this.send(peer, this.snapshot(peer));
        return;
      }
    // Counters may only advance within an assigned lease; an attacker cannot exhaust others' IDs.
    for (const op of ops)
      if (op[0] === 'n' && op[1] > p.lease.end && op[1] > this.doc.nextId)
        throw new Error('Invalid part counter.');
    try {
      this.publish(applyDelta(this.doc, ops, data.guards as unknown[] | undefined), peer, request);
    } catch {
      this.send(peer, {
        type: 'reject',
        request,
        reason: 'That edit conflicts with the current build. Please retry.',
      });
      this.send(peer, this.snapshot(peer));
    }
  }
  check() {
    const msg = { type: 'check' as const, rev: this.rev, hash: digest(this.doc) };
    for (const p of this.peers.keys()) if (p !== 'host') this.send(p, msg);
  }
  undo(redo = false): boolean {
    const r = this.history.take(this.doc, redo, (op, guard) =>
      op[0] === 'p' && op[2] !== null && guard === null
        ? this.deletedBy.get(op[1]) === 'host'
        : true,
    );
    if (!r) return false;
    this.publish(r.after, 'host');
    return true;
  }
}
interface Pending {
  ops: Delta;
  guards?: readonly unknown[];
  label: string;
  request: number;
  sent: boolean;
}
export class ClientSession {
  confirmed: Doc;
  visible: Doc;
  rev: number;
  get canUndo() {
    return this.history.past.length > 0;
  }
  get canRedo() {
    return this.history.future.length > 0;
  }
  private pending: Pending[] = [];
  private request = 0;
  private history = new UserHistory();
  private repairing = false;
  private lastRepair = -Infinity;
  constructor(
    doc: Doc,
    rev: number,
    private send: (msg: ClientMessage) => void,
    private install: (doc: Doc) => void,
    private rejected: (reason: string) => void = () => {},
  ) {
    this.confirmed = this.visible = doc;
    this.rev = rev;
  }
  get waiting() {
    return this.pending.length > 0;
  }
  local(before: Doc, after: Doc) {
    this.history.record(before, after);
    this.visible = after;
    this.queue(deltaBetween(before, after), 'Edit build');
  }
  private queue(ops: Delta, label: string, guards?: readonly unknown[]) {
    if (!ops.length) return;
    const tail = this.pending.at(-1);
    if (tail && !tail.sent && !guards && !tail.guards) {
      tail.ops = compactDelta([...tail.ops, ...ops]);
      return;
    }
    this.pending.push({ ops, label, guards, request: ++this.request, sent: false });
  }
  flush() {
    const first = this.pending[0];
    if (first && !first.sent) {
      first.sent = true;
      this.send({
        type: 'edit',
        request: first.request,
        ops: first.ops,
        guards: first.guards,
        label: first.label,
      });
    }
  }
  private rebuild() {
    // Pending local intents are reapplied over the latest authoritative document.
    let doc = this.confirmed;
    for (const p of this.pending)
      try {
        doc = applyDelta(doc, p.ops, p.guards);
      } catch {
        this.rejected('A pending edit could not be reapplied after another edit.');
        p.ops = [];
      }
    this.visible = doc;
    this.install(doc);
  }
  flushForDeparture() {
    for (const pending of this.pending)
      if (!pending.sent) {
        pending.sent = true;
        this.send({
          type: 'edit',
          request: pending.request,
          ops: pending.ops,
          guards: pending.guards,
          label: pending.label,
        });
      }
  }
  verifyVisible(doc: Doc) {
    if (!this.waiting && digest(doc) !== digest(this.confirmed)) {
      this.confirmed = doc;
      this.repair();
    }
  }
  private repair() {
    if (this.repairing && Date.now() - this.lastRepair < 2500) return;
    this.repairing = true;
    this.lastRepair = Date.now();
    this.send({ type: 'repair', rev: this.rev, hash: digest(this.confirmed) });
  }
  receive(data: unknown): void {
    if (!obj(data)) throw new Error('Invalid shared update.');
    if (data.type === 'snapshot') {
      if (!count(data.rev) || !count(data.accepted)) throw new Error('Invalid snapshot revision.');
      const doc = decodeDoc(data.doc);
      if (Number(data.rev) < this.rev) return;
      this.pending = this.pending.filter((p) => p.request > Number(data.accepted));
      const changed = digest(this.confirmed) !== digest(doc) || this.pending.length > 0;
      this.confirmed = doc;
      this.rev = Number(data.rev);
      this.repairing = false;
      if (changed) this.rebuild();
      else this.visible = doc;
      this.flush();
      return;
    }
    if (data.type === 'reject') {
      if (!count(data.request) || typeof data.reason !== 'string')
        throw new Error('Invalid rejection.');
      this.pending = this.pending.filter((p) => p.request !== data.request);
      this.rejected(data.reason);
      this.rebuild();
      this.flush();
      return;
    }
    if (data.type === 'ack') {
      if (!count(data.request) || !count(data.rev)) throw new Error('Invalid acknowledgement.');
      this.pending = this.pending.filter((p) => p.request !== data.request);
      this.rebuild();
      this.flush();
      return;
    }
    if (data.type === 'check') {
      if (!count(data.rev) || typeof data.hash !== 'string' || data.hash.length !== 16)
        throw new Error('Invalid consistency check.');
      if (
        Number(data.rev) > this.rev ||
        (!this.waiting && data.rev === this.rev && data.hash !== digest(this.confirmed))
      )
        this.repair();
      return;
    }
    if (
      data.type !== 'update' ||
      !count(data.rev) ||
      typeof data.author !== 'string' ||
      (data.request !== undefined && !count(data.request))
    )
      throw new Error('Invalid update.');
    if (Number(data.rev) > this.rev + 1) {
      this.repair();
      return;
    }
    if (Number(data.rev) > this.rev) {
      this.confirmed = applyDelta(this.confirmed, decodeDelta(data.ops));
      this.rev = Number(data.rev);
    }
    if (data.request !== undefined)
      this.pending = this.pending.filter((p) => p.request !== data.request);
    this.repairing = false;
    this.rebuild();
    this.flush();
  }
  undo(redo = false): boolean {
    const r = this.history.take(this.visible, redo);
    if (!r) return false;
    this.visible = r.after;
    this.install(r.after);
    this.queue(r.edit.ops, redo ? 'Redo' : 'Undo', r.edit.guards);
    this.flush();
    return true;
  }
}
