import { approxSocketFrame } from '../../src/core/approx';

const cube = { min: [-1, -1, -1], max: [1, 1, 1] } as const;
test('a named parent socket goes to its face', () =>
  expect(
    approxSocketFrame({
      min: [-2, -0.25, -2],
      max: [2, 0.25, 2],
      socket: '5',
      side: 'parent',
      name: 'Top',
      parentSockets: ['1', '2', '4', '5', '6'],
    }),
  ).toEqual([0, 0.25, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
test('a child socket sits on the -Y face pointing out', () =>
  expect(
    approxSocketFrame({ ...cube, socket: '4', side: 'child', name: null, parentSockets: [] }),
  ).toEqual([0, -1, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1]));
test('unnamed parent sockets cycle +Y, +X, -X, +Z, -Z, -Y', () => {
  const ids = ['1', '2', '3', '4', '5', '6'];
  expect(
    ids.map((s) =>
      approxSocketFrame({
        ...cube,
        socket: s,
        side: 'parent',
        name: null,
        parentSockets: ids,
      }).slice(0, 3),
    ),
  ).toEqual([
    [0, 1, 0],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0, -1, 0],
  ]);
});
