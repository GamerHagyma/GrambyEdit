// Worker protocol contains only local authoring geometry and compact mount calibration.
import type { CapSize } from '../core/surfaces/build';
import {
  poseValidatorFromCalibration,
  type CurvedCalibration,
} from '../core/surfaces/build-curved';
import {
  tileCurved,
  type CurvedDiagnostics,
  type CurvedFailure,
} from '../core/surfaces/curved-tiling';
import type { PatchDraft } from '../core/surfaces/patches';

export interface SurfaceJobContext {
  readonly revision: number;
  readonly workspaceGeneration: number;
  readonly hostId: number;
  readonly hostType: string;
  readonly catalogGeneration: number;
  readonly settingsRevision: string;
}
export interface SurfaceJobInput {
  readonly context: SurfaceJobContext;
  readonly draft: PatchDraft;
  readonly cap: CapSize;
  readonly calibration: CurvedCalibration;
}
export type SurfaceWorkerMessage =
  | { readonly kind: 'generate'; readonly serial: number; readonly input: SurfaceJobInput }
  | { readonly kind: 'cancel'; readonly through: number };
export type SurfaceWorkerReply =
  | {
      kind: 'result';
      serial: number;
      ok: true;
      rows: number;
      values: Float64Array;
      diagnostics: CurvedDiagnostics;
    }
  | { kind: 'result'; serial: number; ok: false; code: CurvedFailure; error: string };

export async function runSurfaceJob(
  job: Extract<SurfaceWorkerMessage, { kind: 'generate' }>,
  cancelled: () => boolean,
  yieldControl: () => Promise<void>,
): Promise<SurfaceWorkerReply> {
  try {
    const { draft, cap, calibration } = job.input;
    const result = await tileCurved(draft, cap, {
      maxElements: 20_000,
      cancelled,
      yieldControl,
      poseForValidation: poseValidatorFromCalibration(calibration),
    });
    if (!result.ok) return { kind: 'result', serial: job.serial, ...result };
    const values = new Float64Array(result.tiles.length * 20);
    result.tiles.forEach((t, i) => {
      values.set(t.frame.elements, i * 20);
      values.set([t.u, t.v, t.row, t.col], i * 20 + 16);
    });
    return {
      kind: 'result',
      serial: job.serial,
      ok: true,
      rows: result.rows,
      values,
      diagnostics: result.diagnostics,
    };
  } catch (error) {
    return {
      kind: 'result',
      serial: job.serial,
      ok: false,
      code: 'invalid',
      error: `Surface generation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// This guard also permits importing runSurfaceJob in Node tests without a worker.
if (typeof document === 'undefined' && typeof postMessage === 'function') {
  let cancelledThrough = 0;
  const scope = globalThis as unknown as {
    onmessage: ((e: MessageEvent<SurfaceWorkerMessage>) => void) | null;
    postMessage(data: SurfaceWorkerReply, transfer: Transferable[]): void;
  };
  scope.onmessage = (e) => {
    const m = e.data;
    if (m.kind === 'cancel') {
      cancelledThrough = Math.max(cancelledThrough, m.through);
      return;
    }
    void runSurfaceJob(
      m,
      () => m.serial <= cancelledThrough,
      () => new Promise((resolve) => setTimeout(resolve, 0)),
    ).then((r) => scope.postMessage(r, r.ok ? [r.values.buffer as ArrayBuffer] : []));
  };
}
