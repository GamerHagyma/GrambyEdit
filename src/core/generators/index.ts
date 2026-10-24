// Shape generators (spec §15): the registry and the sub-doc build the Generators panel uses.
export {
  buildGeneratedSubDoc,
  mountSubDoc,
  tintColors,
  withTintMode,
  type GenColor,
  type GenRequest,
  type Tint,
} from './build';
export { SHAPES } from './registry';
export type { GenFill, GenOrient, ShapeDef, ShapeId, ShapeInput, ShapeParam } from './types';
