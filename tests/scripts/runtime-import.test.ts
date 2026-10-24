import { buildAssets } from '../../scripts/build-assets';
import { Vector3 } from 'three';
import { subPartMatrix } from '../../src/core/pose';

test('imports complete runtime templates with native socket frames and subpart origins', async () => {
  const { catalog, manifest } = await buildAssets({ root: '.', outDir: null });
  expect(Object.keys(catalog.parts)).toHaveLength(162);
  expect(manifest.meshes).toHaveLength(162);
  expect(catalog.parts.JetEngine.mesh).not.toBeNull();
  expect(catalog.parts.Minecart).toBeUndefined();
  expect(catalog.parts.PotionGetSmall).toBeUndefined();
  expect(catalog.parts.Spoiler.sockets['2']).toBeUndefined();
  expect(catalog.parts.GoKart.sockets['1']).toBeUndefined();
  expect(catalog.parts.Wire.mainPartName).toBe('InputA');
  expect(catalog.parts.Wire.bodies![0].pivot).toEqual([0, 0, 0]);
  expect(catalog.parts.Wire.sockets['1'].frameSource).toBe('captured');
  expect(catalog.parts.Wire.subParts.InputA.cframe).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  expect(catalog.parts.Splitter.bodies).toHaveLength(5);
  expect(catalog.parts.Splitter.subParts.Output1.approx).toBe(false);
  // Gate Output's local +Y points along PrimaryPart +X, not world +Y.
  const output = subPartMatrix(catalog, 'Gate-AND', 'Output');
  expect(output.approx).toBe(false);
  expect(
    new Vector3(0, 1, 0).applyMatrix4(output.m).distanceTo(new Vector3(1.15, 0, -0.55)),
  ).toBeLessThan(1e-4);
}, 30_000);

test('all imported snap targets use captured frames rather than bounding-box guesses', async () => {
  const { catalog } = await buildAssets({ root: '.', outDir: null });
  const approximate = Object.values(catalog.parts).flatMap((p) =>
    Object.entries(p.sockets)
      .filter(([, s]) => s.frameSource !== 'captured')
      .map(([id]) => `${p.type}.${id}`),
  );
  expect(approximate).toEqual([]);
});

test('preserves soft texture alpha without making opaque textured meshes transparent', async () => {
  const { catalog, manifest } = await buildAssets({ root: '.', outDir: null });
  const groups = (name: string) => manifest.meshes[catalog.parts[name].mesh!.id].groups;
  expect(groups('Lock').some((g) => g.texture && g.textureAlphaBlend)).toBe(true);
  expect(
    groups('Wheel')
      .filter((g) => g.texture)
      .every((g) => !g.textureAlphaBlend),
  ).toBe(true);
});
