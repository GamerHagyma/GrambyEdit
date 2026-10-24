import { Matrix4, Texture, Vector3 } from 'three';
import type { Poses } from '../../src/core/pose';
import type { PartId } from '../../src/core/types';
import {
  fitPx,
  labelMatrix,
  LabelsLayer,
  labelText,
  PART_LABELS,
} from '../../src/viewport/labels-layer';
import { docOf, part } from '../helpers/doc';

const posesOf = (world: [PartId, Matrix4][]): Poses => ({
  world: new Map(world),
  flags: new Map(),
  approxCount: 0,
});
const column = (m: Matrix4, i: number) => new Vector3().setFromMatrixColumn(m, i);
const near = (v: Vector3, x: number, y: number, z: number) => {
  expect(v.x).toBeCloseTo(x, 9);
  expect(v.y).toBeCloseTo(y, 9);
  expect(v.z).toBeCloseTo(z, 9);
};

test('sensors show their key or value as stored, numbers in plain digits', () => {
  const [key] = PART_LABELS.InputSensor;
  expect(labelText(key, { ActivationKey: ' A ' })).toBe(' A ');
  expect(labelText(key, { ActivationKey: 'З' })).toBe('З');
  expect(labelText(key, {})).toBe('');
  expect(labelText(PART_LABELS.AltitudeSensor[0], { ActivationHeight: 30000 })).toBe('30000');
  expect(labelText(PART_LABELS.VelocitySensor[0], { ActivationSpeed: 88 })).toBe('88');
  expect(labelText(PART_LABELS.VelocitySensor[0], { ActivationSpeed: 'x' })).toBe('x');
  expect(PART_LABELS.EntitySensor.map((s) => labelText(s, {}))).toEqual([
    'UP',
    'FRONT',
    'DOWN',
    'LEFT',
    'BACK',
    'RIGHT',
  ]);
});

test("a key sits on the sensor's +Z face and reads left to right seen from the front", () => {
  const m = labelMatrix(PART_LABELS.InputSensor[0]);
  // Out of the +Z face, letters upright; seen from in front of it, the part's +X is on the right.
  near(column(m, 2), 0, 0, 1);
  near(column(m, 1), 0, 1, 0);
  near(column(m, 0), 1, 0, 0);
  const at = new Vector3().setFromMatrixPosition(m);
  expect(at.z).toBeGreaterThan(0.3);
  expect(at.z).toBeLessThan(0.31);
});

test("the EntitySensor's words lie on its buttons, read with +Z up as in game", () => {
  for (const spec of PART_LABELS.EntitySensor) {
    const m = labelMatrix(spec);
    near(column(m, 2), 0, 1, 0);
    near(column(m, 1), 0, 0, 1);
    expect(new Vector3().setFromMatrixPosition(m).y).toBeGreaterThan(0.443);
  }
});

test('text shrinks to fit its box, like TextScaled', () => {
  // One glyph is limited by the height; a long word by the width (256 · 0.9 / 5 = 46.08).
  expect(fitPx(0.6, 256, 200)).toBe(160);
  expect(fitPx(5, 256, 200)).toBe(46);
  expect(fitPx(0, 256, 200)).toBe(160);
});

test('labels follow their part, hide with it, and go when their text does', () => {
  const made: string[] = [];
  const layer = new LabelsLayer((text) => {
    made.push(text);
    return new Texture();
  });
  const world = new Matrix4().makeTranslation(1, 2, 3);
  const poses = posesOf([
    [1, world],
    [2, new Matrix4()],
  ]);
  const withKey = (props: Record<string, string>) =>
    docOf(part(1, 'InputSensor', [], props), part(2, 'Part'));
  layer.sync(withKey({ ActivationKey: 'K' }), poses, new Set());
  expect(layer.group.children).toHaveLength(1);
  const mesh = layer.group.children[0];
  const want = world.clone().multiply(labelMatrix(PART_LABELS.InputSensor[0]));
  expect(mesh.matrix.equals(want)).toBe(true);
  expect(mesh.visible).toBe(true);
  layer.sync(withKey({ ActivationKey: 'K' }), poses, new Set([1]));
  expect(mesh.visible).toBe(false);
  layer.sync(withKey({ ActivationKey: 'L' }), poses, new Set());
  layer.sync(withKey({ ActivationKey: 'K' }), poses, new Set());
  expect(made).toEqual(['K', 'L']);
  layer.sync(withKey({}), poses, new Set());
  expect(layer.group.children).toHaveLength(0);
  layer.sync(withKey({ ActivationKey: 'K' }), poses, new Set());
  layer.sync(docOf(part(2, 'Part')), poses, new Set());
  expect(layer.group.children).toHaveLength(0);
  layer.dispose();
});

test('a transform preview moves the labels with their part', () => {
  const layer = new LabelsLayer(() => new Texture());
  layer.sync(docOf(part(1, 'EntitySensor')), posesOf([[1, new Matrix4()]]), new Set());
  expect(layer.group.children).toHaveLength(6);
  const moved = new Matrix4().makeTranslation(5, 0, 0);
  layer.setPreview(new Map([[1, moved]]));
  PART_LABELS.EntitySensor.forEach((spec, i) => {
    const want = moved.clone().multiply(labelMatrix(spec));
    expect(layer.group.children[i].matrix.equals(want)).toBe(true);
  });
});
