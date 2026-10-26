import { Matrix4 } from 'three';
import {
  createSurfaceJobQueue,
  type SurfaceWorkerPort,
  resetSurfaceDraft,
  setSurfaceMode,
  setSurfaceCurves,
  surfaceDraftSig,
  activeSurfacePatchSig,
  addSurfaceSection,
  applySurfaceEdit,
  undoSurfaceEdit,
  redoSurfaceEdit,
} from '../../src/state/surface-draft';
import {
  runSurfaceJob,
  type SurfaceJobInput,
  type SurfaceWorkerMessage,
  type SurfaceWorkerReply,
} from '../../src/state/surface-worker';
import { curvedPoseValidator } from '../../src/core/surfaces/build-curved';
import { capSize } from '../../src/core/surfaces/build';
import { quadPatch } from '../../src/core/surfaces/patches';
import { realCatalog } from '../helpers/real-catalog';
import { docSig, historySig } from '../../src/state/store';

const corners = [
  [0, 2, 0],
  [4, 2, 0],
  [4, 2, -3],
  [0, 2, -3],
] as const;
class FakeWorker {
  onmessage: ((e: { data: SurfaceWorkerReply }) => void) | null = null;
  onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null;
  messages: SurfaceWorkerMessage[] = [];
  terminated = false;
  postMessage(m: SurfaceWorkerMessage) {
    this.messages.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  get port() {
    return this as unknown as SurfaceWorkerPort;
  }
  reply(index: number, values = new Float64Array([...new Matrix4().elements, 0.5, 0.5, 0, 0])) {
    const job = this.messages[index];
    if (job.kind !== 'generate') throw new Error('Expected geometry job');
    this.onmessage?.({
      data: {
        kind: 'result',
        serial: job.serial,
        ok: true,
        rows: 1,
        values,
        diagnostics: {
          maxAssignedDeviation: 0,
          maxFootprintDeviation: 0,
          minProjectionStretch: 1,
          boundaryTiles: 1,
          creaseTiles: 0,
        },
      },
    });
  }
}
function input(revision: number): SurfaceJobInput {
  return {
    context: {
      revision,
      workspaceGeneration: 1,
      hostId: 1,
      hostType: 'Part',
      catalogGeneration: 1,
      settingsRevision: '3/5/plain',
    },
    draft: quadPatch(corners),
    cap: { width: 0.6446, height: 0.6446, thickness: 0.1, center: [0, 0, 0] },
    calibration: {
      sub: [...new Matrix4().elements],
      socket: [...new Matrix4().elements],
      center: [0, 0, 0],
      conventions: {
        mating: 'rx180',
        orientationOrder: 'ZYX',
        orientationOnPoints: true,
        orientationPivot: 'part',
        orientationSigns: [-1, -1, -1],
      },
      precision: { posDecimals: 3, rotDecimals: 5 },
      staggered: false,
    },
  };
}

test('one running job retains only the newest pending draft and ignores stale replies', () => {
  const worker = new FakeWorker(),
    q = createSurfaceJobQueue(() => worker.port);
  q.request(input(1));
  q.request(input(2));
  q.request(input(3));
  expect(q.state.value.status).toBe('pending');
  expect(worker.messages.filter((m) => m.kind === 'generate')).toHaveLength(1);
  worker.reply(0);
  expect(q.state.value.status).toBe('pending');
  const next = worker.messages.findIndex(
    (m) => m.kind === 'generate' && m.input.context.revision === 3,
  );
  expect(next).toBeGreaterThan(0);
  worker.reply(0);
  expect(q.state.value.status).toBe('pending');
  worker.reply(next);
  expect(q.state.value.status).toBe('ready');
  expect(q.state.value.context?.revision).toBe(3);
  q.request(input(3));
  expect(worker.messages.filter((m) => m.kind === 'generate')).toHaveLength(2);
  q.dispose();
});

test('workspace/catalog/precision identity changes invalidate an in-flight result', () => {
  const worker = new FakeWorker(),
    q = createSurfaceJobQueue(() => worker.port);
  const first = input(1);
  q.request(first);
  q.request({
    ...first,
    context: {
      ...first.context,
      workspaceGeneration: 2,
      catalogGeneration: 2,
      settingsRevision: '6/8/plain',
    },
  });
  worker.reply(0);
  expect(q.state.value.status).toBe('pending');
  q.cancel();
  worker.reply(worker.messages.findLastIndex((m) => m.kind === 'generate'));
  expect(q.state.value.status).toBe('idle');
  q.dispose();
});

test('worker failure and malformed frames are visible errors; disposal ignores late messages', () => {
  const worker = new FakeWorker(),
    q = createSurfaceJobQueue(() => worker.port);
  q.request(input(1));
  worker.reply(0, new Float64Array([NaN]));
  expect(q.state.value.status).toBe('error');
  q.dispose();
  worker.reply(0);
  worker.onerror?.({ message: 'Late worker error', preventDefault() {} });
  expect(q.state.value.status).toBe('idle');
  expect(worker.terminated).toBe(true);
  const second = new FakeWorker(),
    p = createSurfaceJobQueue(() => second.port);
  p.request(input(1));
  second.onerror?.({ message: 'Geometry worker stopped', preventDefault() {} });
  expect(p.state.value.status).toBe('error');
  expect(p.state.value.error).toContain('Geometry worker stopped');
  p.dispose();
});

test('worker uses serializable calibration and returns transferable native frame data', async () => {
  const cat = await realCatalog();
  const spec = {
    hostType: 'Part',
    colorEnabled: false,
    color: { mode: 'single' as const, rgb: [128, 128, 128] as const },
  };
  const validator = curvedPoseValidator(spec, cat, cat.conventions, {
    posDecimals: 3,
    rotDecimals: 5,
  });
  if (!validator.ok) throw new Error(validator.error);
  const request = { ...input(1), cap: capSize(cat)!, calibration: validator.calibration };
  const r = await runSurfaceJob(
    { kind: 'generate', serial: 42, input: structuredClone(request) },
    () => false,
    async () => {},
  );
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.serial).toBe(42);
    expect(r.values).toBeInstanceOf(Float64Array);
    expect(r.values.length % 20).toBe(0);
    expect(r.values.every(Number.isFinite)).toBe(true);
  }
  const cancelled = await runSurfaceJob(
    { kind: 'generate', serial: 43, input: request },
    () => true,
    async () => {},
  );
  expect(cancelled.ok).toBe(false);
  if (!cancelled.ok) expect(cancelled.code).toBe('cancelled');
});

test('profile insertion, edits and draft undo never touch blueprint history', () => {
  resetSurfaceDraft();
  const doc = docSig.value,
    history = historySig.value;
  setSurfaceMode('profiles', corners);
  addSurfaceSection('v');
  expect(activeSurfacePatchSig.value?.vBreaks).toEqual([0, 0.5, 1]);
  const d = activeSurfacePatchSig.value!,
    id = d.grid[3][0],
    p = d.points[id];
  applySurfaceEdit({ kind: 'move', positions: { [id]: [p[0], p[1] + 1, p[2]] } });
  expect(activeSurfacePatchSig.value!.points[id][1]).toBe(3);
  undoSurfaceEdit();
  expect(activeSurfacePatchSig.value!.points[id][1]).toBe(2);
  redoSurfaceEdit();
  expect(activeSurfacePatchSig.value!.points[id][1]).toBe(3);
  expect(docSig.value).toBe(doc);
  expect(historySig.value).toBe(history);
  expect(surfaceDraftSig.value.mode).toBe('profiles');
  resetSurfaceDraft();
});

test('starting Profiles while Curve edges is off uses the visible straight quad', () => {
  resetSurfaceDraft();
  setSurfaceCurves(true, corners);
  const d = activeSurfacePatchSig.value!,
    id = d.grid[0][1],
    p = d.points[id];
  applySurfaceEdit({ kind: 'move', positions: { [id]: [p[0], p[1] + 1, p[2]] } });
  setSurfaceCurves(false, corners);
  setSurfaceMode('profiles', corners);
  expect(activeSurfacePatchSig.value!.points[id][1]).toBe(2);
  setSurfaceMode('quad', corners);
  setSurfaceCurves(true, corners);
  expect(activeSurfacePatchSig.value!.points[id][1]).toBe(3);
  resetSurfaceDraft();
});
