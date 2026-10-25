import { servoSettings, stepServo } from '../../src/core/servo-simulation';

test('defaults use 45 degrees/s, ±45 degrees and rest at zero; explicit false and zero survive', () => {
  expect(servoSettings({})).toEqual({
    Speed: 45,
    LimitAngle: 45,
    Rotation: 0,
    Rest: true,
    LimitEnabled: true,
  });
  expect(
    servoSettings({ Speed: 0, LimitAngle: 0, Rotation: -721.5, Rest: false, LimitEnabled: false }),
  ).toEqual({ Speed: 0, LimitAngle: 0, Rotation: -721.5, Rest: false, LimitEnabled: false });
});
test('fractional speeds advance by elapsed seconds in either direction and stop at symmetric limits', () => {
  const s = servoSettings({ Speed: 47.2, LimitAngle: 36.9 });
  expect(stepServo(0, 1, s, 0.25)).toBeCloseTo(11.8);
  expect(stepServo(0, -1, s, 0.25)).toBeCloseTo(-11.8);
  expect(stepServo(30, 1, s, 1)).toBe(36.9);
  expect(stepServo(-30, -1, s, 1)).toBe(-36.9);
});
test('rest returns at configured speed without overshooting, while disabled rest holds', () => {
  const s = servoSettings({ Speed: 45 });
  expect(stepServo(30, 0, s, 0.5)).toBe(7.5);
  expect(stepServo(-7, 0, s, 0.5)).toBe(0);
  expect(stepServo(30, 0, { ...s, Rest: false }, 10)).toBe(30);
});
test('unlimited angles do not wrap and invalid elapsed time does not corrupt the angle', () => {
  const s = servoSettings({ Speed: 720, LimitEnabled: false });
  expect(stepServo(350, 1, s, 2)).toBe(1790);
  expect(stepServo(0, -1, s, 2)).toBe(-1440);
  for (const dt of [-1, NaN, Infinity, 0]) expect(stepServo(12, 1, s, dt)).toBe(12);
  expect(stepServo(12, 1, { ...s, Speed: 0 }, 2)).toBe(12);
});

test('enabling limits after multiple turns never teleports or exceeds the configured speed', () => {
  const s = servoSettings({ Speed: 45, LimitAngle: 45 });
  expect(stepServo(720, -1, s, 0.01)).toBeCloseTo(719.55);
  expect(stepServo(720, 1, s, 0.01)).toBe(720);
  expect(stepServo(-720, 1, s, 0.01)).toBeCloseTo(-719.55);
  expect(stepServo(-720, -1, s, 0.01)).toBe(-720);
});
