// Socket Workbench captures in IndexedDB (store `sockets`, key `overrides`).
import {
  emptySocketGeometry,
  parseSocketGeometry,
  type SocketGeometryFile,
} from '../core/socket-geometry';
import { idbGet, idbPut } from './idb';

/** The saved captures; an empty file when none are saved or storage is unavailable. */
export async function loadSocketOverrides(
  meshCoordinateSpace?: string,
): Promise<SocketGeometryFile> {
  const empty = () => ({
    ...emptySocketGeometry(),
    ...(meshCoordinateSpace ? { meshCoordinateSpace } : {}),
  });
  try {
    const stored = await idbGet<unknown>(
      'sockets',
      meshCoordinateSpace ? `overrides:${meshCoordinateSpace}` : 'overrides',
    );
    if (stored === undefined) return empty();
    const parsed = parseSocketGeometry(stored);
    return parsed.ok && parsed.file.meshCoordinateSpace === meshCoordinateSpace
      ? parsed.file
      : empty();
  } catch {
    return empty();
  }
}

/** Rejects with a StorageError when the browser cannot store it. */
export function saveSocketOverrides(file: SocketGeometryFile): Promise<void> {
  return idbPut(
    'sockets',
    file,
    file.meshCoordinateSpace ? `overrides:${file.meshCoordinateSpace}` : 'overrides',
  );
}
