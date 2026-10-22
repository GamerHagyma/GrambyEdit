// The dev-only `window.__ge` API that browser checks drive (plan "Browser verification").
import type { Poses } from '../core/pose';
import type { Doc, PartId } from '../core/types';

export interface GeDebug {
  importCode(code: string): void;
  instanceCount(type?: string): number;
  drawCalls(): number;
  doc(): Doc;
  poses(): Poses;
  selection(): PartId[];
  fps(ms?: number): Promise<number>;
  /** Renders one frame synchronously (hidden tabs pause requestAnimationFrame). */
  renderNow(): void;
  /** Camera eye, target and distance, rounded to 1e-3. */
  camera(): { eye: number[]; target: number[]; distance: number; ortho: boolean };
  /** Screen position of a part's origin, in client pixels. */
  project(id: PartId): { x: number; y: number };
  pick(x: number, y: number): { part: PartId; subPart: string } | null;
}

declare global {
  interface Window {
    __ge?: GeDebug;
  }
}

export function registerDebug(api: GeDebug): () => void {
  if (!import.meta.env.DEV) return () => {};
  window.__ge = api;
  return () => {
    if (window.__ge === api) delete window.__ge;
  };
}
