// Shape generator contract (spec §15). Generators are pure: params in, frames out.
import type { CFrame12 } from '../types';

export type ShapeId =
  | 'line'
  | 'grid'
  | 'box'
  | 'ring'
  | 'cylinder'
  | 'sphere'
  | 'cone'
  | 'torus'
  | 'arc'
  | 'helix'
  | 'stairs'
  | 'text';
export type GenFill = 'solid' | 'shell' | 'frame' | 'outline';
export type GenOrient = 'fixed' | 'outward' | 'tangent';

export interface ShapeParam {
  readonly key: string;
  readonly label: string;
  readonly kind: 'number' | 'int' | 'text';
  readonly default: number | string;
  readonly min?: number;
  readonly max?: number;
}

export interface ShapeInput {
  readonly params: Readonly<Record<string, number | string>>;
  readonly fill: GenFill;
  readonly orient: GenOrient;
  readonly spacing: number;
}

export interface ShapeDef {
  readonly id: ShapeId;
  readonly label: string;
  readonly params: readonly ShapeParam[];
  readonly fills: readonly GenFill[];
  generate(input: ShapeInput): CFrame12[];
}
