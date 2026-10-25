// Deterministic mock servo motion, in degrees and seconds (no physics or signal propagation).
import type { Json } from './types';

export const SERVO_DEFAULTS = {
  Speed: 45,
  Rest: true,
  LimitEnabled: true,
  LimitAngle: 45,
  Rotation: 0,
} as const;
export interface ServoSettings {
  readonly Speed: number;
  readonly Rest: boolean;
  readonly LimitEnabled: boolean;
  readonly LimitAngle: number;
  readonly Rotation: number;
}
export type ServoDirection = -1 | 0 | 1;
export const isServo = (type: string): boolean => type === 'Servo' || type === 'Servo_Physics';
export function servoSettings(props: Readonly<Record<string, Json>>): ServoSettings {
  const number = (key: 'Speed' | 'LimitAngle' | 'Rotation'): number => {
    const value = props[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? key === 'Rotation'
        ? value
        : Math.max(0, value)
      : SERVO_DEFAULTS[key];
  };
  return {
    Speed: number('Speed'),
    LimitAngle: number('LimitAngle'),
    Rotation: number('Rotation'),
    Rest: typeof props.Rest === 'boolean' ? props.Rest : true,
    LimitEnabled: typeof props.LimitEnabled === 'boolean' ? props.LimitEnabled : true,
  };
}
export function stepServo(
  angle: number,
  direction: ServoDirection,
  settings: ServoSettings,
  dt: number,
): number {
  if (!Number.isFinite(dt) || dt <= 0 || settings.Speed === 0) return angle;
  const distance = settings.Speed * dt;
  let next = angle;
  if (direction !== 0) {
    next = angle + direction * distance;
    if (settings.LimitEnabled) {
      next =
        direction > 0
          ? Math.max(angle, Math.min(settings.LimitAngle, next))
          : Math.min(angle, Math.max(-settings.LimitAngle, next));
    }
  } else if (settings.Rest) next = Math.sign(angle) * Math.max(0, Math.abs(angle) - distance);
  return Number.isFinite(next) ? next + 0 : angle;
}
