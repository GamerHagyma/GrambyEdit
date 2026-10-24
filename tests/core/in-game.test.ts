// Builds the user spawned in game, with what the game showed (2026-10-24 screenshots). Ids are entry
// numbers in the codes.
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { computePoses } from '../../src/core/pose';
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
