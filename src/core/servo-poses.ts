import { Matrix4 } from 'three';
import type { Catalog } from './catalog-types';
import { bodyWorld, computePoses, leadBody, socketWorld, type Poses } from './pose';
import { servoSettings } from './servo-simulation';
import type { Doc, PartId } from './types';

/** Prepare affected bodies once with the existing solver, then rotate absolute base matrices per frame. */
export class ServoPosePreview {
  private readonly pivot: Matrix4;
  private readonly inverse: Matrix4;
  private readonly originalAngle: number;
  private readonly moving: readonly { id: PartId; body: number; lead: boolean; matrix: Matrix4 }[];
  constructor(
    readonly doc: Doc,
    readonly cat: Catalog,
    readonly base: Poses,
    readonly id: PartId,
  ) {
    const part = doc.parts.get(id)!;
    this.originalAngle = servoSettings(part.props).Rotation;
    this.pivot = socketWorld(base, cat, doc, id, '2') ?? new Matrix4();
    this.inverse = this.pivot.clone().invert();
    const parts = new Map(doc.parts);
    parts.set(id, { ...part, props: { ...part.props, Rotation: this.originalAngle + 90 } });
    const probe = computePoses({ ...doc, parts }, cat, cat.conventions);
    const moving: { id: PartId; body: number; lead: boolean; matrix: Matrix4 }[] = [];
    for (const id of doc.order) {
      const part = doc.parts.get(id)!,
        def = cat.parts[part.type];
      for (let body = 0; body < (def?.bodies?.length ?? 1); body++) {
        const matrix = bodyWorld(base, id, body),
          other = bodyWorld(probe, id, body);
        if (
          matrix &&
          other &&
          matrix.elements.some((v, i) => Math.abs(v - other.elements[i]) > 1e-8)
        )
          moving.push({ id, body, lead: body === leadBody(def, part), matrix });
      }
    }
    this.moving = moving;
  }
  at(angle: number): Poses {
    const delta = this.pivot
      .clone()
      .multiply(new Matrix4().makeRotationY((((angle - this.originalAngle) % 360) * Math.PI) / 180))
      .multiply(this.inverse);
    const world = new Map(this.base.world),
      bodies = new Map(this.base.bodies);
    const copied = new Set<PartId>();
    for (const item of this.moving) {
      const matrix = delta.clone().multiply(item.matrix);
      if (item.lead) world.set(item.id, matrix);
      const originals = this.base.bodies?.get(item.id);
      if (originals) {
        if (!copied.has(item.id)) {
          bodies.set(item.id, [...originals]);
          copied.add(item.id);
        }
        (bodies.get(item.id) as Matrix4[])[item.body] = matrix;
      }
    }
    return { ...this.base, world, bodies };
  }
}
