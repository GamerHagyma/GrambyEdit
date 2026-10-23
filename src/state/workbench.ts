// Socket Workbench state (spec §12.7): the part and socket being captured, and the captures,
// which override the catalog live through `socketOverridesSig` and persist in IndexedDB.
import { signal } from '@preact/signals';
import { approxSocketFrame, PLACEHOLDER_BOX } from '../core/approx';
import type { Catalog } from '../core/catalog-types';
import { roundCf } from '../core/cframe';
import { parseSocketGeometry, type SocketGeometryFile } from '../core/socket-geometry';
import type { CFrame12, SocketId } from '../core/types';
import { saveSocketOverrides } from '../storage/sockets';
import { socketOverridesSig } from './store';

export const wbTypeSig = signal<string | null>(null);
export const wbSocketSig = signal<SocketId | null>(null);
/** Shows a grey Part cube mated to the selected socket. */
export const wbMateSig = signal(false);

async function commitFile(file: SocketGeometryFile): Promise<void> {
  socketOverridesSig.value = file;
  await saveSocketOverrides(file);
}

/** Records a socket frame (part space, outward) and applies it everywhere at once. */
export async function captureSocket(
  type: string,
  socket: SocketId,
  cframe: CFrame12,
): Promise<void> {
  const file = socketOverridesSig.value;
  const entry = file.parts[type] ?? { sockets: {} };
  const parts = {
    ...file.parts,
    [type]: {
      ...entry,
      sockets: { ...entry.sockets, [socket]: { cframe: roundCf(cframe, 4, 6) } },
    },
  };
  await commitFile({ ...file, parts });
}

/** Forgets a capture; the socket falls back to its catalog frame. */
export async function clearSocket(type: string, socket: SocketId): Promise<void> {
  const file = socketOverridesSig.value;
  const entry = file.parts[type];
  if (!entry?.sockets[socket]) return;
  const sockets = { ...entry.sockets };
  delete sockets[socket];
  const parts = { ...file.parts };
  if (Object.keys(sockets).length === 0 && !entry.subParts) delete parts[type];
  else parts[type] = { ...entry, sockets };
  await commitFile({ ...file, parts });
}

/** Captured and total sockets per part type, most-used parts first (then by name). */
export function captureProgress(
  cat: Catalog,
  file: SocketGeometryFile,
): { type: string; captured: number; total: number; corpusCount: number }[] {
  return Object.values(cat.parts)
    .map((def) => {
      const done = file.parts[def.type]?.sockets ?? {};
      const ids = Object.keys(def.sockets);
      return {
        type: def.type,
        captured: ids.filter((id) => done[id]).length,
        total: ids.length,
        corpusCount: def.corpusCount,
      };
    })
    .sort((a, b) => b.corpusCount - a.corpusCount || (a.type < b.type ? -1 : 1));
}

/** The file to commit as `data/socket_geometry.json`: 2-space JSON dated today. */
export function exportSocketFile(file: SocketGeometryFile, now: Date = new Date()): string {
  const captured = now.toISOString().slice(0, 10);
  return JSON.stringify({ ...file, captured, method: 'socket-workbench' }, null, 2);
}

/** Replaces all captures with a file's contents. */
export async function importSocketFile(
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not valid JSON' };
  }
  const parsed = parseSocketGeometry(json);
  if (!parsed.ok) return parsed;
  await commitFile(parsed.file);
  return { ok: true };
}

const FACES: readonly (readonly [label: string, name: string])[] = [
  ['Face +X', 'Right'],
  ['Face −X', 'Left'],
  ['Face +Y', 'Top'],
  ['Face −Y', 'Bottom'],
  ['Face +Z', 'Back'],
  ['Face −Z', 'Front'],
];

/** Snap targets for a capture: bbox face centres, sub-part centres and named-socket hints. */
export function candidateSpots(cat: Catalog, type: string): { label: string; cframe: CFrame12 }[] {
  const def = cat.parts[type];
  const box = def?.mesh ?? PLACEHOLDER_BOX;
  const face = (name: string) =>
    approxSocketFrame({ ...box, socket: '', side: 'parent', name, parentSockets: [] });
  const out = FACES.map(([label, name]) => ({ label, cframe: face(name) }));
  for (const [name, sub] of Object.entries(def?.subParts ?? {})) {
    out.push({ label: `Sub-part ${name}`, cframe: sub.cframe });
  }
  for (const s of Object.values(def?.sockets ?? {})) {
    if (s.name && FACES.some(([, n]) => s.name!.toLowerCase().includes(n.toLowerCase()))) {
      out.push({ label: `Hint: ${s.name}`, cframe: face(s.name) });
    }
  }
  return out;
}
