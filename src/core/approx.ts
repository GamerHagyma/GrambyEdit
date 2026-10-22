import type { Vec3 } from './catalog-types';
import type { CFrame12, SocketId } from './types';

type Face = '+Y' | '-Y' | '+X' | '-X' | '+Z' | '-Z';

/** Row-major rotations; the side faces reuse the `Part` socket frames (+X = 2, −X = 3, −Z = 4, +Z = 5). */
const ROTATION: Record<Face, readonly number[]> = {
  '+Y': [1, 0, 0, 0, 1, 0, 0, 0, 1],
  '-Y': [1, 0, 0, 0, -1, 0, 0, 0, -1],
  '+X': [0, 1, 0, 0, 0, 1, 1, 0, 0],
  '-X': [0, -1, 0, 0, 0, 1, -1, 0, 0],
  '+Z': [-1, 0, 0, 0, 0, 1, 0, 1, 0],
  '-Z': [1, 0, 0, 0, 0, 1, 0, -1, 0],
};

const NAMED_FACES: readonly (readonly [RegExp, Face])[] = [
  [/top/i, '+Y'],
  [/bottom/i, '-Y'],
  [/left/i, '-X'],
  [/right/i, '+X'],
  [/front/i, '-Z'],
  [/back/i, '+Z'],
];

const CYCLE: readonly Face[] = ['+Y', '+X', '-X', '+Z', '-Z', '-Y'];

export const PLACEHOLDER_BOX: { readonly min: Vec3; readonly max: Vec3 } = {
  min: [-0.5, -0.5, -0.5],
  max: [0.5, 0.5, 0.5],
};

/** Fallback outward socket frame on a bbox face, used until the socket is captured (spec §10.5). */
export function approxSocketFrame(input: {
  min: Vec3;
  max: Vec3;
  socket: SocketId;
  side: 'child' | 'parent' | 'both';
  name: string | null;
  parentSockets: readonly SocketId[];
}): CFrame12 {
  const { min, max, socket, side, name, parentSockets } = input;
  let face: Face;
  let shift = 0;
  const named = name === null ? undefined : NAMED_FACES.find(([re]) => re.test(name));
  if (side === 'child') face = '-Y';
  else if (named) face = named[1];
  else {
    const i = Math.max(0, parentSockets.indexOf(socket));
    face = CYCLE[i % CYCLE.length];
    shift = 0.2 * Math.floor(i / CYCLE.length);
  }
  const centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const axis = 'XYZ'.indexOf(face[1]);
  centre[axis] = face[0] === '+' ? max[axis] : min[axis];
  const r = ROTATION[face];
  // The shift runs along the face's local +X, which is the rotation's first column.
  const out: readonly number[] = [
    centre[0] + shift * r[0],
    centre[1] + shift * r[3],
    centre[2] + shift * r[6],
    ...r,
  ].map((v) => v + 0);
  return out as CFrame12;
}
