// Offline comparison only. Native expectations always come from the capture, never the pose engine.
// Run: node --import tsx scripts/compare-rotation-probe.ts [probe-directory] [capture-file]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { buildAssets } from './build-assets';
import { cfToMatrix4, isCFrame12, matrix4ToCf } from '../src/core/cframe';
import { childWorldViaPoint, childWorldViaSocket } from '../src/core/conventions';
import { bodyPivot, childSocketMatrix, ignoresOrientation, socketMatrix } from '../src/core/pose';
import type { CFrame12, Json } from '../src/core/types';

interface Sample {
  id: number;
  type: string;
  name: string;
  position: number[];
  host: number;
  hostType: string;
  parentSocket?: string;
  point: CFrame12;
  props: Record<string, Json>;
}
interface Manifest {
  format: string;
  codeSHA256: string;
  root: { type: string; primaryPart: string };
  samples: Sample[];
}
interface NativeModel {
  name: string;
  primaryPart: string;
  cframe: CFrame12;
}
interface Capture {
  format: string;
  probeSHA256: string;
  capturedAt: string;
  models: NativeModel[];
}

const directory = resolve(process.argv[2] ?? '.claude/rotation-probe');
const capturePath = resolve(process.argv[3] ?? join(directory, 'live-native.json'));
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as Manifest;
const capture = JSON.parse(readFileSync(capturePath, 'utf8')) as Capture;
const code = readFileSync(join(directory, 'rotation-probe.txt'), 'utf8');
if (
  manifest.format !== 'grambyedit-rotation-probe-v1' ||
  capture.format !== 'readonly-live-rotation-probe-geometry' ||
  !Array.isArray(manifest.samples) ||
  !Array.isArray(capture.models)
)
  throw new Error('Unsupported probe/capture format.');
if (
  createHash('sha256').update(code).digest('hex') !== manifest.codeSHA256 ||
  capture.probeSHA256 !== manifest.codeSHA256
)
  throw new Error('Capture, manifest and share code do not describe the same probe.');
const { catalog: cat } = await buildAssets({ root: '.', outDir: null });
const validFrame = (frame: CFrame12) =>
  isCFrame12(frame) && Math.abs(cfToMatrix4(frame).determinant() - 1) < 0.001;
if (capture.models.some((m) => typeof m.name !== 'string' || !validFrame(m.cframe)))
  throw new Error('Invalid native rigid frame.');
if (
  manifest.samples.some(
    (s) =>
      !Number.isInteger(s.id) ||
      !Object.hasOwn(cat.parts, s.type) ||
      !Object.hasOwn(cat.parts, s.hostType) ||
      !Array.isArray(s.position) ||
      s.position.length !== 3 ||
      !s.position.every(Number.isFinite) ||
      !validFrame(s.point) ||
      !s.props ||
      typeof s.props !== 'object',
  )
)
  throw new Error('Invalid probe sample inputs.');
const roots = capture.models.filter(
  (m) => m.name === manifest.root.type && m.primaryPart === manifest.root.primaryPart,
);
if (roots.length !== 1)
  throw new Error(`Expected one probe root, found ${roots.length}; do not guess between builds.`);
const root = cfToMatrix4(roots[0].cframe),
  inverse = root.clone().invert();
const models = capture.models.map((m, index) => ({
  ...m,
  index,
  world: cfToMatrix4(m.cframe),
  local: inverse.clone().multiply(cfToMatrix4(m.cframe)),
}));
const position = (m: Matrix4) => new Vector3().setFromMatrixPosition(m);
function unique(type: string, wanted: Vector3, local: boolean, radius: number) {
  const matches = models.filter(
    (m) => m.name === type && position(local ? m.local : m.world).distanceTo(wanted) < radius,
  );
  if (matches.length !== 1)
    throw new Error(
      `Expected one ${type} at ${wanted.toArray().join(',')}, found ${matches.length}. No observation assigned.`,
    );
  return matches[0];
}
const used = new Set<number>();
const results = manifest.samples.map((s) => {
  const host =
    s.host === 1
      ? models.find((m) => m.name === manifest.root.type)!
      : unique(s.hostType, new Vector3(...s.position), true, 4);
  const self = cat.parts[s.type].defaultMount;
  if (!self) throw new Error(`${s.type} has no captured mount.`);
  const frame = childSocketMatrix(
    cat,
    s.type,
    self,
    s.parentSocket ? { type: s.hostType, socket: s.parentSocket } : 'point',
  ).m;
  const props =
    s.parentSocket &&
    ignoresOrientation(cat, s.hostType, s.parentSocket, { type: s.type, socket: self })
      ? {}
      : s.props;
  const predicted = s.parentSocket
    ? childWorldViaSocket(
        host.world,
        socketMatrix(cat, s.hostType, s.parentSocket, { Rotation: 0 }).m,
        frame,
        props,
        cat.conventions,
        bodyPivot(cat, s.type, self),
      )
    : childWorldViaPoint(
        root,
        new Matrix4(),
        cfToMatrix4(s.point),
        frame,
        props,
        cat.conventions,
        bodyPivot(cat, s.type, self),
      );
  // Physical door panels extend past their grid cell. Only their predicted socket centre
  // is used to disambiguate assignment; the captured rotation is still the independent evidence.
  const child = s.parentSocket
    ? unique(s.type, position(predicted), false, 0.3)
    : unique(s.type, new Vector3(...s.position), true, 4);
  if (used.has(child.index))
    throw new Error('A native model was assigned to more than one sample.');
  used.add(child.index);
  const distance = position(predicted).distanceTo(position(child.world));
  const angle =
    (new Quaternion()
      .setFromRotationMatrix(predicted)
      .normalize()
      .angleTo(new Quaternion().setFromRotationMatrix(child.world).normalize()) *
      180) /
    Math.PI;
  const freeAxis = !!s.parentSocket && ['Bearing', 'Servo_Physics'].includes(s.hostType);
  const axisAngle =
    (new Vector3()
      .setFromMatrixColumn(predicted, 1)
      .normalize()
      .angleTo(new Vector3().setFromMatrixColumn(child.world, 1).normalize()) *
      180) /
    Math.PI;
  return {
    sourceEntry: s.id,
    type: s.type,
    case: s.name,
    freeAxis,
    positionError: distance,
    rotationErrorDegrees: angle,
    axisErrorDegrees: axisAngle,
    passed: distance < 0.002 && (freeAxis ? axisAngle : angle) < 0.1,
    hostNative: host.cframe,
    nativeWorld: child.cframe,
    predictedWorld: matrix4ToCf(predicted),
    nativeRelative: matrix4ToCf(host.world.clone().invert().multiply(child.world)),
  };
});
const summary = {
  samples: results.length,
  fixedPassed: results.filter((r) => !r.freeAxis && r.passed).length,
  freeAxisPassed: results.filter((r) => r.freeAxis && r.passed).length,
  failed: results.filter((r) => !r.passed).length,
  maxPositionError: Math.max(...results.map((r) => r.positionError)),
};
writeFileSync(
  join(directory, 'comparison-current.json'),
  JSON.stringify(
    { capturedAt: capture.capturedAt, codeSHA256: manifest.codeSHA256, summary, results },
    null,
    2,
  ),
);
console.log(JSON.stringify(summary));
if (summary.failed) process.exitCode = 1;
