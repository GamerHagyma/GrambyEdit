// Multi-piece parts (D-F3): each body of a Wire, splitter or button hangs from its own connection.
import { readFileSync } from 'node:fs';
import { Matrix4, Vector3 } from 'three';
import { cfToMatrix4 } from '../../src/core/cframe';
import { splitBodies } from '../../src/core/mesh-bodies';
import {
  bodyOfSocket,
  bodyWorld,
  computePoses,
  POSE_CYCLE,
  socketWorld,
} from '../../src/core/pose';
import type { Doc, PartId } from '../../src/core/types';
import { corpusCodes } from '../fixtures/corpus';
import { importCode } from '../helpers/import';
import { realCatalog } from '../helpers/real-catalog';

const at = (m: Matrix4) => new Vector3().setFromMatrixPosition(m);
/** Where a child socket sits once its body is posed. */
const childSocketAt = async (doc: Doc, id: PartId, socket: string) => {
  const cat = await realCatalog();
  const part = doc.parts.get(id)!;
  const def = cat.parts[part.type];
  const poses = computePoses(doc, cat, cat.conventions);
  const w = bodyWorld(poses, id, bodyOfSocket(def, socket))!;
  return at(w.clone().multiply(cfToMatrix4(def.sockets[socket].frame)));
};

test('splitBodies gives each connected piece to the nearest anchor', () => {
  // Two separate triangles, far apart along X.
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0];
  const split = splitBodies(
    positions,
    [0, 1, 2, 3, 4, 5],
    [
      [10, 0, 0],
      [0, 0, 0],
    ],
  );
  expect([...split.triangleBody]).toEqual([1, 0]);
  expect(split.boxes[0].min).toEqual([10, 0, 0]);
});

test('the wheel: each Wire end sits on the tire it is joined to', async () => {
  const cat = await realCatalog();
  const wheel = importCode(readFileSync('tests/fixtures/wheel.txt', 'utf8'));
  // Without its OrientationX = 180 (which flips each end about its own centre), a Wire end's
  // child socket lands exactly on its tire's socket.
  const parts = new Map(wheel.parts);
  for (const [id, p] of parts) if (p.type === 'Wire') parts.set(id, { ...p, props: {} });
  const doc = { ...wheel, parts };
  const poses = computePoses(doc, cat, cat.conventions);
  // Entry 2 is a Wire: end B (socket 3) joins Tire #11's socket 2, end A (socket 1) Tire #1's.
  const [tire1, wire, tire11] = [doc.order[0], doc.order[1], doc.order[10]];
  const endB = await childSocketAt(doc, wire, '3');
  const endA = await childSocketAt(doc, wire, '1');
  expect(endB.distanceTo(at(socketWorld(poses, cat, doc, tire11, '2')!))).toBeLessThan(1e-9);
  expect(endA.distanceTo(at(socketWorld(poses, cat, doc, tire1, '2')!))).toBeLessThan(1e-9);
  const real = computePoses(wheel, cat, cat.conventions);
  for (const id of wheel.order) expect(real.flags.get(id)! & POSE_CYCLE).toBe(0);
});

test("a Switch's base stays on its point while its circle sits on a Part's top", async () => {
  const cat = await realCatalog();
  // Switch #3: circle (socket 1) on Part #2's top socket 6, base (socket 3) on Base #1's point.
  const code = Buffer.from(
    JSON.stringify([
      [
        'Base',
        [],
        {
          EphemeralAttachments: {
            '{p}': { partName: 'Base', cframe: [1, 0.25, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1] },
          },
        },
      ],
      ['Part', [], []],
      [
        'Switch',
        [
          ['1', '6', 2],
          ['3', '{p}', 1],
        ],
        [],
      ],
    ]),
  ).toString('base64');
  const doc = importCode(code);
  const poses = computePoses(doc, cat, cat.conventions);
  const [base, cube, sw] = doc.order;
  const point = cfToMatrix4(doc.parts.get(base)!.points!.get('{p}')!.cframe).premultiply(
    poses.world.get(base)!,
  );
  expect((await childSocketAt(doc, sw, '3')).distanceTo(at(point))).toBeLessThan(1e-9);
  expect(
    (await childSocketAt(doc, sw, '1')).distanceTo(at(socketWorld(poses, cat, doc, cube, '6')!)),
  ).toBeLessThan(1e-9);
});

test('every corpus build poses every body with finite matrices', async () => {
  const cat = await realCatalog();
  for (const code of corpusCodes()) {
    const doc = importCode(code);
    const poses = computePoses(doc, cat, cat.conventions);
    for (const id of doc.order) {
      const all = poses.bodies?.get(id) ?? [poses.world.get(id)!];
      for (const m of all) expect(m.elements.every(Number.isFinite)).toBe(true);
    }
  }
});
