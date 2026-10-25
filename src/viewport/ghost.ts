// The placement ghost (spec §12.6): the sub-doc being placed, drawn translucent at the snapped pose.
import { Group, InstancedMesh, MeshStandardMaterial, type Matrix4 } from 'three';
import { partGeometry, type Assets } from '../assets/geometry';
import type { Doc, PartId } from '../core/types';

export class GhostLayer {
  readonly group = new Group();
  private readonly material = new MeshStandardMaterial({
    color: 0x7cc4fa,
    roughness: 0.6,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  /** One instanced mesh per part type, grown as needed. */
  private readonly meshes = new Map<string, InstancedMesh>();

  constructor(private readonly assets: Assets) {
    this.group.visible = false;
  }

  /** Shows `sub`'s parts at the given world matrices (keyed by sub id); null hides the ghost. */
  show(
    sub: Doc | null,
    worlds: ReadonlyMap<PartId, Matrix4>,
    extra: readonly { type: string; world: Matrix4 }[] = [],
  ): void {
    this.group.visible = sub !== null;
    if (!sub) return;
    const byType = new Map<string, Matrix4[]>();
    for (const id of sub.order) {
      const m = worlds.get(id);
      if (!m) continue;
      const type = sub.parts.get(id)!.type;
      const list = byType.get(type) ?? [];
      list.push(m);
      byType.set(type, list);
    }
    for (const { type, world } of extra) {
      const list = byType.get(type) ?? [];
      list.push(world);
      byType.set(type, list);
    }
    for (const [type, mesh] of this.meshes) if (!byType.has(type)) mesh.count = 0;
    for (const [type, list] of byType) {
      let mesh = this.meshes.get(type);
      if (!mesh || mesh.instanceMatrix.count < list.length) {
        if (mesh) {
          this.group.remove(mesh);
          mesh.dispose();
        }
        mesh = new InstancedMesh(partGeometry(this.assets, type), this.material, list.length);
        mesh.frustumCulled = false;
        mesh.renderOrder = 3;
        this.meshes.set(type, mesh);
        this.group.add(mesh);
      }
      list.forEach((m, i) => mesh!.setMatrixAt(i, m));
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.meshes.clear();
    this.material.dispose();
  }
}
