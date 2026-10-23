import { transact } from '../../../src/core/ops/transact';
import { addConn, detach, makePoseJoint, removeConn } from '../../../src/core/ops/conns';
import { computePoses } from '../../../src/core/pose';
import { DEFAULT_CONVENTIONS } from '../../../src/core/conventions';
import { matrix4ToCf } from '../../../src/core/cframe';
import { docOf, part, sock } from '../../helpers/doc';
import { MINI } from '../../helpers/catalog';
import type { CFrame12, PartId } from '../../../src/core/types';

const CF: CFrame12 = [1, 2, 3, 1, 0, 0, 0, 1, 0, 0, 0, 1];

test('addConn refuses unavailable sockets and pose cycles', () => {
  const d0 = docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')]), part(3, 'Part'));
  transact(d0, 'x', (d) => {
    expect(addConn(d, MINI, 3, sock('1', 1, '6'), { asPose: true })).toMatchObject({
      ok: false,
      code: 'socket-used',
    });
    expect(addConn(d, MINI, 1, sock('1', 2, '6'), { asPose: true })).toMatchObject({
      ok: false,
      code: 'pose-cycle',
    });
    expect(addConn(d, MINI, 3, sock('1', 2, '6'), { asPose: true })).toEqual({ ok: true });
  });
});

test('addConn appends a secondary joint; a pose joint goes first and a former root loses its layout', () => {
  const d0 = {
    ...docOf(part(1, 'Part'), part(2, 'Splitter_2', [sock('3', 1, '6')]), part(3, 'Part')),
    layout: new Map<PartId, CFrame12>([[3, CF]]),
  };
  const { doc } = transact(d0, 'x', (d) => {
    expect(addConn(d, MINI, 2, sock('5', 3, '2'), { asPose: false })).toEqual({ ok: true });
    expect(addConn(d, MINI, 3, sock('1', 1, '2'), { asPose: true })).toEqual({ ok: true });
  });
  expect(doc.parts.get(2)!.conns).toEqual([sock('3', 1, '6'), sock('5', 3, '2')]);
  expect(doc.parts.get(3)!.conns).toEqual([sock('1', 1, '2')]);
  expect(doc.layout.has(3)).toBe(false);
});

test('detach drops the pose conn: a secondary joint takes over, else the part is loosened where it was', () => {
  const d0 = docOf(
    part(1, 'Part'),
    part(2, 'Part'),
    part(3, 'Wire', [sock('1', 1, '2'), sock('3', 2, '6')]),
    part(4, 'Wire', [sock('1', 1, '4')]),
  );
  const poses = computePoses(d0, MINI, DEFAULT_CONVENTIONS);
  const { doc } = transact(d0, 'x', (d) => {
    detach(d, 3, poses);
    detach(d, 4, poses);
  });
  expect(doc.parts.get(3)!.conns).toEqual([sock('3', 2, '6')]);
  expect(doc.parts.get(4)!.conns).toEqual([]);
  expect(doc.layout.get(4)).toEqual(matrix4ToCf(poses.world.get(4)!));
  expect(doc.layout.has(3)).toBe(false);
});

test('makePoseJoint moves a secondary joint to index 0, unless that closes a loop', () => {
  const plain = docOf(
    part(1, 'Part'),
    part(2, 'Part'),
    part(3, 'Splitter_2', [sock('5', 2, '6'), sock('3', 1, '6')]),
  );
  const { doc } = transact(plain, 'x', (d) => {
    expect(makePoseJoint(d, 3, 1)).toEqual({ ok: true });
  });
  expect(doc.parts.get(3)!.conns).toEqual([sock('3', 1, '6'), sock('5', 2, '6')]);

  // Part 1 hangs from part 3, so making part 1 the pose parent of 3 would close a loop.
  const looped = docOf(
    part(1, 'Part', [sock('1', 3, '4')]),
    part(2, 'Part'),
    part(3, 'Splitter_2', [sock('5', 2, '6'), sock('3', 1, '6')]),
  );
  transact(looped, 'x', (d) => {
    expect(makePoseJoint(d, 3, 1)).toEqual({
      ok: false,
      code: 'pose-cycle',
      message: 'That joint would make this part hold itself up through its own children.',
    });
  });
});

test('removeConn drops a secondary joint and refuses to drop the pose conn', () => {
  const d0 = docOf(
    part(1, 'Part'),
    part(2, 'Part'),
    part(3, 'Splitter_2', [sock('5', 2, '6'), sock('3', 1, '6')]),
  );
  const { doc } = transact(d0, 'x', (d) => removeConn(d, 3, 1));
  expect(doc.parts.get(3)!.conns).toEqual([sock('5', 2, '6')]);
  expect(() => transact(d0, 'x', (d) => removeConn(d, 3, 0))).toThrow(/detach/);
});
