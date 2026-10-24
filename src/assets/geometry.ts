// Decodes part meshes from the packed binary (spec §5.1) into cached BufferGeometry.
import { BoxGeometry, BufferAttribute, BufferGeometry, type Texture } from 'three';
import { PLACEHOLDER_BOX } from '../core/approx';
import type { Catalog, Manifest } from '../core/catalog-types';
import { splitBodies } from '../core/mesh-bodies';

export interface Assets {
  readonly catalog: Catalog;
  readonly manifest: Manifest;
  readonly bin: ArrayBuffer;
  readonly textures?: ReadonlyMap<string, Texture>;
}

const cache = new WeakMap<Assets, Map<string, BufferGeometry>>();

/** A 1×1×1 box for parts without a mesh and unknown types; paintable when the type takes `RGB`. */
function placeholder(paintable: boolean): BufferGeometry {
  const [w, h, d] = [0, 1, 2].map((a) => PLACEHOLDER_BOX.max[a] - PLACEHOLDER_BOX.min[a]);
  const g = new BoxGeometry(w, h, d);
  const n = g.getAttribute('position').count;
  const colors = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) colors.set([150, 150, 150, paintable ? 255 : 0], i * 4);
  g.setAttribute('color', new BufferAttribute(colors, 4, true));
  return g;
}

/**
 * The geometry of one part type: position, normal, color (u8×4: rgb + paint flag 255/0) and a
 * u16 index, as views into the shared pack. Cached per assets; never dispose a returned geometry.
 */
export function partGeometry(assets: Assets, type: string): BufferGeometry {
  let byType = cache.get(assets);
  if (!byType) cache.set(assets, (byType = new Map()));
  let g = byType.get(type);
  if (g) return g;
  const ref = assets.catalog.parts[type]?.mesh;
  const entry = ref ? assets.manifest.meshes[ref.id] : undefined;
  if (!entry) {
    g = placeholder(assets.catalog.parts[type]?.paintable ?? false);
  } else {
    const { sections } = assets.manifest;
    const { bin } = assets;
    const v = entry.vertexOffset;
    g = new BufferGeometry();
    g.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array(bin, sections.positions[0] + v * 12, entry.vertexCount * 3),
        3,
      ),
    );
    g.setAttribute(
      'normal',
      new BufferAttribute(
        new Float32Array(bin, sections.normals[0] + v * 12, entry.vertexCount * 3),
        3,
      ),
    );
    g.setAttribute(
      'color',
      new BufferAttribute(
        new Uint8Array(bin, sections.colors[0] + v * 4, entry.vertexCount * 4),
        4,
        true,
      ),
    );
    g.setIndex(
      new BufferAttribute(
        new Uint16Array(bin, sections.indices[0] + entry.indexOffset * 2, entry.indexCount),
        1,
      ),
    );
    if (sections.uvs) {
      g.setAttribute(
        'uv',
        new BufferAttribute(
          new Float32Array(bin, sections.uvs[0] + v * 8, entry.vertexCount * 2),
          2,
        ),
      );
    }
    entry.groups.forEach((group, material) => g!.addGroup(group.start, group.count, material));
  }
  byType.set(type, g);
  return g;
}

const bodyCache = new WeakMap<Assets, Map<string, readonly BufferGeometry[] | null>>();

/**
 * A multi-piece part's geometry split per body (D-F3), in `PartDef.bodies` order: each shares the
 * part's vertex buffers and has its own index. `userData.faceMap` maps a body's triangle back to the
 * part's (for sub-part lookups). Null for one-piece parts and placeholders.
 */
export function bodyGeometries(assets: Assets, type: string): readonly BufferGeometry[] | null {
  let byType = bodyCache.get(assets);
  if (!byType) bodyCache.set(assets, (byType = new Map()));
  if (byType.has(type)) return byType.get(type)!;
  const def = Object.hasOwn(assets.catalog.parts, type) ? assets.catalog.parts[type] : undefined;
  const whole = partGeometry(assets, type);
  const index = whole.index;
  let out: BufferGeometry[] | null = null;
  if (def?.bodies && def.mesh && index) {
    const { triangleBody } = splitBodies(
      whole.getAttribute('position').array,
      index.array,
      def.bodies.map((b) => b.anchor),
    );
    out = def.bodies.map((_, body) => {
      const faces: number[] = [];
      triangleBody.forEach((b, t) => {
        if (b === body) faces.push(t);
      });
      const idx = new Uint16Array(faces.length * 3);
      faces.forEach((t, i) =>
        idx.set(index.array.subarray(3 * t, 3 * t + 3) as Uint16Array, 3 * i),
      );
      const g = new BufferGeometry();
      for (const [name, attr] of Object.entries(whole.attributes)) g.setAttribute(name, attr);
      g.setIndex(new BufferAttribute(idx, 1));
      // A body's compact index can intersect several original material groups.
      faces.forEach((triangle, local) => {
        const original = triangle * 3;
        const group = whole.groups.find((g) => original >= g.start && original < g.start + g.count);
        if (!group) return;
        const previous = g.groups.at(-1);
        if (
          previous &&
          previous.materialIndex === group.materialIndex &&
          previous.start + previous.count === local * 3
        ) {
          previous.count += 3;
        } else g.addGroup(local * 3, 3, group.materialIndex);
      });
      g.userData.faceMap = Uint32Array.from(faces);
      return g;
    });
  }
  byType.set(type, out);
  return out;
}
