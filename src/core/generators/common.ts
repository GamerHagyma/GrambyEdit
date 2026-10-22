// Guards and helpers shared by the shape generators.
import type { CFrame12 } from '../types';
import type { ShapeInput } from './types';

/** The most frames one shape may produce. The user-set element limit (Task 37) is far lower. */
export const MAX_GENERATED = 100_000;
/** Below this, neighbouring elements overlap completely; such input generates nothing. */
export const MIN_SPACING = 0.01;
const MAX_TEXT_CHARS = 2_000;

/** Thrown when a shape would exceed `MAX_GENERATED`, before it can exhaust memory. */
export class GenerateLimitError extends Error {
  constructor() {
    super(`This shape would create more than ${MAX_GENERATED.toLocaleString('en-US')} parts.`);
  }
}

/**
 * False when the input cannot generate anything (spacing below `MIN_SPACING`, non-finite numbers).
 * Throws `GenerateLimitError` when one size alone spans more than `MAX_GENERATED` spacings, which
 * bounds every internal loop before it runs.
 */
export function checkInput({ params, spacing }: ShapeInput): boolean {
  if (!(spacing >= MIN_SPACING) || !Number.isFinite(spacing)) return false;
  for (const v of Object.values(params)) {
    if (typeof v === 'string') {
      if (v.length > MAX_TEXT_CHARS) throw new GenerateLimitError();
    } else if (!Number.isFinite(v)) {
      return false;
    } else if (Math.abs(v) / spacing > MAX_GENERATED) {
      throw new GenerateLimitError();
    }
  }
  return true;
}

/** Appends a frame, throwing once a shape exceeds `MAX_GENERATED`. */
export function add(out: CFrame12[], cf: CFrame12): void {
  if (out.length >= MAX_GENERATED) throw new GenerateLimitError();
  out.push(cf);
}

/** Identity rotation at (x, y, z), with `-0` normalised. */
export function fixedFrame(x: number, y: number, z: number): CFrame12 {
  return [x + 0, y + 0, z + 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
}
