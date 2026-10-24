import { MeshStandardMaterial, Texture } from 'three';
import { DEFAULT_CONVENTIONS } from '../../src/core/conventions';
import { computePoses } from '../../src/core/pose';
import { FLAG_PAINTED, PartsLayer } from '../../src/viewport/parts-layer';
import { chainDoc, docOf, part } from '../helpers/doc';
import { texturedAssets } from '../helpers/textured-assets';

test('instanced layer keeps UVs, material groups, paint flags and picking slots when capacity grows', () => {
  const fixture = texturedAssets();
  const texture = new Texture();
  const assets = { ...fixture, textures: new Map([['textures/right.png', texture]]) };
  const layer = new PartsLayer(assets);
  const first = docOf(part(1, 'Part', [], { RGB: [255, 0, 0] }));
  layer.sync(first, computePoses(first, assets.catalog, DEFAULT_CONVENTIONS), new Set(), true);
  const initial = layer.meshes()[0];
  expect(Array.isArray(initial.material)).toBe(true);
  expect(initial.geometry.groups).toEqual([
    { start: 0, count: 3, materialIndex: 0 },
    { start: 3, count: 3, materialIndex: 1 },
  ]);
  expect(initial.geometry.getAttribute('aFlags').getX(0) & FLAG_PAINTED).toBe(FLAG_PAINTED);
  const materials = initial.material as MeshStandardMaterial[];
  expect(materials[1].map).toBe(texture);
  const grown = chainDoc(17);
  layer.sync(grown, computePoses(grown, assets.catalog, DEFAULT_CONVENTIONS), new Set(), false);
  const mesh = layer.meshes()[0];
  expect(mesh).not.toBe(initial);
  expect(mesh.material).toBe(materials);
  expect(mesh.geometry.groups).toEqual(initial.geometry.groups);
  expect(mesh.geometry.getAttribute('uv')).toBe(initial.geometry.getAttribute('uv'));
  expect(layer.partAt(mesh, 16)).toBe(17);
  expect(mesh.count).toBe(17);
  const dispose = materials.map((material) => vi.spyOn(material, 'dispose'));
  layer.dispose();
  expect(dispose.every((spy) => spy.mock.calls.length === 1)).toBe(true);
});
