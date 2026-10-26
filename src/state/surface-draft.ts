// Local surface recipe, draft history and latest-only worker ownership. Never a Doc.
import { computed, signal } from '@preact/signals';
import { Matrix4 } from 'three';
import type { Vec3 } from '../core/catalog-types';
import type { AcceptedCurvedTiles } from '../core/surfaces/build-curved';
import {
  coonsPatch,
  editPatch,
  quadPatch,
  splitPatch,
  type Cubic,
  type PatchDraft,
  type PatchEdit,
} from '../core/surfaces/patches';
import type { Corners, Tile } from '../core/surfaces/tiling';
import type {
  SurfaceJobContext,
  SurfaceJobInput,
  SurfaceWorkerMessage,
  SurfaceWorkerReply,
} from './surface-worker';
import { toast } from './toasts';

export type SurfaceWorkerPort = Pick<Worker, 'onmessage' | 'onerror' | 'postMessage' | 'terminate'>;
export interface SurfaceJobState {
  readonly status: 'idle' | 'pending' | 'ready' | 'error';
  readonly context: SurfaceJobContext | null;
  readonly result?: AcceptedCurvedTiles;
  readonly error?: string;
}
export function createSurfaceJobQueue(factory: () => SurfaceWorkerPort) {
  const state = signal<SurfaceJobState>({ status: 'idle', context: null });
  let port: SurfaceWorkerPort | null = null,
    serial = 0,
    latest = 0,
    lastKey = '';
  let running: { serial: number; input: SurfaceJobInput } | null = null,
    pending: SurfaceJobInput | null = null;
  const broken = (message: string) => {
    port?.terminate();
    port = null;
    running = null;
    pending = null;
    state.value = { status: 'error', context: state.peek().context, error: message };
  };
  const start = (input: SurfaceJobInput) => {
    try {
      if (!port) {
        port = factory();
        const owner = port;
        port.onerror = (e) => {
          if (port !== owner) return;
          e.preventDefault();
          broken(e.message || 'Surface worker failed.');
        };
        port.onmessage = (event: MessageEvent<SurfaceWorkerReply>) => {
          if (port !== owner) return;
          const reply = event.data;
          if (!running || reply.serial !== running.serial) return;
          const done = running;
          running = null;
          if (reply.serial === latest) {
            if (!reply.ok)
              state.value = { status: 'error', context: done.input.context, error: reply.error };
            else if (
              !(reply.values instanceof Float64Array) ||
              !reply.values.length ||
              reply.values.length % 20 !== 0 ||
              reply.values.length > 20_000 * 20 ||
              !reply.values.every(Number.isFinite)
            ) {
              broken('The surface worker returned invalid native poses.');
              return;
            } else {
              const tiles: Tile[] = [];
              for (let i = 0; i < reply.values.length; i += 20)
                tiles.push({
                  frame: new Matrix4().fromArray(reply.values, i),
                  u: reply.values[i + 16],
                  v: reply.values[i + 17],
                  row: reply.values[i + 18],
                  col: reply.values[i + 19],
                });
              state.value = {
                status: 'ready',
                context: done.input.context,
                result: { ok: true, rows: reply.rows, tiles, diagnostics: reply.diagnostics },
              };
            }
          }
          if (pending) {
            const next = pending;
            pending = null;
            start(next);
          }
        };
      }
      const id = latest;
      running = { serial: id, input };
      port.postMessage({ kind: 'generate', serial: id, input } satisfies SurfaceWorkerMessage);
    } catch (e) {
      broken(e instanceof Error ? e.message : 'Could not start surface worker.');
    }
  };
  const cancel = () => {
    latest = ++serial;
    lastKey = '';
    pending = null;
    if (running)
      port?.postMessage({ kind: 'cancel', through: running.serial } satisfies SurfaceWorkerMessage);
    state.value = { status: 'idle', context: null };
  };
  return {
    state,
    request(input: SurfaceJobInput) {
      const key = JSON.stringify(input.context);
      if (key === lastKey) return;
      lastKey = key;
      latest = ++serial;
      state.value = { status: 'pending', context: input.context };
      if (running) {
        pending = input;
        port?.postMessage({
          kind: 'cancel',
          through: running.serial,
        } satisfies SurfaceWorkerMessage);
      } else start(input);
    },
    cancel,
    error(context: SurfaceJobContext, message: string) {
      cancel();
      state.value = { status: 'error', context, error: message };
    },
    dispose() {
      cancel();
      port?.terminate();
      port = null;
      running = null;
    },
  };
}

export const surfaceJobs = createSurfaceJobQueue(
  () => new Worker(new URL('./surface-worker.ts', import.meta.url), { type: 'module' }),
);
interface SurfaceDraftState {
  readonly mode: 'quad' | 'profiles';
  readonly curved: boolean;
  readonly quad: PatchDraft | null;
  readonly profiles: PatchDraft | null;
  readonly selected: readonly string[];
  readonly profile: number;
  readonly column: number;
  readonly revision: number;
}
const initial = (): SurfaceDraftState => ({
  mode: 'quad',
  curved: false,
  quad: null,
  profiles: null,
  selected: [],
  profile: 0,
  column: 0,
  revision: 0,
});
export const surfaceDraftSig = signal<SurfaceDraftState>(initial());
export const activeSurfacePatchSig = computed(() => {
  const s = surfaceDraftSig.value;
  return s.mode === 'profiles' ? s.profiles : s.curved ? s.quad : null;
});
const histories = {
  quad: { undo: [] as PatchDraft[], redo: [] as PatchDraft[] },
  profiles: { undo: [] as PatchDraft[], redo: [] as PatchDraft[] },
};
export const surfaceDraftHistorySig = signal({ undo: 0, redo: 0 });
function historyChanged() {
  const h = histories[surfaceDraftSig.peek().mode];
  surfaceDraftHistorySig.value = { undo: h.undo.length, redo: h.redo.length };
}
function replace(draft: PatchDraft, record = true) {
  const s = surfaceDraftSig.peek(),
    current = s.mode === 'quad' ? s.quad : s.profiles;
  if (record && current) {
    const h = histories[s.mode];
    h.undo.push(current);
    h.undo = h.undo.slice(-50);
    h.redo = [];
  }
  surfaceDraftSig.value = {
    ...s,
    [s.mode]: draft,
    revision: s.revision + 1,
    profile: Math.min(s.profile, draft.vBreaks.length - 1),
    column: Math.min(s.column, draft.uBreaks.length - 1),
    selected: s.selected.filter((id) => Object.hasOwn(draft.points, id)),
  };
  historyChanged();
}
export function resetSurfaceDraft(corners?: Corners): void {
  const revision = surfaceDraftSig.peek().revision + 1;
  surfaceDraftSig.value = { ...initial(), quad: corners ? quadPatch(corners) : null, revision };
  for (const h of Object.values(histories)) {
    h.undo = [];
    h.redo = [];
  }
  historyChanged();
  surfaceJobs.dispose();
}
export function setSurfaceMode(mode: 'quad' | 'profiles', corners: Corners): void {
  const s = surfaceDraftSig.peek();
  surfaceDraftSig.value = {
    ...s,
    mode,
    revision: s.revision + 1,
    selected: [],
    profiles:
      mode === 'profiles' && !s.profiles
        ? s.curved && s.quad
          ? s.quad
          : quadPatch(corners)
        : s.profiles,
  };
  historyChanged();
}
export function setSurfaceCurves(curved: boolean, corners: Corners): void {
  const s = surfaceDraftSig.peek();
  surfaceDraftSig.value = {
    ...s,
    curved,
    quad: s.quad ?? quadPatch(corners),
    selected: [],
    revision: s.revision + 1,
  };
}
export function startProfilesFromQuad(corners: Corners): void {
  const s = surfaceDraftSig.peek();
  surfaceDraftSig.value = {
    ...s,
    mode: 'profiles',
    profiles: s.curved && s.quad ? s.quad : quadPatch(corners),
    profile: 0,
    column: 0,
    selected: [],
    revision: s.revision + 1,
  };
  histories.profiles.undo = [];
  histories.profiles.redo = [];
  historyChanged();
}
export function selectSurfaceControl(id: string | null, add = false): void {
  const s = surfaceDraftSig.peek(),
    d = activeSurfacePatchSig.peek();
  if (id && !d?.points[id]) return;
  const selected =
    id === null
      ? []
      : add
        ? s.selected.includes(id)
          ? s.selected.filter((n) => n !== id)
          : [...s.selected, id]
        : [id];
  const row = id && d ? d.grid.findIndex((r) => r.includes(id)) : -1;
  const col = row >= 0 && id ? d!.grid[row].indexOf(id) : -1;
  surfaceDraftSig.value = {
    ...s,
    selected,
    profile: s.mode === 'profiles' && row >= 0 && row % 3 === 0 ? row / 3 : s.profile,
    column: s.mode === 'profiles' && col >= 0 && col % 3 === 0 ? col / 3 : s.column,
  };
}
export function selectSurfaceProfile(profile: number, add = false): void {
  const s = surfaceDraftSig.peek(),
    d = activeSurfacePatchSig.peek();
  if (!d || !d.grid[profile * 3]) return;
  const row = d.grid[profile * 3];
  const selected = !add
    ? [...row]
    : row.every((id) => s.selected.includes(id))
      ? s.selected.filter((id) => !row.includes(id))
      : [...new Set([...s.selected, ...row])];
  surfaceDraftSig.value = { ...s, profile, selected };
}
export function selectSurfaceColumn(column: number): void {
  const s = surfaceDraftSig.peek(),
    d = activeSurfacePatchSig.peek();
  if (!d || column < 0 || column >= d.uBreaks.length) return;
  surfaceDraftSig.value = { ...s, column };
}
/** Curved Quad keeps its interior controls derived from its four boundaries. */
function boundaryPatch(draft: PatchDraft): PatchDraft {
  const edge = (ids: readonly string[]) => ids.map((id) => draft.points[id]) as unknown as Cubic;
  const r = coonsPatch([
    edge(draft.grid[0]),
    edge(draft.grid[3]),
    edge(draft.grid.map((r) => r[0])),
    edge(draft.grid.map((r) => r[3])),
  ]);
  if (!r.ok) return draft;
  // Coons uses the same 4x4 c0..c15 IDs as the quad seed.
  return r.draft;
}
export function applySurfaceEdit(edit: PatchEdit): boolean {
  const d = activeSurfacePatchSig.peek();
  if (!d) return false;
  const result = editPatch(d, edit);
  if (!result.ok) {
    toast(result.error, 'warn');
    return false;
  }
  replace(surfaceDraftSig.peek().mode === 'quad' ? boundaryPatch(result.draft) : result.draft);
  return true;
}
export function syncSurfaceQuadCorners(corners: Corners): void {
  const s = surfaceDraftSig.peek();
  if (!s.quad) return;
  const d = s.quad,
    ids = [d.grid[0][0], d.grid[0][3], d.grid[3][3], d.grid[3][0]];
  const r = editPatch(d, {
    kind: 'move',
    positions: Object.fromEntries(ids.map((id, i) => [id, corners[i]])),
  });
  if (!r.ok) return;
  surfaceDraftSig.value = { ...s, quad: boundaryPatch(r.draft), revision: s.revision + 1 };
  histories.quad.undo = [];
  histories.quad.redo = [];
  historyChanged();
}
export function addSurfaceSection(axis: 'u' | 'v'): void {
  const s = surfaceDraftSig.peek(),
    d = activeSurfacePatchSig.peek();
  if (!d || s.mode !== 'profiles') return;
  const b = axis === 'u' ? d.uBreaks : d.vBreaks;
  const index = Math.min(axis === 'u' ? s.column : s.profile, b.length - 2);
  const r = splitPatch(d, axis, (b[index] + b[index + 1]) / 2);
  if (!r.ok) {
    toast(r.error, 'warn');
    return;
  }
  replace(r.draft);
  if (axis === 'v') selectSurfaceProfile(index + 1);
  else selectSurfaceColumn(index + 1);
}
export function undoSurfaceEdit(): void {
  const h = histories[surfaceDraftSig.peek().mode],
    d = activeSurfacePatchSig.peek();
  if (!d) return;
  const previous = h.undo.pop();
  if (!previous) return;
  h.redo.push(d);
  replace(previous, false);
}
export function redoSurfaceEdit(): void {
  const h = histories[surfaceDraftSig.peek().mode],
    d = activeSurfacePatchSig.peek();
  if (!d) return;
  const next = h.redo.pop();
  if (!next) return;
  h.undo.push(d);
  replace(next, false);
}
export function previewSurfacePositions(
  from: PatchDraft,
  positions: Readonly<Record<string, Vec3>>,
): void {
  const r = editPatch(from, { kind: 'move', positions });
  if (r.ok)
    replace(surfaceDraftSig.peek().mode === 'quad' ? boundaryPatch(r.draft) : r.draft, false);
}
export function finishSurfaceDrag(from: PatchDraft, cancel: boolean): void {
  if (cancel) {
    replace(from, false);
    return;
  }
  const current = activeSurfacePatchSig.peek();
  if (!current) return;
  const ids = Object.keys(from.points);
  // Rebuilding a Coons guide or round-tripping a world-space drag can add
  // floating-point noise. Neither that nor a rejected move is a history edit.
  if (
    ids.length === Object.keys(current.points).length &&
    ids.every((id) => current.points[id]?.every((n, k) => Math.abs(n - from.points[id][k]) <= 1e-9))
  )
    return;
  const h = histories[surfaceDraftSig.peek().mode];
  h.undo.push(from);
  h.undo = h.undo.slice(-50);
  h.redo = [];
  historyChanged();
}
export function straightenSurfaceSegment(): void {
  const d = activeSurfacePatchSig.peek(),
    s = surfaceDraftSig.peek();
  if (!d) return;
  const row = d.grid[3 * s.profile],
    c = 3 * Math.min(s.column, d.uBreaks.length - 2);
  const a = d.points[row[c]],
    b = d.points[row[c + 3]];
  const at = (t: number): Vec3 => [
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t,
  ];
  applySurfaceEdit({
    kind: 'move',
    positions: { [row[c + 1]]: at(1 / 3), [row[c + 2]]: at(2 / 3) },
  });
}
export function resetSurfaceEdgeHandles(): void {
  const d = activeSurfacePatchSig.peek();
  if (!d || surfaceDraftSig.peek().mode !== 'quad') return;
  replace(
    quadPatch([
      d.points[d.grid[0][0]],
      d.points[d.grid[0][3]],
      d.points[d.grid[3][3]],
      d.points[d.grid[3][0]],
    ]),
  );
}
export function removeSurfaceSection(axis: 'u' | 'v'): void {
  const s = surfaceDraftSig.peek();
  if (!applySurfaceEdit({ kind: 'remove', axis, index: axis === 'u' ? s.column : s.profile }))
    return;
  const d = activeSurfacePatchSig.peek()!;
  if (axis === 'v') selectSurfaceProfile(Math.min(s.profile, d.vBreaks.length - 1));
  else selectSurfaceColumn(Math.min(s.column, d.uBreaks.length - 1));
}
