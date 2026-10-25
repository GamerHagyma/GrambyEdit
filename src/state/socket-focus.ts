// Transient Shift state and the carrying tool's compatibility predicate. Nothing enters Doc/network.
import { signal } from '@preact/signals';
import { settingsSig } from './settings';
export interface SocketCandidate {
  part: number;
  socket: string;
  side?: 'child' | 'parent';
}
export const shiftSocketSig = signal(false);
export const socketFocusSig = signal<((s: SocketCandidate) => boolean) | null>(null);
/** Cursor in viewport NDC; local presentation only. */
export const socketCursorSig = signal<{ x: number; y: number } | null>(null);
export function socketInfluence(s: SocketCandidate, distancePx: number): number {
  if (s.side === 'child' || !shiftSocketSig.peek() || !socketFocusSig.peek()?.(s)) return 0;
  const t = Math.min(1, Math.max(0, distancePx / settingsSig.peek().shiftSocketRadius));
  return Number.isFinite(t) ? (1 - t) ** 2 * (1 + 2 * t) : 0;
}
export function socketMagnification(s: SocketCandidate, distancePx = Infinity): number {
  return 1 + (settingsSig.peek().shiftSocketEnlargement / 100) * socketInfluence(s, distancePx);
}
