// The game's suspension springs: a coil from each wheel socket (MountType Suspension) that has a part on
// it down to that part, which hangs SPRING_DROP below the socket (pose.ts). In a group of its own, so the
// ID and outline passes, which draw the parts group, never see it.
import {
  Curve,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
import type { Catalog } from '../core/catalog-types';
import { cfToMatrix4 } from '../core/cframe';
import { poseConn, SPRING_DROP, type Poses } from '../core/pose';
import type { Doc, PartId } from '../core/types';

/** The coil as the game drew it in the user's screenshots (2026-10-24). */
const TURNS = 5;
const RADIUS = 0.33;
const WIRE = 0.035;
const COLOR = 0x26324a;

/** A helix down −Y, from the socket at the origin to SPRING_DROP below it. */
class Helix extends Curve<Vector3> {
  // Curve's own constructor is protected.
  constructor() {
    super();
  }

  override getPoint(t: number, target = new Vector3()): Vector3 {
    const a = t * TURNS * 2 * Math.PI;
    return target.set(RADIUS * Math.cos(a), -t * SPRING_DROP, RADIUS * Math.sin(a));
  }
}

export class SpringsLayer {
  readonly group = new Group();
  private readonly geometry = new TubeGeometry(new Helix(), TURNS * 24, WIRE, 6);
  private readonly material = new MeshStandardMaterial({
    color: COLOR,
    roughness: 0.45,
    metalness: 0.3,
  });
  mesh = this.make(8);

  /** One coil per shown part whose pose hangs it on a shown part's wheel socket. */
  sync(doc: Doc, poses: Poses, hidden: ReadonlySet<PartId>, cat: Catalog): void {
    const coils: Matrix4[] = [];
    for (const id of doc.order) {
      const t = poseConn(doc.parts.get(id)!)?.target;
      if (t?.kind !== 'socket' || hidden.has(id) || hidden.has(t.part)) continue;
      const host = doc.parts.get(t.part);
      const s =
        host && Object.hasOwn(cat.parts, host.type)
          ? cat.parts[host.type].sockets[t.socket]
          : undefined;
      const world = poses.world.get(t.part);
      if (s?.mountType !== 'Suspension' || !world) continue;
      // Along the base's axes, so the coil hangs down its −Y as the part does.
      const at = new Vector3().setFromMatrixPosition(cfToMatrix4(s.frame));
      coils.push(world.clone().multiply(new Matrix4().makeTranslation(at)));
    }
    const capacity = this.mesh.instanceMatrix.count;
    if (coils.length > capacity) {
      this.group.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = this.make(Math.max(coils.length, capacity * 2));
    }
    coils.forEach((m, i) => this.mesh.setMatrixAt(i, m));
    this.mesh.count = coils.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }

  private make(capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(this.geometry, this.material, capacity);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }
}
