import { IDENTITY_CF } from '../../src/core/cframe';
import { facingLabel, frameFromNormal, turnFrame } from '../../src/core/frames';
import type { CFrame12 } from '../../src/core/types';

test('+Y follows the normal and roll snaps to part axes', () => {
  expect(frameFromNormal([0.5, 0, 0], [1, 0, 0])).toEqual([0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0]);
  expect(frameFromNormal([0, -0.5, 0], [0, -2, 0])).toEqual([
    0, -0.5, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1,
  ]);
  expect(frameFromNormal([0, 0, 0], [0, 1, 0])).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
});

const PLUS_X: CFrame12 = [0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0];
const close = (a: CFrame12, b: CFrame12) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 12));

test('turnFrame turns about the frame’s own axis and keeps its origin', () => {
  // About its own Y the socket rolls in place: still facing +X, its X now −Y.
  close(turnFrame(PLUS_X, 'y', 90), [0.5, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0, 1]);
  // About its own X (world +Z here) it tips from facing +X to facing +Y.
  close(turnFrame(PLUS_X, 'x', 90), [0.5, 0, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0]);
  close(turnFrame(turnFrame(PLUS_X, 'z', 30), 'z', -30), PLUS_X);
});

test('facingLabel names the axis a socket faces, or its direction when off-axis', () => {
  expect(facingLabel(PLUS_X)).toBe('+X');
  expect(facingLabel([0, -0.5, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1])).toBe('−Y');
  expect(facingLabel(turnFrame(PLUS_X, 'x', -90))).toBe('−Y');
  expect(facingLabel(turnFrame(IDENTITY_CF, 'z', 45))).toBe('(−0.71, 0.71, 0.00)');
});
