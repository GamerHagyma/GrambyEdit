// Placing (spec §12.6): what the Place tool drops into the build — a part type, a saved creation, a
// paste or a generated shape — resolved to a sub-doc whose first root sits at the origin.
import { signal } from '@preact/signals';
import { Matrix4 } from 'three';
import { cfToMatrix4, IDENTITY_CF, matrix4ToCf } from '../core/cframe';
import { newPartProps } from '../core/defaults';
import { addPart } from '../core/ops/parts';
import { poseConn } from '../core/pose';
import type { CFrame12, Doc, PartId } from '../core/types';
import { getCreation } from '../storage/library';
import { setTool, toolSig, type ToolId } from '../tools/manager';
import { creationDoc } from './library';
import { settingsSig } from './settings';
import { select } from './selection';
import { canEditWorkspace, catalogSig, commit, docSig, viewBus } from './store';

export type PlaceSource =
  | { kind: 'part'; type: string }
  | { kind: 'creation'; id: string }
  | { kind: 'paste'; sub: Doc }
  | { kind: 'generated'; sub: Doc };

export const placeSig = signal<PlaceSource | null>(null);
/** The part type being dragged from the Parts dock, while the drag lasts (spec §13.1). */
export const dragTypeSig = signal<string | null>(null);
/** The tool to go back to when placing ends. */
let before: ToolId = 'select';

export function arm(src: PlaceSource): void {
  if (!canEditWorkspace()) return;
  if (toolSig.value !== 'place') before = toolSig.value;
  placeSig.value = src;
  setTool('place');
}

export function disarm(): void {
  placeSig.value = null;
  if (toolSig.value === 'place') setTool(before);
}

/** Starts an empty build immediately; normal placement remains armed in a nonempty build. */
export function placeFirstPart(type: string): boolean {
  if (!canEditWorkspace()) return false;
  const cat = catalogSig.value;
  if (docSig.value.parts.size !== 0 || !cat || !Object.hasOwn(cat.parts, type)) return false;
  const props = newPartProps(cat, type, settingsSig.value);
  let id: PartId = 0;
  commit(`Place ${type}`, (d) => {
    id = addPart(d, type, props);
    d.setLayout(id, IDENTITY_CF);
  });
  select([id], 'replace');
  disarm();
  viewBus.emit({ kind: 'frame-selection' });
  return true;
}

/** The roots' layouts made relative to the first root, which moves to the origin. */
export function rootedAtOrigin(doc: Doc): Doc {
  const roots = doc.order.filter((id) => poseConn(doc.parts.get(id)!) === undefined);
  if (roots.length === 0) return doc;
  const at = (id: PartId) => cfToMatrix4(doc.layout.get(id) ?? IDENTITY_CF);
  const back = new Matrix4().copy(at(roots[0])).invert();
  const layout = new Map<PartId, CFrame12>([[roots[0], IDENTITY_CF]]);
  for (const id of roots.slice(1)) layout.set(id, matrix4ToCf(back.clone().multiply(at(id))));
  return { ...doc, layout };
}

/** The sub-doc a source places: a new part takes the auto-color; a creation keeps its layout. */
export async function resolveSub(src: PlaceSource): Promise<Doc> {
  if (src.kind === 'part') {
    const cat = catalogSig.value;
    if (!cat) throw new Error('The part library is still loading.');
    const props = newPartProps(cat, src.type, settingsSig.value);
    return {
      parts: new Map([[1, { id: 1, type: src.type, conns: [], props, points: null }]]),
      order: [1],
      layout: new Map([[1, IDENTITY_CF]]),
      nextId: 2,
    };
  }
  if (src.kind === 'creation') {
    const record = await getCreation(src.id);
    if (!record) throw new Error('That creation is no longer in the library.');
    return rootedAtOrigin(creationDoc(record));
  }
  return rootedAtOrigin(src.sub);
}
