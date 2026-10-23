// The twelve shapes (spec §15), by id.
import { arc } from './arc';
import { box } from './box';
import { cone } from './cone';
import { cylinder } from './cylinder';
import { grid } from './grid';
import { helix } from './helix';
import { line } from './line';
import { ring } from './ring';
import { sphere } from './sphere';
import { stairs } from './stairs';
import { text } from './text';
import { torus } from './torus';
import type { ShapeDef, ShapeId } from './types';

export const SHAPES: Readonly<Record<ShapeId, ShapeDef>> = {
  line,
  grid,
  box,
  ring,
  cylinder,
  sphere,
  cone,
  torus,
  arc,
  helix,
  stairs,
  text,
};
