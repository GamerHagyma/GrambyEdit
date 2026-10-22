// Socket and calibration probe codes (spec §12.7, §10.4): tiny builds that show socket numbering and
// calibration answers in game. Each code is built with `encode`, so it imports like any share code.
import type { Catalog } from './catalog-types';
import { encode } from './codec';
import type { Json, RGB, SocketId, Uuid } from './types';

export interface MarkerColor {
  readonly name: string;
  readonly rgb: RGB;
}

export const MARKER_COLORS: readonly MarkerColor[] = [
  { name: 'red', rgb: [220, 50, 47] },
  { name: 'orange', rgb: [255, 140, 0] },
  { name: 'yellow', rgb: [255, 215, 0] },
  { name: 'green', rgb: [46, 160, 67] },
  { name: 'cyan', rgb: [0, 188, 212] },
  { name: 'blue', rgb: [33, 90, 230] },
  { name: 'purple', rgb: [142, 68, 173] },
  { name: 'pink', rgb: [255, 105, 180] },
];

/** One socket per marker color, so a code holds at most this many sockets. */
const PER_CODE = MARKER_COLORS.length;

export function probeUuid(i: number): Uuid {
  return `{00000000-0000-4000-8000-${String(i).padStart(12, '0')}}`;
}

export interface ProbeLegend {
  readonly socket: SocketId | null;
  readonly side: 'parent' | 'child' | 'calibration';
  readonly color: MarkerColor | null;
  readonly note: string;
}

export interface ProbeCode {
  readonly id: string;
  readonly title: string;
  readonly code: string;
  readonly legend: readonly ProbeLegend[];
}

function chunks<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += PER_CODE) out.push(list.slice(i, i + PER_CODE));
  return out;
}

/** The part as root, with a colored ShortStick on each parent socket. */
function parentProbes(type: string, sockets: readonly SocketId[]): ProbeCode[] {
  return chunks(sockets).map((chunk, k): ProbeCode => {
    const entries: Json[] = [
      [type, [], []],
      ...chunk.map((s, i): Json => [
        'ShortStick',
        [['2', s, 1]],
        { RGB: [...MARKER_COLORS[i].rgb] },
      ]),
    ];
    return {
      id: `${type}:parent:${k + 1}`,
      title: `${type} parent sockets, code ${k + 1}`,
      code: encode(entries),
      legend: chunk.map((s, i): ProbeLegend => ({
        socket: s,
        side: 'parent',
        color: MARKER_COLORS[i],
        note: `${MARKER_COLORS[i].name} stick`,
      })),
    };
  });
}

/**
 * Each child socket mounts a copy of the part on a grey cube, and the cube sits on a point of a
 * Base. Copies line up left to right in socket order, so the copy's position names its socket.
 */
function childProbes(type: string, sockets: readonly SocketId[]): ProbeCode[] {
  return chunks(sockets).map((chunk, k): ProbeCode => {
    const n = chunk.length;
    const attachments: Record<Uuid, Json> = {};
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 3 + 0;
      attachments[probeUuid(i)] = {
        partName: 'Base',
        cframe: [x, 0.25, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
      };
    }
    const entries: Json[] = [['Base', [], { EphemeralAttachments: attachments }]];
    chunk.forEach((socket, i) => {
      // The Base is entry 1, so cube i is entry 2 + 2i (1-based).
      entries.push(['Part', [['1', probeUuid(i), 1]], { RGB: [128, 128, 128] }]);
      entries.push([type, [[socket, '6', 2 + 2 * i]], []]);
    });
    return {
      id: `${type}:child:${k + 1}`,
      title: `${type} child sockets, code ${k + 1}`,
      code: encode(entries),
      legend: chunk.map((socket, i): ProbeLegend => ({
        socket,
        side: 'child',
        color: null,
        note: `copy ${i + 1} from the left: the face touching its grey cube`,
      })),
    };
  });
}

export function socketProbes(cat: Catalog, type: string): ProbeCode[] {
  const def = cat.parts[type];
  if (!def) throw new Error(`Unknown part type: ${type}`);
  return [...parentProbes(type, def.parentSockets), ...childProbes(type, def.childSockets)];
}

function calibration(id: string, title: string, entries: Json[], question: string): ProbeCode {
  return {
    id,
    title,
    code: encode(entries),
    legend: [{ socket: null, side: 'calibration', color: null, note: question }],
  };
}

/** A grey cube with a Gate-AND on its socket 6 (P1–P3). */
function gateOnCube(gateProps: Json): Json[] {
  return [
    ['Part', [], { RGB: [128, 128, 128] }],
    ['Gate-AND', [['4', '6', 1]], gateProps],
  ];
}

/** The six calibration probes (§10.4). They name no catalog data, so `_cat` is unused. */
export function calibrationProbes(_cat: Catalog): ProbeCode[] {
  const identity = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
  return [
    calibration(
      'P1',
      'P1 mating: gate on a cube',
      gateOnCube([]),
      "Which way do the gate's inputs face relative to the cube?",
    ),
    calibration(
      'P2',
      'P2 OrientationX 90',
      gateOnCube({ OrientationX: 90 }),
      'Describe how the gate is tilted.',
    ),
    calibration(
      'P3',
      'P3 OrientationY 90',
      gateOnCube({ OrientationY: 90 }),
      'Describe how the gate is turned.',
    ),
    calibration(
      'P4',
      'P4 gate on a Base point, 90° cframe',
      [
        [
          'Base',
          [],
          {
            EphemeralAttachments: {
              [probeUuid(1)]: {
                partName: 'Base',
                cframe: [1, 0.25, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0],
              },
            },
          },
        ],
        ['Gate-AND', [['4', probeUuid(1), 1]], []],
      ],
      'Is the gate turned 90° about the vertical?',
    ),
    calibration(
      'P5',
      'P5 Base with OrientationY 90',
      [
        [
          'Base',
          [],
          {
            OrientationY: 90,
            EphemeralAttachments: {
              [probeUuid(1)]: {
                partName: 'Base',
                cframe: [1.5, 0.25, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
              },
            },
          },
        ],
        ['Gate-AND', [['4', probeUuid(1), 1]], []],
      ],
      "Does the gate sit along the Base's +X or along Z?",
    ),
    calibration(
      'P6',
      'P6 Roof: Glass vs Roof points',
      [
        [
          'Roof',
          [],
          {
            EphemeralAttachments: {
              [probeUuid(1)]: { partName: 'Glass', cframe: identity },
              [probeUuid(2)]: { partName: 'Roof', cframe: identity },
            },
          },
        ],
        ['Part', [['1', probeUuid(1), 1]], { RGB: [220, 50, 47] }],
        ['Part', [['1', probeUuid(2), 1]], { RGB: [33, 90, 230] }],
      ],
      'Where do the red (Glass) and blue (Roof) cubes sit?',
    ),
  ];
}
