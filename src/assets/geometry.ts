// Decodes part meshes from the packed binary (spec §5.1) into cached BufferGeometry.
import { BoxGeometry, BufferAttribute, BufferGeometry } from 'three';
import { PLACEHOLDER_BOX } from '../core/approx';
import type { Catalog, Manifest } from '../core/catalog-types';

export interface Assets {
  readonly catalog: Catalog;
  readonly manifest: Manifest;
  readonly bin: ArrayBuffer;
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
  }
  byType.set(type, g);
  return g;
}
