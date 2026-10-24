// Previews of parts that are not in the build yet (spec §11.1): what Generate or Create would add to a
// picked part, drawn translucent by the viewport.
import type { Matrix4 } from 'three';
import type { Catalog } from '../core/catalog-types';
import { computePoses, poseConn, type Poses } from '../core/pose';
import type { Doc } from '../core/types';

export interface PartsPreview {
  readonly doc: Doc;
  readonly poses: Poses;
}

/**
 * `sub` on an existing part posed at `hostWorld`: every part but the sub's first root, which stands for
 * that part (`insertSubDoc` with `onto`).
 */
export function previewOnHost(sub: Doc, cat: Catalog, hostWorld: Matrix4): PartsPreview {
  const local = computePoses(sub, cat, cat.conventions);
  const root = sub.order.find((id) => poseConn(sub.parts.get(id)!) === undefined);
  const order = sub.order.filter((id) => id !== root);
  const onHost = (m: Matrix4) => hostWorld.clone().multiply(m);
  const world = new Map(order.map((id) => [id, onHost(local.world.get(id)!)]));
  const bodies = new Map(
    order.flatMap((id) => {
      const list = local.bodies?.get(id);
      return list ? [[id, list.map(onHost)] as const] : [];
    }),
  );
  return {
    doc: { ...sub, parts: new Map(order.map((id) => [id, sub.parts.get(id)!])), order },
    poses: { ...local, world, bodies },
  };
}
