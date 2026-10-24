// Builds the user spawned in game, with what the game showed (2026-10-24 screenshots). Ids are entry
// numbers in the codes.
import { readFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import type { Catalog } from '../../src/core/catalog-types';
import { computePoses, socketWorld, type Poses } from '../../src/core/pose';
import type { Doc } from '../../src/core/types';
import { docOf, mount, part, pt, sock } from '../helpers/doc';
import { importCode } from '../helpers/import';
import { realCatalog } from '../helpers/real-catalog';

async function centres(file: string): Promise<(id: number) => Vector3> {
  const cat = await realCatalog();
  const doc: Doc = importCode(readFileSync(file, 'utf8'));
  const poses = computePoses(doc, cat, cat.conventions);
  return (id) => {
    const box = cat.parts[doc.parts.get(id)!.type].mesh!;
    const local = new Vector3(...box.min).add(new Vector3(...box.max)).multiplyScalar(0.5);
    return local.applyMatrix4(poses.world.get(id)!);
  };
}

const expectNear = (v: Vector3, x: number, y: number, z: number) => {
  expect(v.x).toBeCloseTo(x, 2);
  expect(v.y).toBeCloseTo(y, 2);
  expect(v.z).toBeCloseTo(z, 2);
};

test('Connector test: a row of four with one stacked on its end, as in game', async () => {
  const at = await centres('tests/fixtures/connector_test.txt');
  const root = at(3);
  // #2 on the root's socket 6, #6 on #2's socket 6; #4 on socket 3, #5 on #4's socket 4.
  expectNear(at(2).sub(root), 0, 0, 0.4);
  expectNear(at(6).sub(root), 0, 0.4, 0.4);
  expectNear(at(4).sub(root), 0, 0, -0.4);
  expectNear(at(5).sub(root), 0, 0, -0.8);
  // The SteeringGyro (#1) sits on the root's top.
  expect(at(1).y).toBeGreaterThan(root.y + 0.2);
});

test('Part test: OrientationY 90 turns the second column to +X, as in game', async () => {
  const at = await centres('tests/fixtures/part_test.txt');
  // The ShortStick from the root runs along +Z to the column. Part #2 (OrientationY 90) and the
  // Parts stacked on it (#9, #7) form the column; #3, #8 and #6 hang off their socket 4 faces.
  // Seen along the stick, the game puts that second column on the left: +X.
  for (const [main, side] of [
    [2, 3],
    [9, 8],
    [7, 6],
  ]) {
    expectNear(at(side).sub(at(main)), 1, 0, 0);
  }
});

test('Kamaz: the five front InputSensors face forward with upright keys, as in game', async () => {
  // К, а, м, А and З across the grille (the truck's front is +X), turned X 90 with Y 270, X 90 with
  // Y 270, X 90 alone, X 90 with Y 90, and Y 90 with Z 90. м's lone X turn means the same in every
  // order: its +Z face points out of the grille (+X), letter up. In game the other four match it.
  const cat = await realCatalog();
  const doc: Doc = importCode(readFileSync('tests/fixtures/kamaz_truck.txt', 'utf8'));
  const poses = computePoses(doc, cat, cat.conventions);
  for (const id of [894, 431, 1264, 174, 130]) {
    const m = poses.world.get(id)!;
    expectNear(new Vector3().setFromMatrixColumn(m, 2), 1, 0, 0);
    expectNear(new Vector3().setFromMatrixColumn(m, 1), 0, 1, 0);
  }
});

test('Cadillac: OrientationX tips the windshield back, closes the hood and folds the trunk in, as in game', async () => {
  // The car points to -X (its headlights). In game the windshield leans back, the hood lies over the
  // engine, and nothing sticks out of the body.
  const cat = await realCatalog();
  const doc: Doc = importCode(readFileSync('tests/fixtures/cadillac.txt', 'utf8'));
  const poses = computePoses(doc, cat, cat.conventions);
  const up = (id: number) => new Vector3().setFromMatrixColumn(poses.world.get(id)!, 1);
  const facing = (id: number, socket: string) =>
    new Vector3().setFromMatrixColumn(socketWorld(poses, cat, doc, id, socket)!, 1);
  // The windshield stands on Connector #306 (OrientationX 22.5): tipped back by 22.5°.
  expectNear(up(306), Math.sin(Math.PI / 8), Math.cos(Math.PI / 8), 0);
  // The hood (#275) hangs from Servo #1 (OrientationX 90): right side up, in front of #306.
  expectNear(up(275), 0, 1, 0);
  expect(new Vector3().setFromMatrixPosition(poses.world.get(275)!).x).toBeLessThan(2.6);
  // The trunk's corner Parts #348 (right) and #393 (left), OrientationX 90 on a Connector's socket 6:
  // brake light (socket 5) to the rear, side panel (socket 4) forward, top row (socket 6) inward.
  for (const [id, inward] of [
    [348, 1],
    [393, -1],
  ]) {
    expectNear(facing(id, '5'), 1, 0, 0);
    expectNear(facing(id, '4'), -1, 0, 0);
    expectNear(facing(id, '6'), 0, 0, inward);
  }
  const at = [...poses.world.values()].map((m) => new Vector3().setFromMatrixPosition(m));
  expect(Math.max(...at.map((p) => p.x))).toBeLessThan(14.5);
  expect(Math.max(...at.map((p) => Math.abs(p.z)))).toBeLessThan(3.2);
  // The grille: Sticks #73 and #239, on ShortSticks turned X 90 with Z 270 and Z 90, lie across the
  // slot between the inner headlights #260 and #267, as the user saw in game.
  const left = new Vector3().setFromMatrixPosition(poses.world.get(267)!);
  const right = new Vector3().setFromMatrixPosition(poses.world.get(260)!);
  for (const id of [73, 239]) {
    const rod = poses.world.get(id)!;
    expect(Math.abs(new Vector3().setFromMatrixColumn(rod, 2).z)).toBeCloseTo(1, 6);
    const c = new Vector3().setFromMatrixPosition(rod);
    expect(Math.abs(c.y - left.y)).toBeLessThan(0.15);
    expect(Math.abs(c.x - left.x)).toBeLessThan(0.3);
    expect(c.z).toBeGreaterThan(Math.min(left.z, right.z));
    expect(c.z).toBeLessThan(Math.max(left.z, right.z));
  }
});

/** A part's mesh box in world space: exact for the quarter turns these tests check. */
function span(cat: Catalog, doc: Doc, poses: Poses, id: number): Box3 {
  const mesh = cat.parts[doc.parts.get(id)!.type].mesh!;
  return new Box3(new Vector3(...mesh.min), new Vector3(...mesh.max)).applyMatrix4(
    poses.world.get(id)!,
  );
}
const expectSpan = (b: Box3, lo: readonly number[], hi: readonly number[]) => {
  expectNear(b.min, lo[0], lo[1], lo[2]);
  expectNear(b.max, hi[0], hi[1], hi[2]);
};

test('Door sockets: a GasCap closes the fuel door and Roof doors stand in their openings, as in game', async () => {
  // DoorA–D and the GasCap mount by hinged sockets (HingeType), which the game turns a quarter about
  // their +Y on door sockets (MountType Door). Unturned, the GasCap sticks out of the car's side and
  // the doors lie on their backs.
  const cat = await realCatalog();
  const car = docOf(part(1, 'Chassis'), part(2, 'GasCap', [sock('1', 1, '20')]));
  const carPoses = computePoses(car, cat, cat.conventions);
  // The Chassis's fuel-door pocket spans x -3.066..-2.898, y 0.103..0.747, z 4.091..4.736.
  expectSpan(span(cat, car, carPoses, 2), [-3.066, 0.103, 4.083], [-2.966, 0.747, 4.728]);

  const cab = docOf(
    part(1, 'Roof'),
    part(2, 'DoorA', [sock('1', 1, '2')]),
    part(3, 'DoorB', [sock('1', 1, '5')]),
  );
  const cabPoses = computePoses(cab, cat, cat.conventions);
  expectSpan(span(cat, cab, cabPoses, 2), [-3.07, -2.417, -2.977], [-2.168, 2.343, 0.068]);
  expectSpan(span(cat, cab, cabPoses, 3), [2.168, -2.417, -2.977], [3.07, 2.343, 0.069]);
  for (const id of [2, 3]) {
    expectNear(new Vector3().setFromMatrixColumn(cabPoses.world.get(id)!, 1), 0, 1, 0);
  }
});

test('a GasCap on a point uses its calibrated point mount rather than a physical door joint', async () => {
  // An ephemeral point at the fuel socket's frame is not a physical door joint. The calibrated
  // point mount retains the 0.322 hinge distance on the cap's Y, rather than its native edge frame.
  const cat = await realCatalog();
  const frame = cat.parts.Chassis.sockets['20'].frame;
  const car = docOf(
    part(1, 'Chassis', [], {}, [pt('{u}', [...frame], cat.parts.Chassis.mainPartName)]),
    part(2, 'GasCap', [mount('1', 1, '{u}')]),
  );
  const poses = computePoses(car, cat, cat.conventions);
  // This frame points the cap's Y up, so its centre is 0.322 below the point at (-3.066, 0.425, 4.083).
  expectSpan(span(cat, car, poses, 2), [-3.116, -0.219, 3.761], [-3.016, 0.425, 4.406]);
  expectNear(new Vector3().setFromMatrixColumn(poses.world.get(2)!, 1), 0, 1, 0);
});

test('Kamaz: the cab doors on Connector sockets hang unturned, as in game', async () => {
  // Only door sockets and points turn hinged parts: DoorA #716 and DoorB #971 hang from Connector
  // socket 3s and stand upright in the cab's sides.
  const cat = await realCatalog();
  const doc: Doc = importCode(readFileSync('tests/fixtures/kamaz_truck.txt', 'utf8'));
  const poses = computePoses(doc, cat, cat.conventions);
  expectSpan(span(cat, doc, poses, 716), [-5.145, 0.84, -4.29], [-2.1, 5.6, -3.388]);
  expectSpan(span(cat, doc, poses, 971), [-5.146, 0.84, 3.388], [-2.1, 5.6, 4.29]);
  for (const id of [716, 971]) {
    expectNear(new Vector3().setFromMatrixColumn(poses.world.get(id)!, 1), 0, 1, 0);
  }
});

test('the original alignment probe uses the calibrated GasCap point frame', async () => {
  // The initial point-origin hypothesis was disproved by the centred probe. The six-case comparison
  // then confirmed a further 0.322 along the point plane, without changing this probe's X or height.
  const cat = await realCatalog();
  const doc: Doc = importCode(readFileSync('tests/fixtures/gascap_point_alignment.txt', 'utf8'));
  const poses = computePoses(doc, cat, cat.conventions);
  const centers = [
    [-0.5335, 0.55, 0.0568],
    [0.1111, 0.55, 0.0568],
    [-0.5335, 0.55, -0.5878],
    [0.1111, 0.55, -0.5878],
  ];
  for (const [i, expected] of centers.entries()) {
    const world = poses.world.get(i + 2)!;
    expectNear(new Vector3().setFromMatrixPosition(world), expected[0], expected[1], expected[2]);
    expectNear(new Vector3().setFromMatrixColumn(world, 0), 0, 1, 0);
  }
  expectSpan(span(cat, doc, poses, 2), [-0.8558, 0.5, -0.2655], [-0.2112, 0.6, 0.3791]);
  expectNear(new Vector3().setFromMatrixPosition(poses.world.get(6)!), 0, 0.5, 0);
});

test('the GasCap point correction follows a rotated and translated host', async () => {
  const cat = await realCatalog();
  const doc: Doc = importCode(readFileSync('tests/fixtures/gascap_point_alignment.txt', 'utf8'));
  const moved = { ...doc, layout: new Map([[1, [5, 2, 7, 0, 0, 1, 0, 1, 0, -1, 0, 0] as const]]) };
  const poses = computePoses(moved, cat, cat.conventions);
  expectNear(new Vector3().setFromMatrixPosition(poses.world.get(2)!), 5.0568, 2.55, 7.5335);
});

test('the game-confirmed green comparison plates centre on normal, rotated-host and rotated-point cubes', async () => {
  // The user loaded this exact red/green probe in game and confirmed all three green cases centre.
  // This pins the translation relative to each host; the nested probe's global orientation differs
  // in game, so it is not evidence that every global pose convention is correct.
  const cat = await realCatalog();
  const doc: Doc = importCode(readFileSync('tests/fixtures/gascap_offset_comparison.txt', 'utf8'));
  const poses = computePoses(doc, cat, cat.conventions);
  for (const host of [20, 26, 32]) {
    const back = poses.world.get(host)!.clone().invert();
    const center = new Vector3();
    for (let id = host + 1; id <= host + 4; id++) {
      center.add(new Vector3().setFromMatrixPosition(poses.world.get(id)!).applyMatrix4(back));
    }
    center.multiplyScalar(0.25);
    expectNear(center, 0, 0.55, 0);
  }
});
