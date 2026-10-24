import { MeshStandardMaterial } from 'three';
import type { Assets } from '../assets/geometry';

/** Static previews use baked vertex color; its fourth component is a paint flag, not opacity. */
function bakedPartMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      '#include <color_vertex>\nvColor.a = 1.0;',
    );
  };
  material.customProgramCacheKey = () => 'grambyedit-baked-part-v1';
  return material;
}

/** Owns material variants while the loaded assets retain ownership of shared textures. */
export class PartMaterialCache {
  private readonly variants = new Map<string, MeshStandardMaterial>();
  private readonly types = new Map<string, MeshStandardMaterial | MeshStandardMaterial[]>();

  constructor(
    private readonly assets: Assets,
    private readonly create: () => MeshStandardMaterial = bakedPartMaterial,
    readonly fallback: MeshStandardMaterial = create(),
  ) {}

  forType(type: string): MeshStandardMaterial | MeshStandardMaterial[] {
    const known = this.types.get(type);
    if (known) return known;
    const ref = this.assets.catalog.parts[type]?.mesh;
    const groups = ref ? this.assets.manifest.meshes[ref.id]?.groups : undefined;
    if (!groups?.some((group) => group.texture || (group.opacity ?? 1) < 1)) {
      this.types.set(type, this.fallback);
      return this.fallback;
    }
    const materials = groups.map((group) => {
      const opacity = group.opacity ?? 1;
      if (!group.texture && opacity === 1) return this.fallback;
      const key = JSON.stringify([group.texture ?? null, opacity, !!group.textureAlphaBlend]);
      let material = this.variants.get(key);
      if (material) return material;
      const texture = group.texture ? this.assets.textures?.get(group.texture) : undefined;
      if (group.texture && !texture) throw new Error(`Missing preloaded texture ${group.texture}.`);
      material = this.create();
      material.map = texture ?? null;
      material.opacity = opacity;
      // Opaque and binary cutout maps keep depth writes; only measured soft alpha blends.
      material.transparent = opacity < 1 || !!group.textureAlphaBlend;
      material.depthWrite = !material.transparent;
      material.alphaTest = texture ? 0.001 : 0;
      this.variants.set(key, material);
      return material;
    });
    this.types.set(type, materials);
    return materials;
  }

  dispose(): void {
    this.fallback.dispose();
    for (const material of this.variants.values()) material.dispose();
    this.variants.clear();
    this.types.clear();
  }
}
