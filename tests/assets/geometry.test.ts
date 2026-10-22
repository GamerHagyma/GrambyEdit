import { buildAssets } from '../../scripts/build-assets';
import { partGeometry } from '../../src/assets/geometry';

test('decodes Part from the real pack', async () => {
  const { catalog, manifest, bin } = await buildAssets({ root: '.', outDir: null });
  const assets = {
    catalog,
    manifest,
    bin: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength),
  };
  const g = partGeometry(assets, 'Part');
  expect(g.index!.count).toBe(36);
  g.computeBoundingBox();
  expect(g.boundingBox!.max.toArray().map((v) => +v.toFixed(3))).toEqual([0.5, 0.5, 0.5]);
  expect(g.getAttribute('color').itemSize).toBe(4);
  expect(partGeometry(assets, 'Part')).toBe(g);
  const placeholder = partGeometry(assets, 'Mystery');
  expect(placeholder.index!.count).toBe(36);
  expect(placeholder.getAttribute('color').itemSize).toBe(4);
}, 30_000);
