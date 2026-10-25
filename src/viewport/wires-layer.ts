import {
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  CylinderGeometry,
  Quaternion,
  Vector3,
} from 'three';
import type { Catalog } from '../core/catalog-types';
import { bodyWorld, type Poses } from '../core/pose';
import type { Doc, PartId } from '../core/types';
import { WIRE_LIMIT, wireSegments, type WireSegment } from '../core/wires';

export const WIRE_BLACK = 0x101010;
export const WIRE_ORANGE = 0xff8c00;

export class WiresLayer {
  readonly group = new Group();
  private readonly geometry = new CylinderGeometry(0.0125, 0.0125, 1, 6);
  private readonly material = new MeshBasicMaterial({ toneMapped: false });
  mesh = this.make(8);
  private segments: readonly WireSegment[] = [];
  private poses: Poses | null = null;
  private whole: ReadonlyMap<PartId, Matrix4> = new Map();
  private readonly bodies = new Map<string, Matrix4>();
  private readonly incident = new Map<PartId, number[]>();

  constructor() {
    this.group.name = 'internal-wires';
  }

  sync(doc: Doc, poses: Poses, hidden: ReadonlySet<PartId>, cat: Catalog): void {
    this.poses = poses;
    this.segments = wireSegments(doc, cat, poses).filter((segment) => !hidden.has(segment.part));
    this.incident.clear();
    this.segments.forEach((segment, index) => {
      const indexes = this.incident.get(segment.part);
      if (indexes) indexes.push(index);
      else this.incident.set(segment.part, [index]);
    });
    this.whole = new Map();
    this.bodies.clear();
    this.draw();
  }

  setPreview(world: ReadonlyMap<PartId, Matrix4>): void {
    this.whole = world;
    this.bodies.clear();
    this.draw();
  }

  setBodyPreview(id: PartId, body: number, matrix: Matrix4): void {
    const incident = this.incident.get(id);
    if (!incident) return;
    this.bodies.set(`${id}:${body}`, matrix.clone());
    this.draw(incident);
  }

  private endpoint(part: PartId, body: number, point: Vector3): Vector3 {
    const result = point.clone();
    if (!this.poses) return result;
    const after = this.bodies.get(`${part}:${body}`);
    const whole = this.whole.get(part);
    const before = after ? bodyWorld(this.poses, part, body) : this.poses.world.get(part);
    if (before && (after || whole))
      result.applyMatrix4((after ?? whole)!.clone().multiply(before.clone().invert()));
    return result;
  }

  private draw(indices?: readonly number[]): void {
    const count = this.segments.length;
    if (count > this.mesh.instanceMatrix.count) {
      const capacity = Math.max(count, this.mesh.instanceMatrix.count * 2);
      this.group.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = this.make(capacity);
    }
    const up = new Vector3(0, 1, 0),
      turn = new Quaternion(),
      color = new Color();
    const matrix = new Matrix4();
    const drawSegment = (segment: WireSegment, i: number) => {
      const from = this.endpoint(segment.part, segment.fromBody, segment.from);
      const to = this.endpoint(segment.part, segment.toBody, segment.to);
      const direction = to.clone().sub(from),
        length = direction.length();
      turn.identity();
      if (length > 0) turn.setFromUnitVectors(up, direction.multiplyScalar(1 / length));
      matrix.compose(from.add(to).multiplyScalar(0.5), turn, new Vector3(1, length, 1));
      this.mesh.setMatrixAt(i, matrix);
      this.mesh.setColorAt(i, color.setHex(length > WIRE_LIMIT ? WIRE_ORANGE : WIRE_BLACK));
    };
    if (indices) for (const i of indices) drawSegment(this.segments[i], i);
    else this.segments.forEach(drawSegment);
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private make(capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(this.geometry, this.material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
