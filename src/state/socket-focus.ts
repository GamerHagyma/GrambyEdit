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
export function socketMagnification(s: SocketCandidate): number {
  return s.side !== 'child' && shiftSocketSig.peek() && socketFocusSig.peek()?.(s)
    ? 1 + settingsSig.peek().shiftSocketEnlargement / 100
    : 1;
}
