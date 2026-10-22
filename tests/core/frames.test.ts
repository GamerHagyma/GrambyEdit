import { frameFromNormal } from '../../src/core/frames';

test('+Y follows the normal and roll snaps to part axes', () => {
  expect(frameFromNormal([0.5, 0, 0], [1, 0, 0])).toEqual([0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0]);
  expect(frameFromNormal([0, -0.5, 0], [0, -2, 0])).toEqual([
    0, -0.5, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1,
  ]);
  expect(frameFromNormal([0, 0, 0], [0, 1, 0])).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
});
