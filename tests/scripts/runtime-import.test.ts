import { buildAssets } from '../../scripts/build-assets';
import { Vector3 } from 'three';
import { subPartMatrix } from '../../src/core/pose';

test('PressurePlate separates the plate and output into independently posed bodies', async () => {
  const { catalog } = await buildAssets({ root: '.', outDir: null });
  const def = catalog.parts.PressurePlate;
  expect(def.bodies?.map((body) => body.sockets)).toEqual([['1'], ['2', '3']]);
  expect(def.bodies?.map((body) => body.pivot)).toEqual([
    [0, 0, 0],
    [-2, 0, 0],
  ]);
  expect(Object.values(def.sockets).every((s) => s.frameSource === 'captured')).toBe(true);
});

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

test("flags the hinged child sockets, and keeps the game's mount type on parent sockets", async () => {
  const { catalog } = await buildAssets({ root: '.', outDir: null });
  const flagged = (flag: 'hinge') =>
    Object.values(catalog.parts)
      .flatMap((p) =>
        Object.entries(p.sockets)
          .filter(([, s]) => s[flag])
          .map(([id]) => `${p.type}.${id}`),
      )
      .sort();
  expect(flagged('hinge')).toEqual(['DoorA.1', 'DoorB.1', 'DoorC.1', 'DoorD.1', 'GasCap.1']);
  const mounts = Object.values(catalog.parts)
    .flatMap((p) =>
      Object.entries(p.sockets)
        .filter(([, s]) => s.mountType)
        .map(([id, s]) => `${p.type}.${id} ${s.mountType}`),
    )
    .sort();
  expect(mounts).toEqual([
    'BallSocket.2 BallSocket',
    'Bearing.2 Bearing',
    'Chassis.1 Suspension',
    'Chassis.10 Steering',
    'Chassis.12 Door',
    'Chassis.20 Door',
    'Chassis.3 Door',
    'Chassis.4 Suspension',
    'Chassis.5 Suspension',
    'Chassis.6 Suspension',
    'GoKart.4 Suspension',
    'GoKart.6 Steering',
    'Roof.2 Door',
    'Roof.3 Door',
    'Roof.4 Door',
    'Roof.5 Door',
    'Servo_Physics.2 Servo',
    'ShoppingCart.2 Steering',
    'ShoppingCart.3 Suspension',
    'ShoppingCart.4 Suspension',
    'ShoppingCart.5 Suspension',
    'ShoppingCart.6 Suspension',
  ]);
}, 30_000);

test("turns the Spinner's output so +Y points out of the part, as the Servo's is captured", async () => {
  // The game captures it as a hinge attachment, its spin axis (X) out of the part.
  const { catalog } = await buildAssets({ root: '.', outDir: null });
  const spinner = catalog.parts.Bearing.sockets['2'].frame;
  const servo = catalog.parts.Servo_Physics.sockets['2'].frame;
  spinner.forEach((v, k) => expect(v).toBeCloseTo(servo[k], 6));
}, 30_000);
