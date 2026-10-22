// The mounted viewport, shared with picking and tools without an import cycle through index.ts.
import type { Scene, Vector2, WebGLRenderer } from 'three';
import type { CameraRig } from './cameras/rig';
import type { PartsLayer } from './parts-layer';
import type { SocketsLayer } from './sockets-layer';

export interface ViewportContext {
  readonly rig: CameraRig;
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly canvas: HTMLCanvasElement;
  layer: PartsLayer | null;
  readonly sockets: SocketsLayer | null;
  request(): void;
  ndc(e: { clientX: number; clientY: number }): Vector2;
}

let current: ViewportContext | null = null;

/** The mounted viewport, for picking and tools; null when none is mounted. */
export function getViewport(): ViewportContext | null {
  return current;
}

export function setViewport(ctx: ViewportContext | null): void {
  current = ctx;
}
