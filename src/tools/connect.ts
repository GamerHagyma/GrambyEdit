// The Connect tool (spec §12.2): click a free parent-side socket or point to place a part from the picker
// (the type stays armed; Shift+click gathers several targets), or join two existing sockets by dragging
// from one to the other or clicking one, then the other.
import { signal } from '@preact/signals';
import {
  BufferGeometry,
  Line,
  LineBasicMaterial,
  Matrix4,
  Plane,
  Ray,
  Vector3,
  type Vector2,
} from 'three';
import { pairKey, type Catalog } from '../core/catalog-types';
import { cfToMatrix4 } from '../core/cframe';
import {
  defaultChildSocket,
  eligibleForPoint,
  eligibleForSocket,
  newPartProps,
} from '../core/defaults';
import { orderIndex } from '../core/doc';
import { addConn } from '../core/ops/conns';
import { addPart } from '../core/ops/parts';
import { transact } from '../core/ops/transact';
import { canBeParent, canTakeChild } from '../core/rules';
import type { Conn, Doc, PartId, SocketId, Uuid, Verdict } from '../core/types';
import { posesSig } from '../state/derived';
import { pushRecent } from '../state/favourites';
import { select } from '../state/selection';
import { settingsSig } from '../state/settings';
import { catalogSig, commit, docSig } from '../state/store';
import { toast } from '../state/toasts';
import { getViewport } from '../viewport/context';
import { pickPoint, pickSocket } from '../viewport/raycast';
import type { Tool, ToolPointer } from './manager';
import { createSelectTool } from './select';

export type PlaceTarget =
  | { readonly kind: 'socket'; readonly part: PartId; readonly socket: SocketId }
  | { readonly kind: 'point'; readonly host: PartId; readonly uuid: Uuid };

/** An open part picker: where it shows (client px) and the targets the picked part goes on. */
export interface PickerRequest {
  readonly anchor: { readonly x: number; readonly y: number };
  readonly targets: readonly PlaceTarget[];
}

export const pickerSig = signal<PickerRequest | null>(null);
/** The type each further click places, until Esc. */
export const armedSig = signal<string | null>(null);
/** Targets gathered with Shift+click; closing the picker clears them. */
export const gatheredSig = signal<readonly PlaceTarget[]>([]);
/** The attaching socket chosen in the picker ("attach by socket N"), for one type. */
export const attachSocketSig = signal<{ type: string; socket: SocketId } | null>(null);

export interface SocketEnd {
  readonly part: PartId;
  readonly type: string;
  readonly socket: SocketId;
}

const sideOf = (cat: Catalog, e: SocketEnd) =>
  Object.hasOwn(cat.parts, e.type) ? cat.parts[e.type].sockets[e.socket]?.side : undefined;
const childSide = (cat: Catalog, e: SocketEnd) => ['child', 'both'].includes(sideOf(cat, e) ?? '');
const parentSide = (cat: Catalog, e: SocketEnd) =>
  ['parent', 'both'].includes(sideOf(cat, e) ?? '');

/**
 * Which end of a new joint is the child: the child-side one. When both ends could be either, the
 * more frequent corpus pairing wins, then the first end (the drag's start). Null when no side fits.
 */
export function orientWire(
  cat: Catalog,
  a: SocketEnd,
  b: SocketEnd,
): { child: SocketEnd; parent: SocketEnd } | null {
  const ab = childSide(cat, a) && parentSide(cat, b);
  const ba = childSide(cat, b) && parentSide(cat, a);
  if (ab && ba) {
    const count = (c: SocketEnd, p: SocketEnd) =>
      cat.pairs[pairKey(c.type, c.socket, p.type, p.socket)] ?? 0;
    return count(b, a) > count(a, b) ? { child: b, parent: a } : { child: a, parent: b };
  }
  if (ab) return { child: a, parent: b };
  if (ba) return { child: b, parent: a };
  return null;
}

/** Whether joining `a` and `b` is allowed (spec §7.1), and the joint it would add. */
export function wireVerdict(
  doc: Doc,
  cat: Catalog,
  a: SocketEnd,
  b: SocketEnd,
): { verdict: Verdict; child?: PartId; conn?: Conn } {
  if (a.part === b.part) {
    return { verdict: { ok: false, code: 'self-target', message: 'A part cannot join itself.' } };
  }
  const o = orientWire(cat, a, b);
  if (!o) {
    return {
      verdict: {
        ok: false,
        code: 'sides',
        message: 'Join a child-side socket to a parent-side socket.',
      },
    };
  }
  const conn: Conn = {
    self: o.child.socket,
    target: { kind: 'socket', part: o.parent.part, socket: o.parent.socket },
  };
  let verdict = { ok: true } as Verdict;
  transact(doc, 'probe', (d) => {
    verdict = addConn(d, cat, o.child.part, conn, { asPose: false });
  });
  return { verdict, child: o.child.part, conn };
}

/** The types the picker lists for these targets: on sockets, types with a child socket; on points, a mount. */
export function eligibleFor(
  cat: Catalog,
  targets: readonly PlaceTarget[],
): (type: string) => boolean {
  const onPoint = targets.some((t) => t.kind === 'point');
  const onSocket = targets.some((t) => t.kind === 'socket');
  return (type) =>
    (!onSocket || eligibleForSocket(cat, type)) && (!onPoint || eligibleForPoint(cat, type));
}

/** The joint a new `type` part would take on a target. */
function connFor(cat: Catalog, doc: Doc, type: string, t: PlaceTarget): Conn | null {
  if (t.kind === 'point') {
    const self = Object.hasOwn(cat.parts, type) ? cat.parts[type].defaultMount : null;
    return self === null ? null : { self, target: { kind: 'point', part: t.host, uuid: t.uuid } };
  }
  const chosen = attachSocketSig.value;
  const self =
    chosen?.type === type
      ? chosen.socket
      : defaultChildSocket(cat, type, doc.parts.get(t.part)!.type, t.socket);
  return self === null ? null : { self, target: { kind: 'socket', part: t.part, socket: t.socket } };
}

/**
 * Places a new `type` part on each target in one history entry, selects them and arms the type.
 * Targets that refuse the part are listed in a toast.
 */
export function placeParts(type: string, targets: readonly PlaceTarget[]): void {
  const cat = catalogSig.value;
  if (!cat || targets.length === 0) return;
  const props = newPartProps(cat, type, settingsSig.value);
  const tryAll = (d: Parameters<Parameters<typeof transact>[2]>[0]) => {
    const placed: PartId[] = [];
    const refused: string[] = [];
    const ok: PlaceTarget[] = [];
    for (const t of targets) {
      const conn = connFor(cat, docSig.value, type, t);
      if (!conn) {
        refused.push(`${type} has no socket to attach by here.`);
        continue;
      }
      const id = addPart(d, type, props);
      const v = addConn(d, cat, id, conn, { asPose: true });
      if (v.ok) {
        placed.push(id);
        ok.push(t);
      } else {
        d.delete(id);
        refused.push(v.message);
      }
    }
    return { placed, refused, ok };
  };
  // A dry run first, so a click where nothing fits records no history entry.
  let trial = { placed: [] as PartId[], refused: [] as string[], ok: [] as PlaceTarget[] };
  transact(docSig.value, 'probe', (d) => {
    trial = tryAll(d);
  });
  if (trial.ok.length > 0) {
    let placed: PartId[] = [];
    const n = trial.ok.length;
    commit(n === 1 ? `Add ${type}` : `Add ${n} × ${type}`, (d) => {
      placed = tryAll(d).placed;
    });
    select(placed, 'replace');
    armedSig.value = type;
    pushRecent(type);
  }
  if (trial.refused.length > 0) toast([...new Set(trial.refused)].join('\n'), 'warn');
}

export function openPicker(anchor: { x: number; y: number }, targets: readonly PlaceTarget[]): void {
  attachSocketSig.value = null;
  pickerSig.value = { anchor, targets };
}

export function closePicker(): void {
  pickerSig.value = null;
  gatheredSig.value = [];
}

/** A socket's world position. */
function socketWorld(cat: Catalog, e: SocketEnd): Vector3 | null {
  const world = posesSig.value.world.get(e.part);
  const s = Object.hasOwn(cat.parts, e.type) ? cat.parts[e.type].sockets[e.socket] : undefined;
  if (!world || !s) return null;
  return new Vector3().setFromMatrixPosition(new Matrix4().copy(world).multiply(cfToMatrix4(s.frame)));
}

/** What hovering a socket shows: id, role, name, piece, and why it is unavailable. */
function socketInfo(doc: Doc, cat: Catalog, e: SocketEnd): { text: string; ok: boolean } {
  const s = cat.parts[e.type]?.sockets[e.socket];
  const label = `${e.type} #${orderIndex(doc).get(e.part)! + 1}`;
  const bits = [`${label} · socket ${e.socket}`, s?.role ?? 'no role'];
  if (s?.name) bits.push(s.name);
  if (s?.piece) bits.push(`piece ${s.piece}`);
  const v = parentSide(cat, e) ? canBeParent(doc, cat, e.part, e.socket) : null;
  if (v && !v.ok) bits.push(v.message);
  return { text: bits.join(' · '), ok: !v || v.ok };
}

const DRAG_PX = 4;

/** A parent-side socket a new part could attach to now. */
function freeParent(cat: Catalog, s: { part: PartId; socket: SocketId }): boolean {
  const doc = docSig.value;
  const type = doc.parts.get(s.part)?.type ?? '';
  return (
    parentSide(cat, { ...s, type }) && canBeParent(doc, cat, s.part, s.socket).ok
  );
}

export function createConnectTool(): Tool {
  const inner = createSelectTool();
  let press: { x: number; y: number; socket: SocketEnd | null; point: PlaceTarget | null } | null =
    null;
  let wire: { from: SocketEnd; line: Line; to: SocketEnd | null; ok: boolean } | null = null;
  /** The first end of a click-click join. */
  let start: SocketEnd | null = null;
  let tip: HTMLDivElement | null = null;

  const showTip = (x: number, y: number, text: string, ok: boolean | null) => {
    const vp = getViewport();
    if (!vp) return;
    const host = vp.canvas.parentElement!;
    if (!tip) {
      tip = document.createElement('div');
      host.append(tip);
    }
    tip.className = `connect-tip${ok === null ? '' : ok ? ' ok' : ' bad'}`;
    tip.textContent = text;
    const r = host.getBoundingClientRect();
    tip.style.left = `${x - r.left + 14}px`;
    tip.style.top = `${y - r.top + 14}px`;
  };
  const hideTip = () => {
    tip?.remove();
    tip = null;
  };

  const endOf = (s: { part: PartId; socket: SocketId }): SocketEnd => ({
    ...s,
    type: docSig.value.parts.get(s.part)!.type,
  });

  const endWire = () => {
    if (!wire) return;
    wire.line.removeFromParent();
    wire.line.geometry.dispose();
    (wire.line.material as LineBasicMaterial).dispose();
    wire = null;
    getViewport()?.request();
  };

  /** The cursor on the camera-facing plane through `through`. */
  const cursorAt = (ndc: Vector2, through: Vector3): Vector3 | null => {
    const vp = getViewport();
    if (!vp) return null;
    const camera = vp.rig.camera;
    const near = new Vector3(ndc.x, ndc.y, -1).unproject(camera);
    const far = new Vector3(ndc.x, ndc.y, 1).unproject(camera);
    const plane = new Plane().setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(new Vector3()),
      through,
    );
    return new Ray(near, far.sub(near).normalize()).intersectPlane(plane, new Vector3());
  };

  const updateWire = (e: ToolPointer) => {
    const cat = catalogSig.value;
    const vp = getViewport();
    if (!wire || !cat || !vp) return;
    const fromAt = socketWorld(cat, wire.from);
    if (!fromAt) return;
    // Among overlapping markers (a joint puts two sockets on one spot): one this wire can join, else
    // one on the other side from the start, whose refusal explains what the user aimed at.
    const from = wire.from;
    const valid = (c: { part: PartId; socket: SocketId }) =>
      wireVerdict(docSig.value, cat, from, endOf(c)).verdict.ok;
    const opposite = (c: { part: PartId; socket: SocketId }) =>
      childSide(cat, from) ? parentSide(cat, endOf(c)) : childSide(cat, endOf(c));
    const first = pickSocket(e.ndc, undefined, valid);
    const hit = first && !valid(first) ? pickSocket(e.ndc, undefined, opposite) : first;
    const to = hit && !(hit.part === wire.from.part && hit.socket === wire.from.socket) ? endOf(hit) : null;
    const result = to ? wireVerdict(docSig.value, cat, wire.from, to).verdict : null;
    wire.to = to;
    wire.ok = result?.ok ?? false;
    const end = (to && socketWorld(cat, to)) ?? cursorAt(e.ndc, fromAt) ?? fromAt;
    wire.line.geometry.setFromPoints([fromAt, end]);
    (wire.line.material as LineBasicMaterial).color.set(
      result === null ? 0x4c8dff : result.ok ? 0x3fb950 : 0xf85149,
    );
    if (result && !result.ok) showTip(e.x, e.y, result.message, false);
    else if (result) showTip(e.x, e.y, 'Release to join', true);
    else hideTip();
    vp.request();
  };

  const join = (a: SocketEnd, b: SocketEnd) => {
    const cat = catalogSig.value;
    if (!cat) return;
    const { verdict, child, conn } = wireVerdict(docSig.value, cat, a, b);
    if (!verdict.ok || child === undefined || !conn) {
      toast(verdict.ok ? 'These sockets cannot be joined.' : verdict.message, 'warn');
      return;
    }
    commit('Connect', (d) => {
      addConn(d, cat, child, conn, { asPose: false });
    });
  };

  /**
   * A click on a free target. Shift+click gathers it (the picker opens on the gathered set, unless a
   * type is armed); a plain click places the armed type on everything gathered plus this target, or
   * opens the picker for them.
   */
  const target = (t: PlaceTarget, e: ToolPointer) => {
    const same = (u: PlaceTarget) => JSON.stringify(u) === JSON.stringify(t);
    const gathered = gatheredSig.value;
    const armed = armedSig.value;
    if (e.shift) {
      const next = gathered.some(same) ? gathered.filter((u) => !same(u)) : [...gathered, t];
      if (armed || next.length === 0) {
        pickerSig.value = null;
        gatheredSig.value = next;
        if (armed) showTip(e.x, e.y, `${next.length} chosen · click without Shift to place`, null);
      } else {
        openPicker({ x: e.x, y: e.y }, next);
        gatheredSig.value = next;
      }
      return;
    }
    const all = [...gathered.filter((u) => !same(u)), t];
    closePicker();
    hideTip();
    if (armed) placeParts(armed, all);
    else openPicker({ x: e.x, y: e.y }, all);
  };

  const click = (p: NonNullable<typeof press>, e: ToolPointer) => {
    const cat = catalogSig.value;
    if (!cat) return;
    if (p.point) return target(p.point, e);
    const s = p.socket!;
    if (start && !(start.part === s.part && start.socket === s.socket)) {
      const a = start;
      start = null;
      hideTip();
      return join(a, s);
    }
    if (parentSide(cat, s)) {
      const free = canBeParent(docSig.value, cat, s.part, s.socket);
      if (!free.ok && !childSide(cat, s)) {
        toast(free.message, 'warn');
        return;
      }
      if (free.ok) return target({ kind: 'socket', part: s.part, socket: s.socket }, e);
    }
    start = s;
    showTip(e.x, e.y, 'Click the socket to join it to · Esc cancels', null);
  };

  const reset = () => {
    endWire();
    hideTip();
    press = null;
    start = null;
    gatheredSig.value = [];
  };

  return {
    id: 'connect',
    activate() {},
    deactivate() {
      reset();
      closePicker();
      inner.deactivate();
    },
    onPointer(e: ToolPointer) {
      if (e.kind === 'move' && e.button === -1) {
        inner.onPointer!(e);
        if (start || gatheredSig.value.length > 0) return;
        const cat = catalogSig.value;
        const hit = cat ? pickSocket(e.ndc, undefined, (c) => freeParent(cat, c)) : null;
        if (cat && hit) {
          const info = socketInfo(docSig.value, cat, endOf(hit));
          showTip(e.x, e.y, info.text, info.ok);
        } else hideTip();
        return;
      }
      if (e.button !== 0) return;
      if (e.kind === 'down') {
        const doc = docSig.value;
        const cat = catalogSig.value;
        const s = cat ? pickSocket(e.ndc, undefined, (c) => freeParent(cat, c)) : null;
        const p = s ? null : pickPoint(e.ndc);
        const freePoint = p && cat && canTakeChild(doc, p.host, p.uuid).ok;
        if (s || freePoint) {
          press = {
            x: e.x,
            y: e.y,
            socket: s && endOf(s),
            point: freePoint ? { kind: 'point', host: p!.host, uuid: p!.uuid } : null,
          };
        } else {
          // A press on nothing to attach to closes the picker, then selects as usual.
          closePicker();
          inner.onPointer!(e);
        }
        return;
      }
      if (!press) return inner.onPointer!(e);
      if (e.kind === 'move') {
        if (!wire && press.socket && Math.hypot(e.x - press.x, e.y - press.y) > DRAG_PX) {
          const vp = getViewport();
          if (!vp) return;
          const line = new Line(
            new BufferGeometry(),
            new LineBasicMaterial({ color: 0x4c8dff, depthTest: false, transparent: true }),
          );
          line.renderOrder = 999;
          line.frustumCulled = false;
          vp.scene.add(line);
          wire = { from: press.socket, line, to: null, ok: false };
        }
        if (wire) updateWire(e);
      } else if (e.kind === 'up') {
        if (wire) {
          const { from, to, ok } = wire;
          endWire();
          hideTip();
          if (to && ok) join(from, to);
        } else click(press, e);
        press = null;
      }
    },
    onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return (inner.onKey?.(e) ?? false);
      if (wire || start || gatheredSig.value.length > 0 || pickerSig.value) {
        reset();
        closePicker();
        return true;
      }
      if (armedSig.value) {
        armedSig.value = null;
        return true;
      }
      return false;
    },
  };
}
