import { MeshStandardMaterial, Texture } from 'three';
import { PartMaterialCache } from '../../src/viewport/part-materials';
import { createPartMaterial } from '../../src/viewport/parts-layer';
import { texturedAssets } from '../helpers/textured-assets';

test('group materials reuse diffuse maps and opacity while leaving paint flags in the shader', () => {
  const fixture = texturedAssets();
  const texture = new Texture();
  const assets = { ...fixture, textures: new Map([['textures/right.png', texture]]) };
  const base = createPartMaterial({ value: 1 });
  const cache = new PartMaterialCache(assets, () => createPartMaterial({ value: 1 }), base);
  const materials = cache.forType('Part') as MeshStandardMaterial[];
  expect(materials[0]).toBe(base);
  expect(materials[1].map).toBe(texture);
  expect(materials[1].opacity).toBe(0.4);
  expect(materials[1].transparent).toBe(true);
  expect(materials[1].depthWrite).toBe(false);
  expect(cache.forType('Part')).toBe(materials);
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <color_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>',
  };
  materials[1].onBeforeCompile(shader as never, {} as never);
  expect(shader.vertexShader).toContain('step(0.5, color.a)');
  expect(shader.vertexShader).toContain(
    'vColor = vec4(mix(color.rgb, instanceColor.rgb, gePainted), 1.0)',
  );
  const dispose = materials.map((m) => vi.spyOn(m, 'dispose'));
  const textureDispose = vi.spyOn(texture, 'dispose');
  cache.dispose();
  expect(dispose.every((spy) => spy.mock.calls.length === 1)).toBe(true);
  expect(textureDispose).not.toHaveBeenCalled();
});

test('static workbench/thumbnail material forces paint flag alpha opaque and applies texture opacity', () => {
  const fixture = texturedAssets();
  const cache = new PartMaterialCache({
    ...fixture,
    textures: new Map([['textures/right.png', new Texture()]]),
  });
  const materials = cache.forType('Part') as MeshStandardMaterial[];
  const shader = { vertexShader: '#include <color_vertex>', fragmentShader: '', uniforms: {} };
  materials[1].onBeforeCompile(shader as never, {} as never);
  expect(materials[1].vertexColors).toBe(true);
  expect(shader.vertexShader).toContain('vColor.a = 1.0');
  expect(materials[1].opacity).toBe(0.4);
  cache.dispose();
});

test('missing preloaded texture fails clearly instead of dropping the map', () => {
  const cache = new PartMaterialCache(texturedAssets());
  expect(() => cache.forType('Part')).toThrow('textures/right.png');
  cache.dispose();
});

test.each([false, true])(
  'opaque/cutout texture keeps depth unless soft alpha is explicit (%s)',
  (textureAlphaBlend) => {
    const fixture = texturedAssets();
    const assets = {
      ...fixture,
      textures: new Map([['textures/right.png', new Texture()]]),
      manifest: {
        ...fixture.manifest,
        meshes: fixture.manifest.meshes.map((mesh) => ({
          ...mesh,
          groups: mesh.groups.map((group) => ({ ...group, opacity: 1, textureAlphaBlend })),
        })),
      },
    };
    const cache = new PartMaterialCache(assets);
    const material = (cache.forType('Part') as MeshStandardMaterial[])[1];
    expect(material.transparent).toBe(textureAlphaBlend);
    expect(material.depthWrite).toBe(!textureAlphaBlend);
    expect(material.alphaTest).toBeGreaterThan(0);
    cache.dispose();
  },
);
