import type { Manifest, MeshEntry, MeshGroup } from '../../src/core/catalog-types';
import type { RGB } from '../../src/core/types';
import type { ObjGroup, ObjMesh } from './obj';

export interface PackGroup {
  readonly subPart: string;
  readonly color: RGB;
  readonly paintable: boolean;
  readonly texture?: string;
  readonly textureAlphaBlend?: boolean;
  readonly opacity?: number;
}

/** `groups` runs parallel to `groupsOf(mesh)`. */
export interface PackInput {
  readonly type: string;
  readonly mesh: ObjMesh;
  readonly groups: readonly PackGroup[];
}

/** The mesh's material groups; faces outside any `usemtl` form one unnamed group. */
export function groupsOf(mesh: ObjMesh): readonly ObjGroup[] {
  return mesh.groups.length
    ? mesh.groups
    : [{ material: '', start: 0, count: mesh.indices.length }];
}

/**
 * Packs meshes into one binary: positions (f32×3), normals (f32×3), colors (u8×4: r, g, b, then
 * 255 when paintable else 0), optional UVs (f32×2), and indices (u16, local to each mesh).
 * Vertices are split per group so each vertex has exactly one color. Group `start`/`count`
 * are local to the mesh's indices.
 */
export function packMeshes(inputs: readonly PackInput[]): {
  sections: Manifest['sections'];
  meshes: MeshEntry[];
  bin: Uint8Array<ArrayBuffer>;
} {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const hasUvs = inputs.some(({ mesh }) => mesh.uvs !== undefined);
  const idx: number[] = [];
  const meshes: MeshEntry[] = [];
  for (const { type, mesh, groups } of inputs) {
    const vertexOffset = pos.length / 3;
    const indexOffset = idx.length;
    let vertexCount = 0;
    const out: MeshGroup[] = [];
    groupsOf(mesh).forEach((g, gi) => {
      const info = groups[gi];
      const remap = new Map<number, number>();
      const start = idx.length - indexOffset;
      for (let k = g.start; k < g.start + g.count; k++) {
        const v = mesh.indices[k];
        let nv = remap.get(v);
        if (nv === undefined) {
          nv = vertexCount++;
          remap.set(v, nv);
          pos.push(mesh.positions[3 * v], mesh.positions[3 * v + 1], mesh.positions[3 * v + 2]);
          nrm.push(mesh.normals[3 * v], mesh.normals[3 * v + 1], mesh.normals[3 * v + 2]);
          col.push(info.color[0], info.color[1], info.color[2], info.paintable ? 255 : 0);
          if (hasUvs) uv.push(mesh.uvs?.[2 * v] ?? 0, mesh.uvs?.[2 * v + 1] ?? 0);
        }
        idx.push(nv);
      }
      out.push({ ...info, start, count: g.count });
    });
    if (vertexCount > 0xffff)
      throw new Error(`${type}: ${vertexCount} vertices overflow u16 indices`);
    meshes.push({
      type,
      vertexOffset,
      vertexCount,
      indexOffset,
      indexCount: idx.length - indexOffset,
      groups: out,
    });
  }
  const posBytes = pos.length * 4;
  const nrmBytes = nrm.length * 4;
  const colBytes = col.length;
  const uvOffset = posBytes + nrmBytes + colBytes;
  const uvBytes = uv.length * 4;
  const indexOffset = uvOffset + uvBytes;
  const bin = new Uint8Array(indexOffset + idx.length * 2);
  new Float32Array(bin.buffer, 0, pos.length).set(pos);
  new Float32Array(bin.buffer, posBytes, nrm.length).set(nrm);
  bin.set(col, posBytes + nrmBytes);
  if (hasUvs) new Float32Array(bin.buffer, uvOffset, uv.length).set(uv);
  new Uint16Array(bin.buffer, indexOffset, idx.length).set(idx);
  return {
    sections: {
      positions: [0, posBytes],
      normals: [posBytes, nrmBytes],
      colors: [posBytes + nrmBytes, colBytes],
      ...(hasUvs ? { uvs: [uvOffset, uvBytes] as const } : {}),
      indices: [indexOffset, idx.length * 2],
    },
    meshes,
    bin,
  };
}
