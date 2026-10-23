// Picking (spec §11.2): rays narrowed by the BVH, exact triangle tests on the few candidates.
import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Ray,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
} from 'three';
import { bodyGeometries, partGeometry } from '../assets/geometry';
import { PLACEHOLDER_BOX } from '../core/approx';
import type { Catalog } from '../core/catalog-types';
import type { Poses } from '../core/pose';
import type { Doc, PartId, SocketId, Uuid } from '../core/types';
import { posesSig } from '../state/derived';
import { hiddenSig } from '../state/selection';
import { assetsSig, catalogSig, docSig } from '../state/store';
import { SphereBVH } from './bvh';
import { getViewport } from './context';
import { readIds } from './id-pass';

export interface Hit {
  part: PartId;
  /** The body hit, for multi-piece parts (D-F3); 0 otherwise. */
  body: number;
  point: Vector3;
  normal: Vector3;
  subPart: string;
  distance: number;
}

/** The ray from the camera through a viewport position. */
export function cursorRay(ndc: Vector2): Ray | null {
  const vp = getViewport();
  if (!vp) return null;
  const camera = vp.rig.camera;
  const origin = new Vector3(ndc.x, ndc.y, -1).unproject(camera);
  const far = new Vector3(ndc.x, ndc.y, 1).unproject(camera);
  return new Ray(origin, far.sub(origin).normalize());
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
    const radius =
      Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) / 2;
    // One sphere per body: a multi-piece part's bodies can be far apart.
    for (const w of poses.bodies?.get(id) ?? [m]) {
      c.set(
        (box.min[0] + box.max[0]) / 2,
        (box.min[1] + box.max[1]) / 2,
        (box.min[2] + box.max[2]) / 2,
      ).applyMatrix4(w);
      items.push({ id, center: [c.x, c.y, c.z] as const, radius });
    }
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

/** The visible part under `ndc`, with the sub-part whose triangles were hit; parts in `skip` are ignored. */
export function pickPart(ndc: Vector2, skip?: ReadonlySet<PartId>): Hit | null {
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
  const seen = new Set<PartId>();
  for (const id of bvhFor(doc, poses, cat).rayCandidates([o.x, o.y, o.z], [d.x, d.y, d.z])) {
    if (seen.has(id) || hidden.has(id) || skip?.has(id)) continue;
    seen.add(id);
    const part = doc.parts.get(id);
    const lead = poses.world.get(id);
    if (!part || !lead) continue;
    const bodies = bodyGeometries(assets, part.type);
    const worlds = poses.bodies?.get(id);
    const shapes = bodies ?? [partGeometry(assets, part.type)];
    shapes.forEach((geometry, body) => {
      const world = (bodies && worlds?.[body]) || lead;
      probe.geometry = geometry;
      probe.matrixWorld.copy(world);
      const hits: Intersection[] = [];
      probe.raycast(ray, hits);
      const faceMap = geometry.userData.faceMap as Uint32Array | undefined;
      for (const h of hits) {
        if (best && h.distance >= best.distance) continue;
        const normal = (h.face?.normal ?? new Vector3(0, 1, 0)).clone().transformDirection(world);
        const face = h.faceIndex ?? 0;
        best = {
          part: id,
          body,
          point: h.point.clone(),
          normal,
          subPart: subPartAt(cat, part.type, faceMap ? faceMap[face] : face),
          distance: h.distance,
        };
      }
    });
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

/** Markers this close to the nearest one overlap on screen (a part's mount often sits on a socket). */
const TIE_PX = 2;

/**
 * The displayed socket nearest the cursor, within a small screen radius; sockets of `skip` are
 * ignored. Among overlapping markers, the first that `prefer` accepts wins over the nearest.
 */
export function pickSocket(
  ndc: Vector2,
  skip?: ReadonlySet<PartId>,
  prefer?: (s: { part: PartId; socket: SocketId }) => boolean,
): { part: PartId; socket: SocketId } | null {
  const vp = getViewport();
  if (!vp) return null;
  const hits: { part: PartId; socket: SocketId; px: number }[] = [];
  for (const s of vp.sockets?.shown() ?? []) {
    if (skip?.has(s.part)) continue;
    const px = screenDistance(s.world, ndc);
    if (px !== null && px < MARKER_PICK_PX) hits.push({ part: s.part, socket: s.socket, px });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.px - b.px);
  const tied = hits.filter((h) => h.px <= hits[0].px + TIE_PX);
  const { part, socket } = (prefer && tied.find(prefer)) ?? hits[0];
  return { part, socket };
}

/** The drawn point nearest the cursor, within a small screen radius. */
export function pickPoint(ndc: Vector2): { host: PartId; uuid: Uuid } | null {
  const vp = getViewport();
  if (!vp) return null;
  let best: { host: PartId; uuid: Uuid } | null = null;
  let bestPx = MARKER_PICK_PX;
  for (const p of vp.points?.shown() ?? []) {
    const px = screenDistance(p.world, ndc);
    if (px !== null && px < bestPx) [bestPx, best] = [px, { host: p.host, uuid: p.uuid }];
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
