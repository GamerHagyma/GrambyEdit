// MINI: a 14-part slice of data/part_catalog.json for unit tests.
// Roles carry the spec §5.4 fixes. `Part` has the outward Workshop frames; every other socket gets
// its approx face frame. Bboxes, props, tooltips and corpus counts are the real catalog's.
import { approxSocketFrame } from '../../src/core/approx';
import type {
  Catalog,
  Category,
  PartDef,
  SocketDef,
  SocketRole,
  Vec3,
} from '../../src/core/catalog-types';
import type { CFrame12, SocketId } from '../../src/core/types';

/** A role, or a role plus the catalog's socket name. */
type S = SocketRole | readonly [SocketRole, string];

interface Spec {
  category: Category;
  corpusCount: number;
  child: Record<SocketId, S>;
  parent: Record<SocketId, S>;
  defaultMount: SocketId | null;
  pieces?: Record<SocketId, string>;
  props: string[];
  min: Vec3;
  max: Vec3;
  tooltip?: string;
  subParts?: PartDef['subParts'];
}

const PART_FRAMES: Record<SocketId, CFrame12> = {
  '1': [0, -0.5, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1],
  '2': [0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0],
  '3': [-0.5, 0, 0, 0, -1, 0, 0, 0, 1, -1, 0, 0],
  '4': [0, 0, -0.5, 1, 0, 0, 0, 0, 1, 0, -1, 0],
  '5': [0, 0, 0.5, -1, 0, 0, 0, 0, 1, 0, 1, 0],
  '6': [0, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
};

const CHASSIS_NAMES = [
  'Wheel_FL',
  'PassengerSteering',
  'Hood',
  'Wheel_FR',
  'Wheel_BL',
  'Wheel_BR',
  'Roof',
  'Headlight_R',
  'SideAux_B',
  'SteeringWheel',
  'BrakeLight_R',
  'Trunk',
  'DriverSeat',
  'PassengerSeat',
  'BrakeLight_L',
  'SideAux_A',
  'Headlight_L',
  'RearSeat_L',
  'TrunkAux_A',
  'GasCap',
  'TrunkAux_B',
  'RearBumper',
  'FrontBumper',
  'Engine',
  'RearSeat_R',
  'Gyro',
];

const ORIENT = ['OrientationX', 'OrientationY', 'OrientationZ'];
const sockets = (ids: number[], s: S) => Object.fromEntries(ids.map((i) => [String(i), s]));

const SPECS: Record<string, Spec> = {
  Part: {
    category: 'Structure',
    corpusCount: 2404,
    defaultMount: '1',
    child: { 1: 'mount' },
    parent: sockets([2, 3, 4, 5, 6], 'socket'),
    props: ['RGB', ...ORIENT],
    min: [-0.5, -0.500001, -0.5],
    max: [0.5, 0.500001, 0.5],
  },
  Connector: {
    category: 'Structure',
    corpusCount: 11484,
    defaultMount: '5',
    child: { 5: 'mount' },
    parent: sockets([1, 2, 3, 4, 6], 'socket'),
    props: ['RGB', 'OrientationX', 'OrientationZ', 'OrientationY'],
    min: [-0.199992, -0.231904, -0.200054],
    max: [0.200008, 0.168096, 0.199944],
  },
  Base: {
    category: 'Structure',
    corpusCount: 751,
    defaultMount: '3',
    child: { 3: ['mount', 'Arm'] },
    parent: {
      1: ['socket', 'Left'],
      2: ['socket', 'Right'],
      4: ['socket', 'Front'],
      5: ['socket', 'Top'],
      6: ['socket', 'Bottom'],
    },
    props: ['OrientationZ', 'OrientationX', 'OrientationY', 'RGB', 'EphemeralAttachments'],
    min: [-2, -0.250001, -2],
    max: [2, 0.25, 2],
  },
  'Gate-AND': {
    category: 'Logic',
    corpusCount: 201,
    defaultMount: '4',
    child: { 4: 'mount' },
    parent: { 1: ['output', 'Output'], 2: ['input', 'InputA'], 3: ['input', 'InputB'] },
    props: ORIENT,
    min: [-0.605471, -0.237339, -1.007692],
    max: [1.094529, 0.089931, 1.006508],
  },
  'Gate-NOT': {
    category: 'Logic',
    corpusCount: 36,
    defaultMount: '4',
    child: { 4: 'mount' },
    parent: { 1: ['output', 'Output'], 2: ['input', 'Input'] },
    props: ['OrientationY', 'OrientationX', 'OrientationZ'],
    min: [-0.394942, -0.267257, -0.627203],
    max: [0.405058, 0.082743, 1.572796],
  },
  Switch: {
    category: 'Logic',
    corpusCount: 198,
    defaultMount: '3',
    child: { 1: ['output', 'Output'], 3: 'mount' },
    parent: { 2: 'output' },
    props: ['RGB', 'OrientationX', 'OrientationY'],
    tooltip: 'Activates its output until switched off',
    min: [-0.30175, -0.128198, -1.1091],
    max: [0.29825, 0.214222, 0.4909],
  },
  Light: {
    category: 'Logic',
    corpusCount: 119,
    defaultMount: '1',
    child: { 1: 'input' },
    parent: {},
    props: ['Activated', 'RGB'],
    min: [-0.486513, -0.481313, -0.21394],
    max: [0.476136, 0.481317, 0.230457],
  },
  Splitter_2: {
    category: 'Logic',
    corpusCount: 274,
    defaultMount: '3',
    child: { 3: 'input', 5: 'output', 9: 'output' },
    parent: { 4: 'input', 6: 'output', 10: 'output' },
    pieces: { 3: 'A', 4: 'A', 5: 'B', 6: 'B', 9: 'C', 10: 'C' },
    props: ['RGB', 'OrientationX'],
    min: [-0.841723, -0.124272, -0.843071],
    max: [0.758286, 0.075728, 0.756929],
  },
  Wire: {
    category: 'Logic',
    corpusCount: 358,
    defaultMount: '3',
    child: { 1: 'conductor', 3: 'conductor' },
    parent: { 2: ['conductor', 'Left'], 4: ['conductor', 'Right'] },
    pieces: { 1: 'A', 2: 'A', 3: 'B', 4: 'B' },
    props: ['RGB'],
    min: [-0.300914, -0.100058, -0.802372],
    max: [0.299086, 0.049942, 0.797628],
  },
  Mag: {
    category: 'Weapons',
    corpusCount: 139,
    defaultMount: '1',
    child: { 1: null },
    parent: {},
    props: ['Bullets'],
    min: [-0.057615, -0.052484, -0.031445],
    max: [0.078692, 0.219136, 0.031456],
  },
  ShortStick: {
    category: 'Structure',
    corpusCount: 1546,
    defaultMount: '2',
    child: { 2: 'mount' },
    parent: { 1: ['socket', 'MountPoint'] },
    props: ['OrientationX', 'OrientationZ', 'OrientationY', 'RGB'],
    min: [-0.09, -0.090001, -0.500008],
    max: [0.09, 0.089999, 0.499992],
  },
  Anchor: {
    category: 'Structure',
    corpusCount: 73,
    defaultMount: '1',
    child: { 1: 'mount' },
    parent: {
      2: ['socket', 'TopLeft'],
      3: ['socket', 'TopRight'],
      4: ['socket', 'BottomLeft'],
      5: ['socket', 'BottomRight'],
    },
    props: ['Activated', 'RGB', 'OrientationY'],
    min: [-0.762426, -0.123193, -0.695054],
    max: [0.762375, 0.123187, 0.542445],
  },
  Chassis: {
    category: 'Vehicle',
    corpusCount: 40,
    defaultMount: null,
    child: {},
    parent: Object.fromEntries(
      Array.from({ length: 32 }, (_, i): [string, S] => [
        String(i + 1),
        i < CHASSIS_NAMES.length ? [null, CHASSIS_NAMES[i]] : null,
      ]),
    ),
    props: ['RGB', 'OrientationX', 'EphemeralAttachments', 'OrientationY', 'OrientationZ'],
    tooltip: 'The root of all cars',
    min: [-2.657146, -1.163555, -5.60471],
    max: [3.475355, 1.082636, 5.928589],
  },
  Roof: {
    category: 'Vehicle',
    corpusCount: 19,
    defaultMount: '1',
    child: { 1: null },
    parent: sockets([2, 3, 4, 5, 6, 7, 8, 9, 10], null),
    props: ['RGB', 'OrientationY', 'EphemeralAttachments', 'OrientationX', 'OrientationZ'],
    min: [-3.066217, -3.051253, -3.170818],
    max: [3.066284, 1.839506, 3.076485],
    subParts: { Glass: { cframe: [0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], approx: true } },
  },
};

const byNumber = (a: string, b: string) => Number(a) - Number(b);

function build(type: string, s: Spec, meshId: number): PartDef {
  const childSockets = Object.keys(s.child).sort(byNumber);
  const parentSockets = Object.keys(s.parent).sort(byNumber);
  const socketDefs: Record<SocketId, SocketDef> = {};
  for (const id of [...new Set([...childSockets, ...parentSockets])].sort(byNumber)) {
    const inChild = id in s.child;
    const side = inChild && id in s.parent ? 'both' : inChild ? 'child' : 'parent';
    const raw = inChild ? s.child[id] : s.parent[id];
    const [role, name] = raw !== null && typeof raw === 'object' ? raw : [raw, null];
    const workshop = type === 'Part';
    socketDefs[id] = {
      side,
      role,
      name,
      piece: s.pieces?.[id] ?? null,
      frame: workshop
        ? PART_FRAMES[id]
        : approxSocketFrame({ min: s.min, max: s.max, socket: id, side, name, parentSockets }),
      frameSource: workshop ? 'workshop' : 'approx',
    };
  }
  return {
    type,
    category: s.category,
    tooltip: s.tooltip ?? null,
    paintable: s.props.includes('RGB'),
    corpusCount: s.corpusCount,
    sockets: socketDefs,
    childSockets,
    parentSockets,
    defaultMount: s.defaultMount,
    pieces: s.pieces ?? null,
    mainPartName: type,
    subParts: s.subParts ?? {},
    props: s.props,
    mesh: { id: meshId, min: s.min, max: s.max },
  };
}

export const MINI: Catalog = {
  version: 'mini',
  parts: Object.fromEntries(Object.entries(SPECS).map(([type, s], i) => [type, build(type, s, i)])),
  pairs: {},
  propMeta: {
    RGB: { widget: 'rgb', label: 'Color' },
    OrientationX: { widget: 'orientation', label: 'Orientation X', step: 45 },
    OrientationY: { widget: 'orientation', label: 'Orientation Y', step: 45 },
    OrientationZ: { widget: 'orientation', label: 'Orientation Z', step: 45 },
    Bullets: { widget: 'int', label: 'Bullets' },
    Activated: { widget: 'bool', label: 'Activated' },
  },
  conventions: {
    mating: 'rx180',
    orientationOrder: 'ZYX',
    orientationOnPoints: true,
    orientationPivot: 'part',
    orientationSigns: [-1, -1, -1],
  },
};
