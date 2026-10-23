// Socket Workbench captures in IndexedDB (store `sockets`, key `overrides`).
import {
  emptySocketGeometry,
  parseSocketGeometry,
  type SocketGeometryFile,
} from '../core/socket-geometry';
import { idbGet, idbPut } from './idb';

/** The saved captures; an empty file when none are saved or storage is unavailable. */
export async function loadSocketOverrides(): Promise<SocketGeometryFile> {
  try {
    const stored = await idbGet<unknown>('sockets', 'overrides');
    if (stored === undefined) return emptySocketGeometry();
    const parsed = parseSocketGeometry(stored);
    return parsed.ok ? parsed.file : emptySocketGeometry();
  } catch {
    return emptySocketGeometry();
  }
}

/** Rejects with a StorageError when the browser cannot store it. */
export function saveSocketOverrides(file: SocketGeometryFile): Promise<void> {
  return idbPut('sockets', file, 'overrides');
}
