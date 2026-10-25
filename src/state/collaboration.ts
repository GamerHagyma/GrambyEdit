// Browser room lifecycle. Document engines own ordering; this layer owns connections and UI state.
import { batch, computed, effect, signal } from '@preact/signals';
import type { Peer, DataConnection, PeerOptions } from 'peerjs';
import { canonical, decodeDoc, digest } from '../core/collaboration/document';
import { HostSession, ClientSession, type Lease, type Role } from '../core/collaboration/session';
import { FramedChannel } from '../net/collaboration';
import { packSnapshot, unpackSnapshot } from '../net/snapshot-codec';
import {
  catalogSig,
  docSig,
  installSharedDoc,
  setStoreAdapter,
  historyAvailabilitySig,
  viewBus,
} from './store';
import { openCreationIdSig } from './library';
import { loadPref, savePref } from '../storage/prefs';
import { toast } from './toasts';
import { cancelModal } from '../tools/modal';
import { disarm } from './place';
import { setTool } from '../tools/manager';
import type { Doc } from '../core/types';
export interface Profile {
  name: string;
  color: string;
}
export interface Member extends Profile {
  id: string;
  role: Role | 'host';
  pending: boolean;
}
export interface CameraPose {
  p: number[];
  q: number[];
}
interface Room {
  mode: 'offline' | 'connecting' | 'hosting' | 'waiting' | 'guest' | 'disconnected';
  id: string;
  invite: string;
  error: string;
  role: Role;
}
export const roomSig = signal<Room>({
  mode: 'offline',
  id: '',
  invite: '',
  error: '',
  role: 'viewer',
});
export const collabProfileSig = signal<Profile>(
  loadPref('collabProfile', { name: 'Builder', color: '#58a6ff' }),
);
export const membersSig = signal<readonly Member[]>([]);
export const camerasSig = signal<ReadonlyMap<string, CameraPose>>(new Map());
export const networkStatsSig = signal({ sent: 0, received: 0, snapshots: 0 });
export const collaborationReadOnlySig = computed(
  () =>
    ['connecting', 'waiting'].includes(roomSig.value.mode) ||
    (roomSig.value.mode === 'guest' && roomSig.value.role === 'viewer'),
);
export const joinCodeSig = signal('');
export interface NetworkOptions {
  server?: string;
  ice?: string;
}
interface Link {
  conn: DataConnection;
  wire: FramedChannel;
  approved: boolean;
  profile: Profile | null;
  lease: Lease | null;
  timer: ReturnType<typeof setTimeout>;
  updates: unknown[];
  updateTimer?: ReturnType<typeof setTimeout>;
  presence: Record<string, unknown> | null;
  lastPresence: number;
  outgoing: Promise<void>;
  incoming: Promise<void>;
  encoding: number;
  closing: boolean;
}
let peer: Peer | null = null,
  host: HostSession | null = null,
  client: ClientSession | null = null;
const links = new Map<string, Link>();
let generation = 0,
  token = '',
  signature = '',
  selfId = '',
  lease: Lease | null = null,
  cursor = 0;
let tick: ReturnType<typeof setInterval> | undefined,
  flushTimer: ReturnType<typeof setTimeout> | undefined,
  stopCatalog: (() => void) | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let cancelOpening: (() => void) | null = null;
let localCamera: CameraPose | null = null,
  lastCamera = '',
  cameraDirty = false;
const presenceDirty = new Set<string>();
let lastWarn = 0;
const warn = (message: string) => {
  if (Date.now() - lastWarn > 1200) {
    toast(message, 'warn');
    lastWarn = Date.now();
  }
};
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
function profile(v: unknown): Profile {
  if (
    !object(v) ||
    typeof v.name !== 'string' ||
    !v.name.trim() ||
    v.name.length > 48 ||
    typeof v.color !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(v.color)
  )
    throw new Error('Enter a name (1–48 characters) and a valid color.');
  return { name: v.name.trim(), color: v.color };
}
function camera(v: unknown): CameraPose {
  if (
    !object(v) ||
    !Array.isArray(v.p) ||
    v.p.length !== 3 ||
    !Array.isArray(v.q) ||
    v.q.length !== 4 ||
    ![...v.p, ...v.q].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e7)
  )
    throw new Error('Invalid camera presence.');
  const length = Math.hypot(...v.q);
  if (length < 0.5 || length > 1.5) throw new Error('Invalid camera rotation.');
  return { p: v.p, q: v.q.map((n) => n / length) };
}
function fingerprint(): string {
  const cat = catalogSig.peek();
  if (!cat) throw new Error('Wait for the part library to finish loading.');
  const text = canonical(cat);
  let a = 2166136261,
    b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 2246822519);
  }
  return (a >>> 0).toString(16) + '-' + (b >>> 0).toString(16);
}
function refresh() {
  const engine = host ?? client;
  historyAvailabilitySig.value = engine ? { undo: engine.canUndo, redo: engine.canRedo } : null;
}
function install(doc: Doc, replace = false) {
  if (replace || digest(docSig.peek()) !== digest(doc)) {
    if (replace) cancelModal();
    installSharedDoc(doc, replace);
  }
  refresh();
}
function blockReplace() {
  warn('Leave the room before starting or opening a different blueprint.');
  return false;
}
function installBoundary() {
  setStoreAdapter({
    canEdit: () => {
      const allowed =
        !!host || (roomSig.peek().mode === 'guest' && roomSig.peek().role === 'editor');
      if (!allowed) warn('This room is view-only until the host grants editing permission.');
      return allowed;
    },
    canReplace: blockReplace,
    allocate: () => {
      if (host) return host.allocate('host');
      if (!lease || cursor >= lease.end)
        throw new Error('Your part ID lease is exhausted. Rejoin the room.');
      return cursor++;
    },
    changed: (before, after) => {
      if (host) host.local(before, after);
      else if (client) {
        client.local(before, after);
        if (!flushTimer)
          flushTimer = setTimeout(() => {
            flushTimer = undefined;
            client?.flush();
          }, 30);
      }
      refresh();
    },
    undo: (redo) => {
      const result = (host ?? client)?.undo(redo) ?? false;
      refresh();
      return result;
    },
  });
  refresh();
}
function send(to: string, message: unknown) {
  const link = links.get(to);
  if (!link) return;
  if (object(message) && message.type === 'update') {
    link.updates.push(message);
    if (link.updates.length >= 64) flushUpdates(to);
    else if (!link.updateTimer) link.updateTimer = setTimeout(() => flushUpdates(to), 30);
    return;
  }
  if (object(message) && (message.type === 'camera' || message.type === 'presence')) {
    if (message.type === 'presence' && link.presence?.type === 'presence') {
      const poses = new Map(link.presence.poses as [string, CameraPose][]);
      for (const [id, pose] of message.poses as [string, CameraPose][]) poses.set(id, pose);
      link.presence = { type: 'presence', poses: [...poses] };
    } else link.presence = message;
    return;
  }
  flushUpdates(to);
  transmit(to, message);
}
function transmit(id: string, message: unknown) {
  const link = links.get(id);
  if (!link) return;
  link.encoding++;
  link.outgoing = link.outgoing
    .then(async () => {
      const packed = await packSnapshot(message);
      if (links.get(id) === link || link.closing) link.wire.send(packed);
    })
    .catch((e) => {
      if (links.get(id) === link) failLink(id, (e as Error).message);
    })
    .finally(() => {
      link.encoding--;
    });
}
function flushUpdates(id: string) {
  const link = links.get(id);
  if (!link) return;
  clearTimeout(link.updateTimer);
  link.updateTimer = undefined;
  const updates = link.updates;
  link.updates = [];
  if (updates.length)
    transmit(id, updates.length === 1 ? updates[0] : { type: 'updates', updates });
}
function broadcast(message: unknown) {
  for (const [id, l] of links) if (l.approved) send(id, message);
}
function roster() {
  const own: Member = { ...collabProfileSig.peek(), id: selfId, role: 'host', pending: false };
  broadcast({
    type: 'roster',
    members: [own, ...membersSig.peek().filter((m) => !m.pending && m.id !== selfId)],
  });
}
function drop(id: string) {
  const l = links.get(id);
  if (!l) return;
  links.delete(id);
  clearTimeout(l.timer);
  clearTimeout(l.updateTimer);
  l.wire.close();
  host?.removePeer(id);
  membersSig.value = membersSig.peek().filter((m) => m.id !== id);
  const cameras = new Map(camerasSig.peek());
  cameras.delete(id);
  camerasSig.value = cameras;
  if (host) roster();
  else if (!['offline', 'disconnected'].includes(roomSig.peek().mode))
    leaveCollaboration('Disconnected from the host. Your local copy has been kept.');
}
function failLink(id: string, message: string) {
  if (host) {
    toast(message, 'warn');
    links.get(id)?.conn.close();
    drop(id);
  } else leaveCollaboration(message);
}
function receive(id: string, data: unknown) {
  const l = links.get(id);
  if (!l || !object(data) || typeof data.type !== 'string')
    throw new Error('Invalid room message.');
  if (host) {
    if (data.type === 'hello') {
      if (l.profile || data.version !== 1 || data.token !== token || data.signature !== signature)
        throw new Error('The invitation or catalog/socket configuration does not match.');
      l.profile = profile(data.profile);
      clearTimeout(l.timer);
      membersSig.value = [
        ...membersSig.peek(),
        { ...l.profile, id, role: 'viewer', pending: true },
      ];
      send(id, { type: 'waiting' });
      return;
    }
    if (!l.approved) throw new Error('The host has not approved this connection.');
    if (data.type === 'profile') {
      l.profile = profile(data.profile);
      membersSig.value = membersSig.peek().map((m) => (m.id === id ? { ...m, ...l.profile! } : m));
      roster();
      return;
    }
    if (data.type === 'camera') {
      if (Date.now() - l.lastPresence < 50) return;
      l.lastPresence = Date.now();
      const pose = camera(data.pose);
      const next = new Map(camerasSig.peek());
      next.set(id, pose);
      camerasSig.value = next;
      presenceDirty.add(id);
      return;
    }
    if (data.type === 'bye') {
      l.conn.close();
      drop(id);
      return;
    }
    host.receive(id, data);
    refresh();
    return;
  }
  if (data.type === 'waiting') {
    roomSig.value = { ...roomSig.peek(), mode: 'waiting' };
    return;
  }
  if (data.type === 'denied' || data.type === 'ended') {
    leaveCollaboration(
      typeof data.reason === 'string' ? data.reason : 'The host ended this connection.',
    );
    return;
  }
  if (data.type === 'welcome') {
    if (
      data.signature !== signature ||
      data.version !== 1 ||
      !object(data.lease) ||
      !Number.isSafeInteger(data.lease.start) ||
      !Number.isSafeInteger(data.lease.end) ||
      Number(data.lease.start) < 1 ||
      Number(data.lease.end) - Number(data.lease.start) !== 1000000 ||
      Number(data.lease.end) >= 1e12 ||
      !Number.isSafeInteger(data.rev) ||
      Number(data.rev) < 0 ||
      (data.role !== 'viewer' && data.role !== 'editor')
    )
      throw new Error('Invalid room welcome.');
    const doc = decodeDoc(data.doc);
    lease = { start: Number(data.lease.start), end: Number(data.lease.end) };
    cursor = Math.max(
      lease.start,
      ...doc.order.filter((i) => i >= lease!.start && i < lease!.end).map((i) => i + 1),
    );
    client = new ClientSession(
      doc,
      Number(data.rev),
      (msg) => send(id, msg),
      (doc) => install(doc),
      (reason) => toast(reason, 'warn'),
    );
    l.approved = true;
    clearTimeout(l.timer);
    roomSig.value = { ...roomSig.peek(), mode: 'guest', role: data.role };
    openCreationIdSig.value = null;
    install(doc, true);
    viewBus.emit({ kind: 'frame-all' });
    refresh();
    return;
  }
  if (!l.approved) throw new Error('Shared state arrived before approval.');
  if (data.type === 'roster') {
    if (!Array.isArray(data.members) || data.members.length > 8)
      throw new Error('Invalid room roster.');
    const members: Member[] = data.members.map((m) => {
      if (
        !object(m) ||
        typeof m.id !== 'string' ||
        m.id.length > 128 ||
        !['host', 'viewer', 'editor'].includes(String(m.role))
      )
        throw new Error('Invalid member.');
      return { ...profile(m), id: m.id, role: m.role as Member['role'], pending: false };
    });
    membersSig.value = members;
    const own = members.find((m) => m.id === selfId);
    if (own && (own.role === 'editor' || own.role === 'viewer')) {
      roomSig.value = { ...roomSig.peek(), role: own.role };
      if (own.role === 'viewer') {
        cancelModal();
        disarm();
        setTool('select');
      }
    }
    const ids = new Set(members.map((m) => m.id));
    camerasSig.value = new Map([...camerasSig.peek()].filter(([id]) => ids.has(id)));
    return;
  }
  if (data.type === 'presence') {
    if (!Array.isArray(data.poses) || data.poses.length > 8)
      throw new Error('Invalid presence packet.');
    const next = new Map(camerasSig.peek());
    for (const entry of data.poses) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string')
        throw new Error('Invalid presence.');
      if (entry[0] !== selfId) next.set(entry[0], camera(entry[1]));
    }
    camerasSig.value = next;
    return;
  }
  if (data.type === 'updates') {
    if (!Array.isArray(data.updates) || data.updates.length > 64)
      throw new Error('Invalid update batch.');
    batch(() => {
      for (const update of data.updates as unknown[]) client?.receive(update);
    });
    refresh();
    return;
  }
  if (data.type === 'snapshot')
    networkStatsSig.value = {
      ...networkStatsSig.peek(),
      snapshots: networkStatsSig.peek().snapshots + 1,
    };
  client?.receive(data);
  refresh();
}
function attach(conn: DataConnection) {
  if (links.has(conn.peer) || (host && links.size >= 7)) {
    conn.close();
    return;
  }
  const id = conn.peer;
  const wire: FramedChannel = new FramedChannel(
    (text) => conn.send(text),
    () => conn.dataChannel?.bufferedAmount ?? 0,
    (data) => {
      const link = links.get(id);
      if (!link) return;
      link.incoming = link.incoming
        .then(async () => {
          const message = await unpackSnapshot(data);
          if (links.get(id) === link) receive(id, message);
        })
        .catch((e) => {
          if (links.get(id) === link) failLink(id, (e as Error).message);
        });
    },
    (error) => {
      if (links.get(id)?.wire === wire) failLink(id, error);
    },
    (sent, received) => {
      const stats = networkStatsSig.peek();
      networkStatsSig.value = {
        ...stats,
        sent: stats.sent + sent,
        received: stats.received + received,
      };
    },
  );
  const timer = setTimeout(
    () => failLink(id, 'Connection timed out. Check the invitation and ICE/TURN settings.'),
    45000,
  );
  links.set(id, {
    conn,
    wire,
    approved: false,
    profile: null,
    lease: null,
    timer,
    updates: [],
    presence: null,
    lastPresence: 0,
    outgoing: Promise.resolve(),
    incoming: Promise.resolve(),
    encoding: 0,
    closing: false,
  });
  conn.on('data', (data) => wire.receive(data));
  conn.on('close', () => {
    if (links.get(id)?.conn === conn) drop(id);
  });
  conn.on('error', () => {
    if (links.get(id)?.conn === conn) failLink(id, 'The peer connection failed.');
  });
  conn.on('open', () => {
    if (!host)
      send(id, {
        type: 'hello',
        version: 1,
        token,
        signature,
        profile: profile(collabProfileSig.peek()),
      });
  });
}
function networkOptions(options: NetworkOptions): PeerOptions {
  const result: PeerOptions = {
    debug: 0,
    pingInterval: 30000,
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
  };
  if (options.server?.trim()) {
    const url = new URL(options.server);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname))
    )
      throw new Error('Use an HTTPS PeerServer URL (localhost HTTP is allowed for testing).');
    Object.assign(result, {
      host: url.hostname,
      port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      secure: url.protocol === 'https:',
    });
  }
  if (options.ice?.trim()) {
    const ice: unknown = JSON.parse(options.ice);
    if (
      !Array.isArray(ice) ||
      ice.length > 8 ||
      !ice.every(
        (s) =>
          object(s) &&
          (typeof s.urls === 'string' ||
            (Array.isArray(s.urls) && s.urls.every((u) => typeof u === 'string'))),
      )
    )
      throw new Error('ICE servers must be a JSON array of RTCIceServer settings.');
    result.config = { iceServers: ice as RTCIceServer[] };
  }
  return result;
}
export function decodeInvite(input: string): { host: string; token: string; server?: string } {
  let code = input.trim();
  let server: string | undefined;
  if (/^https?:/i.test(code)) {
    const url = new URL(code);
    const params = new URLSearchParams(url.hash.slice(1));
    code = params.get('collab') ?? '';
    server = params.get('server') ?? undefined;
  }
  const match = /^ge1:([a-zA-Z0-9_-]{1,100}):([a-f0-9]{32})$/.exec(code);
  if (!match) throw new Error('Paste a complete GrambyEdit invitation link or code.');
  return { host: match[1], token: match[2], server };
}
export async function startCollaboration(
  mode: 'host' | 'join',
  input = '',
  options: NetworkOptions = {},
): Promise<void> {
  if (!['offline', 'disconnected'].includes(roomSig.peek().mode))
    throw new Error('Leave the current room first.');
  const invitation = mode === 'join' ? decodeInvite(input) : null;
  const settings = networkOptions({
      ...options,
      server: options.server?.trim() || invitation?.server,
    }),
    who = profile(collabProfileSig.peek()),
    sig = fingerprint();
  const run = ++generation;
  signature = sig;
  token = invitation?.token ?? crypto.randomUUID().replaceAll('-', '');
  selfId = 'ge-' + crypto.randomUUID();
  roomSig.value = {
    mode: 'connecting',
    id: invitation?.host ?? selfId,
    invite: input,
    error: '',
    role: 'viewer',
  };
  networkStatsSig.value = { sent: 0, received: 0, snapshots: 0 };
  if (mode === 'join') installBoundary();
  try {
    const { Peer } = await import('peerjs');
    if (run !== generation) return;
    const created = new Peer(selfId, settings);
    peer = created;
    created.on('error', (error) => {
      if (run !== generation) return;
      if (
        (host || client) &&
        ['network', 'socket-error', 'socket-closed', 'server-error'].includes(error.type)
      ) {
        roomSig.value = {
          ...roomSig.peek(),
          error: 'Signaling is reconnecting. Existing peer connections remain active.',
        };
        return;
      }
      if (host && error.type === 'peer-unavailable') return;
      if (run === generation)
        leaveCollaboration(
          'Connection failed: ' +
            error.type +
            '. Check the invitation, signaling service and ICE/TURN settings.',
        );
    });
    created.on('disconnected', () => {
      const retry = () => {
        if (run !== generation || created.destroyed) return;
        if (created.disconnected) created.reconnect();
        reconnectTimer = setTimeout(retry, 5000);
      };
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(retry, 1000);
    });
    created.on('open', () => {
      clearTimeout(reconnectTimer);
      if (run === generation && (host || client)) roomSig.value = { ...roomSig.peek(), error: '' };
    });
    created.on('connection', (conn) => {
      if (host) attach(conn);
      else conn.close();
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('The signaling server did not respond.')),
        20000,
      );
      created.once('open', () => {
        clearTimeout(timer);
        cancelOpening = null;
        resolve();
      });
      created.once('error', (e) => {
        clearTimeout(timer);
        cancelOpening = null;
        reject(new Error(e.type));
      });
      cancelOpening = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    if (run !== generation) {
      created.destroy();
      return;
    }
    if (mode === 'host') {
      host = new HostSession(
        docSig.peek(),
        (id, msg) => send(id, msg),
        (doc) => install(doc),
      );
      const code = `ge1:${selfId}:${token}`,
        url = new URL(window.location.href);
      const params = new URLSearchParams({ collab: code });
      if (options.server?.trim()) params.set('server', options.server.trim());
      url.hash = params.toString();
      roomSig.value = { mode: 'hosting', id: selfId, invite: url.href, error: '', role: 'editor' };
      membersSig.value = [{ ...who, id: selfId, role: 'host', pending: false }];
      installBoundary();
    } else {
      roomSig.value = { ...roomSig.peek(), mode: 'waiting' };
      attach(created.connect(invitation!.host, { reliable: true, serialization: 'json' }));
    }
    let ticks = 0;
    tick = setInterval(() => {
      if (++ticks % 150 === 0) {
        if (host) {
          install(host.doc);
          host.check();
        }
        client?.verifyVisible(docSig.peek());
      }
      if (cameraDirty && localCamera) {
        cameraDirty = false;
        if (host) {
          const next = new Map(camerasSig.peek());
          next.set(selfId, localCamera);
          camerasSig.value = next;
          presenceDirty.add(selfId);
        } else if (client) send(invitation!.host, { type: 'camera', pose: localCamera });
      }
      if (host && presenceDirty.size) {
        const poses = [...presenceDirty]
          .map((id) => [id, camerasSig.peek().get(id)])
          .filter((e) => e[1]);
        presenceDirty.clear();
        broadcast({ type: 'presence', poses });
      }
      for (const [id, link] of links)
        if (link.presence && !link.wire.busy && link.encoding === 0) {
          const message = link.presence;
          link.presence = null;
          transmit(id, message);
        }
    }, 100);
    const initial = catalogSig.peek();
    stopCatalog = effect(() => {
      if (catalogSig.value !== initial && fingerprint() !== signature)
        leaveCollaboration(
          'Socket/catalog configuration changed. Rehost after everyone uses matching geometry.',
        );
    });
  } catch (e) {
    if (run !== generation) return;
    leaveCollaboration((e as Error).message);
    throw e;
  }
}
export function approveMember(id: string, role: Role) {
  const l = links.get(id);
  if (!host || !l?.profile || l.approved) return;
  const lease = host.addPeer(id, role);
  l.lease = lease;
  l.approved = true;
  clearTimeout(l.timer);
  membersSig.value = membersSig
    .peek()
    .map((m) => (m.id === id ? { ...m, role, pending: false } : m));
  const snapshot = host.snapshot(id);
  send(id, { ...snapshot, type: 'welcome', version: 1, signature, role, lease });
  roster();
  const poses = [...camerasSig.peek()];
  if (poses.length) send(id, { type: 'presence', poses });
}
export function changeMemberRole(id: string, role: Role) {
  if (!host) return;
  host.setRole(id, role);
  membersSig.value = membersSig.peek().map((m) => (m.id === id ? { ...m, role } : m));
  roster();
}
export function removeMember(id: string) {
  const l = links.get(id);
  if (!host || !l) return;
  send(id, { type: 'denied', reason: 'The host removed or declined this connection.' });
  setTimeout(() => {
    l.conn.close();
    drop(id);
  }, 50);
}
export function updateCollabProfile(next: Profile) {
  const valid = profile(next);
  collabProfileSig.value = valid;
  savePref('collabProfile', valid);
  if (host) {
    membersSig.value = membersSig.peek().map((m) => (m.id === selfId ? { ...m, ...valid } : m));
    roster();
  } else if (client) send(roomSig.peek().id, { type: 'profile', profile: valid });
}
export function publishCamera(p: readonly number[], q: readonly number[]): void {
  if (!host && !client) return;
  const next = {
    p: p.map((n) => Math.round(n * 1000) / 1000),
    q: q.map((n) => Math.round(n * 10000) / 10000),
  };
  const key = JSON.stringify(next);
  if (key === lastCamera) return;
  lastCamera = key;
  localCamera = next;
  cameraDirty = true;
}
export function leaveCollaboration(reason = '') {
  generation++;
  cancelOpening?.();
  cancelOpening = null;
  clearTimeout(reconnectTimer);
  clearInterval(tick);
  clearTimeout(flushTimer);
  tick = undefined;
  flushTimer = undefined;
  stopCatalog?.();
  stopCatalog = null;
  client?.flushForDeparture();
  const departing = [...links],
    wasHost = !!host;
  for (const [id, l] of departing) {
    flushUpdates(id);
    l.closing = true;
    clearTimeout(l.timer);
    clearTimeout(l.updateTimer);
  }
  const oldPeer = peer;
  peer = null;
  links.clear();
  if (oldPeer)
    void Promise.allSettled(
      departing.map(async ([, link]) => {
        await link.outgoing;
        if (link.approved)
          link.wire.send(
            wasHost
              ? { type: 'ended', reason: 'The host ended the room. Your copy has been kept.' }
              : { type: 'bye' },
          );
        const deadline = Date.now() + 2000;
        while (link.wire.busy && Date.now() < deadline)
          await new Promise((resolve) => setTimeout(resolve, 20));
        await new Promise((resolve) => setTimeout(resolve, 50));
        link.wire.close();
        link.conn.close();
      }),
    ).then(() => oldPeer.destroy());
  host = null;
  client = null;
  lease = null;
  setStoreAdapter(null);
  historyAvailabilitySig.value = null;
  localCamera = null;
  lastCamera = '';
  cameraDirty = false;
  presenceDirty.clear();
  batch(() => {
    membersSig.value = [];
    camerasSig.value = new Map();
    roomSig.value = { ...roomSig.peek(), mode: reason ? 'disconnected' : 'offline', error: reason };
  });
}
export function readCollaborationInvite() {
  if (window.location.hash.startsWith('#collab=')) {
    joinCodeSig.value = window.location.href;
    return true;
  }
  return false;
}
export function currentPeerId() {
  return selfId;
}
