import { Color, Matrix4, Vector3 } from 'three';
import { computePoses, type Poses } from '../../src/core/pose';
import { WiresLayer, WIRE_BLACK, WIRE_ORANGE } from '../../src/viewport/wires-layer';
import { realCatalog } from '../helpers/real-catalog';
import { docOf, part } from '../helpers/doc';

const wire = docOf(part(1, 'Wire'));
const poses = (length: number): Poses => ({
  world: new Map([[1, new Matrix4().makeTranslation(2, 0, 0)]]),
  bodies: new Map([
    [1, [new Matrix4().makeTranslation(2, 0, 0), new Matrix4().makeTranslation(2 + length, 0, -1)]],
  ]),
  flags: new Map(),
  approxCount: 0,
});
const ends = (layer: WiresLayer, index = 0) => {
  const matrix = new Matrix4();
  layer.mesh.getMatrixAt(index, matrix);
  return [-0.5, 0.5].map((y) => new Vector3(0, y, 0).applyMatrix4(matrix).toArray());
};
const color = (layer: WiresLayer) => {
  const c = new Color();
  layer.mesh.getColorAt(0, c);
  return c.getHex();
};
const near = (got: number[][], want: number[][]) =>
  got.forEach((p, i) => p.forEach((v, a) => expect(v).toBeCloseTo(want[i][a], 6)));

test('thin black cylinders span the pieces; over 10 studs is orange and hidden parts have no wire', async () => {
  const cat = await realCatalog(),
    layer = new WiresLayer();
  layer.sync(wire, poses(10), new Set(), cat);
  expect(layer.mesh.count).toBe(1);
  near(ends(layer), [
    [2, 0, 0],
    [12, 0, 0],
  ]);
  expect(color(layer)).toBe(WIRE_BLACK);
  layer.sync(wire, poses(12), new Set(), cat);
  near(ends(layer), [
    [2, 0, 0],
    [14, 0, 0],
  ]);
  expect(color(layer)).toBe(WIRE_ORANGE);
  layer.sync(wire, poses(12), new Set([1]), cat);
  expect(layer.mesh.count).toBe(0);
  layer.dispose();
});

test('body and whole previews update endpoints/color and cancellation restores them', async () => {
  const cat = await realCatalog(),
    layer = new WiresLayer();
  layer.sync(wire, poses(2), new Set(), cat);
  layer.setBodyPreview(1, 1, new Matrix4().makeTranslation(16, 0, -1));
  near(ends(layer), [
    [2, 0, 0],
    [16, 0, 0],
  ]);
  expect(color(layer)).toBe(WIRE_ORANGE);
  layer.setPreview(new Map());
  near(ends(layer), [
    [2, 0, 0],
    [4, 0, 0],
  ]);
  expect(color(layer)).toBe(WIRE_BLACK);
  layer.setPreview(new Map([[1, new Matrix4().makeTranslation(7, 0, 0)]]));
  near(ends(layer), [
    [7, 0, 0],
    [9, 0, 0],
  ]);
  layer.dispose();
});

test('splitter wires grow past initial capacity and coincident ends remain finite', async () => {
  const cat = await realCatalog(),
    layer = new WiresLayer();
  const doc = docOf(part(1, 'Splitter_4'), part(2, 'Splitter_4'), part(3, 'Splitter_4'));
  layer.sync(doc, computePoses(doc, cat, cat.conventions), new Set(), cat);
  expect(layer.mesh.count).toBe(12);
  expect(layer.mesh.instanceMatrix.count).toBeGreaterThanOrEqual(12);
  layer.sync(wire, poses(0), new Set(), cat);
  const matrix = new Matrix4();
  layer.mesh.getMatrixAt(0, matrix);
  expect(matrix.elements.every(Number.isFinite)).toBe(true);
  layer.dispose();
});
