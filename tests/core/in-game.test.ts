// Builds the user spawned in game, with what the game showed (2026-10-24 screenshots). Ids are entry
// numbers in the codes.
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { computePoses, socketWorld } from '../../src/core/pose';
import type { Doc } from '../../src/core/types';
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
