// Picking (spec §11.2): rays narrowed by the BVH, exact triangle tests on the few candidates.
import {
  DoubleSide,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
} from 'three';
import { partGeometry } from '../assets/geometry';
import { PLACEHOLDER_BOX } from '../core/approx';
import type { Catalog } from '../core/catalog-types';
import { cfToMatrix4 } from '../core/cframe';
import { subPartMatrix, type Poses } from '../core/pose';
import type { Doc, PartId, SocketId, Uuid } from '../core/types';
import { posesSig } from '../state/derived';
import { hiddenSig, selectionSig } from '../state/selection';
import { assetsSig, catalogSig, docSig } from '../state/store';
import { SphereBVH } from './bvh';
import { getViewport } from './context';
import { readIds } from './id-pass';

export interface Hit {
  part: PartId;
  point: Vector3;
  normal: Vector3;
  subPart: string;
  distance: number;
}

/** Screen-space pick radius for sockets and points, in CSS pixels. */
const MARKER_PICK_PX = 12;

const bvhCache = new WeakMap<Poses, { doc: Doc; bvh: SphereBVH }>();

/** Part bounding spheres (bbox centre and half diagonal), rebuilt when poses change. */
function bvhFor(doc: Doc, poses: Poses, cat: Catalog | null): SphereBVH {
  const hit = bvhCache.get(poses);
  if (hit && hit.doc === doc) return hit.bvh;
  const items = [];
  const c = new Vector3();
  for (const id of doc.order) {
    const m = poses.world.get(id);
    if (!m) continue;
    const box = cat?.parts[doc.parts.get(id)!.type]?.mesh ?? PLACEHOLDER_BOX;
    c.set(
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    ).applyMatrix4(m);
    const radius =
      Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) / 2;
    items.push({ id, center: [c.x, c.y, c.z] as const, radius });
  }
  const bvh = new SphereBVH(items);
  bvhCache.set(poses, { doc, bvh });
  return bvh;
}

const probe = new Mesh(undefined, new MeshBasicMaterial({ side: DoubleSide }));
probe.matrixAutoUpdate = false;

function rayAt(ndc: Vector2): Raycaster | null {
  const vp = getViewport();
  if (!vp) return null;
  const r = new Raycaster();
  r.setFromCamera(ndc, vp.rig.camera);
  return r;
}

/** The visible part under `ndc`, with the sub-part whose triangles were hit. */
export function pickPart(ndc: Vector2): Hit | null {
  const ray = rayAt(ndc);
  const assets = assetsSig.value;
  if (!ray || !assets) return null;
  const doc = docSig.value;
  const poses = posesSig.value;
  const hidden = hiddenSig.value;
  const cat = catalogSig.value;
  const o = ray.ray.origin;
  const d = ray.ray.direction;
  let best: Hit | null = null;
  for (const id of bvhFor(doc, poses, cat).rayCandidates([o.x, o.y, o.z], [d.x, d.y, d.z])) {
    if (hidden.has(id)) continue;
    const part = doc.parts.get(id);
    const world = poses.world.get(id);
    if (!part || !world) continue;
    probe.geometry = partGeometry(assets, part.type);
    probe.matrixWorld.copy(world);
    const hits: Intersection[] = [];
    probe.raycast(ray, hits);
    for (const h of hits) {
      if (best && h.distance >= best.distance) continue;
      const normal = (h.face?.normal ?? new Vector3(0, 1, 0)).clone().transformDirection(world);
      best = {
        part: id,
        point: h.point.clone(),
        normal,
        subPart: subPartAt(cat, part.type, h.faceIndex ?? 0),
        distance: h.distance,
      };
    }
  }
  return best;
}

/** The sub-part whose triangle range holds `faceIndex`; the main piece for placeholders. */
function subPartAt(cat: Catalog | null, type: string, faceIndex: number): string {
  const def = cat?.parts[type];
  const assets = assetsSig.value;
  const entry = def?.mesh && assets ? assets.manifest.meshes[def.mesh.id] : undefined;
  const at = faceIndex * 3;
  const group = entry?.groups.find((g) => at >= g.start && at < g.start + g.count);
  return group?.subPart ?? def?.mainPartName ?? type;
}

/** World position and screen distance of a marker, or null when it is behind the camera. */
function screenDistance(world: Vector3, ndc: Vector2): number | null {
  const vp = getViewport()!;
  const v = world.clone().project(vp.rig.camera);
  if (v.z > 1) return null;
  const dx = ((v.x - ndc.x) / 2) * vp.canvas.clientWidth;
  const dy = ((v.y - ndc.y) / 2) * vp.canvas.clientHeight;
  return Math.hypot(dx, dy);
}

/** The displayed socket nearest the cursor, within a small screen radius. */
export function pickSocket(ndc: Vector2): { part: PartId; socket: SocketId } | null {
  const vp = getViewport();
  if (!vp) return null;
  let best: { part: PartId; socket: SocketId } | null = null;
  let bestPx = MARKER_PICK_PX;
  for (const s of vp.sockets?.shown() ?? []) {
    const px = screenDistance(s.world, ndc);
    if (px !== null && px < bestPx) [bestPx, best] = [px, { part: s.part, socket: s.socket }];
  }
  return best;
}

/** World position of an ephemeral point. */
export function pointWorld(
  doc: Doc,
  poses: Poses,
  cat: Catalog,
  host: PartId,
  uuid: Uuid,
): Vector3 | null {
  const part = doc.parts.get(host);
  const point = part?.points?.get(uuid);
  const world = poses.world.get(host);
  if (!part || !point || !world) return null;
  const m = new Matrix4()
    .copy(world)
    .multiply(subPartMatrix(cat, part.type, point.partName).m)
    .multiply(cfToMatrix4(point.cframe));
  return new Vector3().setFromMatrixPosition(m);
}

/** The point nearest the cursor among selected hosts' points (all points when `all`). */
export function pickPoint(ndc: Vector2, all = false): { host: PartId; uuid: Uuid } | null {
  const cat = catalogSig.value;
  if (!getViewport() || !cat) return null;
  const doc = docSig.value;
  const poses = posesSig.value;
  const hosts = all ? doc.order : [...selectionSig.value.parts];
  let best: { host: PartId; uuid: Uuid } | null = null;
  let bestPx = MARKER_PICK_PX;
  for (const host of hosts) {
    for (const uuid of doc.parts.get(host)?.points?.keys() ?? []) {
      const w = pointWorld(doc, poses, cat, host, uuid);
      const px = w && screenDistance(w, ndc);
      if (px !== null && px !== undefined && px < bestPx) [bestPx, best] = [px, { host, uuid }];
    }
  }
  return best;
}

/** Parts inside a screen rectangle (CSS px, client coordinates): visible ones only, or x-ray. */
export function partsInRect(
  rect: { x0: number; y0: number; x1: number; y1: number },
  mode: 'visible' | 'xray',
): Set<PartId> {
  const vp = getViewport();
  if (!vp?.layer) return new Set();
  if (mode === 'visible') return readIds(vp, rect);
  const out = new Set<PartId>();
  const doc = docSig.value;
  const poses = posesSig.value;
  const hidden = hiddenSig.value;
  const r = vp.canvas.getBoundingClientRect();
  const [x0, x1] = [Math.min(rect.x0, rect.x1), Math.max(rect.x0, rect.x1)];
  const [y0, y1] = [Math.min(rect.y0, rect.y1), Math.max(rect.y0, rect.y1)];
  const v = new Vector3();
  for (const id of doc.order) {
    const m = poses.world.get(id);
    if (!m || hidden.has(id)) continue;
    v.setFromMatrixPosition(m).project(vp.rig.camera);
    if (v.z > 1) continue;
    const x = r.left + ((v.x + 1) / 2) * r.width;
    const y = r.top + ((1 - v.y) / 2) * r.height;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) out.add(id);
  }
  return out;
}

/** Parts under a brush disc: the centre plus 15 rays on two rings (spec §11.2). */
export function partsInDisc(center: { x: number; y: number }, radiusPx: number): Set<PartId> {
  const vp = getViewport();
  const out = new Set<PartId>();
  if (!vp) return out;
  const samples = [{ x: center.x, y: center.y }];
  for (let i = 0; i < 15; i++) {
    const ring = i < 5 ? 0.5 : 1;
    const a = (i * 2 * Math.PI) / (i < 5 ? 5 : 10);
    samples.push({
      x: center.x + Math.cos(a) * radiusPx * ring,
      y: center.y + Math.sin(a) * radiusPx * ring,
    });
  }
  for (const s of samples) {
    const hit = pickPart(vp.ndc({ clientX: s.x, clientY: s.y }));
    if (hit) out.add(hit.part);
  }
  return out;
}
