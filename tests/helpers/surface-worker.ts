import {
  runSurfaceJob,
  type SurfaceWorkerMessage,
  type SurfaceWorkerReply,
} from '../../src/state/surface-worker';
/** Executes the real worker function in tests, preserving async cancellation boundaries. */
export class TestSurfaceWorker {
  static messages: SurfaceWorkerMessage[] = [];
  onmessage: ((e: { data: SurfaceWorkerReply }) => void) | null = null;
  onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null;
  private stopped = false;
  private through = 0;
  postMessage(m: SurfaceWorkerMessage) {
    TestSurfaceWorker.messages.push(m);
    if (m.kind === 'cancel') {
      this.through = Math.max(this.through, m.through);
      return;
    }
    void runSurfaceJob(
      m,
      () => this.stopped || m.serial <= this.through,
      () => new Promise((resolve) => setTimeout(resolve, 0)),
    ).then((r) => {
      if (!this.stopped) this.onmessage?.({ data: r });
    });
  }
  terminate() {
    this.stopped = true;
  }
}
