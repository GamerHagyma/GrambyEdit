// Keep desired frames until the single calibrated mounting/rounding pass.
import { Matrix4, Vector3 } from 'three';
import type { Catalog, Conventions, Vec3 } from '../catalog-types';
import { cfToMatrix4, roundCf } from '../cframe';
import { matingMatrix, pointFrameFor } from '../conventions';
import { mountSubDoc, tintColors } from '../generators/build';
import { childSocketMatrix, subPartMatrix } from '../pose';
import type { Doc } from '../types';
import { capSize, STAGGER, SURFACE_ELEMENT, type SurfaceColor } from './build';
import type { CurvedResult } from './curved-tiling';
import type { Tile } from './tiling';

export type AcceptedCurvedTiles = Extract<CurvedResult, { ok: true }>;
export interface CurvedBuildSpec {
  readonly hostType: string;
  readonly color: SurfaceColor;
  readonly colorEnabled?: boolean;
}
export interface SurfacePrecision {
  readonly posDecimals: number;
  readonly rotDecimals: number;
}
export interface CurvedCalibration {
  readonly sub: readonly number[];
  readonly socket: readonly number[];
  readonly center: Vec3;
  readonly conventions: Conventions;
  readonly precision: SurfacePrecision;
  readonly staggered: boolean;
}
type BuildResult =
  { ok: true; sub: Doc; count: number; rows: number } | { ok: false; error: string };
function mounting(spec: CurvedBuildSpec, cat: Catalog, opts: SurfacePrecision) {
  const def = Object.hasOwn(cat.parts, SURFACE_ELEMENT) ? cat.parts[SURFACE_ELEMENT] : undefined;
  const host = Object.hasOwn(cat.parts, spec.hostType) ? cat.parts[spec.hostType] : undefined;
  const cap = capSize(cat),
    socket = def?.defaultMount;
  if (
    !cap ||
    !def ||
    socket === null ||
    socket === undefined ||
    !Object.hasOwn(def.sockets, socket)
  )
    return { ok: false as const, error: 'This part library has no usable GasCap mount.' };
  if (!host)
    return { ok: false as const, error: 'The surface parent is missing from the part library.' };
  if (![opts.posDecimals, opts.rotDecimals].every((n) => Number.isInteger(n) && n >= 0 && n <= 12))
    return {
      ok: false as const,
      error: 'Surface export precision must be between 0 and 12 decimals.',
    };
  return {
    ok: true as const,
    def,
    cap,
    socket,
    host: { type: host.type, partName: host.mainPartName ?? host.type },
  };
}
function staggeredFrame(frame: Matrix4, tile: Tile, spec: CurvedBuildSpec): Matrix4 {
  const out = frame.clone();
  if (spec.colorEnabled !== false && spec.color.mode !== 'single') {
    const lift = STAGGER * ((tile.col % 2) + 2 * (tile.row % 2));
    out.setPosition(
      new Vector3()
        .setFromMatrixPosition(out)
        .addScaledVector(new Vector3().setFromMatrixColumn(out, 0), lift),
    );
  }
  return out;
}

/** Native center frame after the exact same calibration, stagger and rounding as Create. */
export function curvedPoseValidator(
  spec: CurvedBuildSpec,
  cat: Catalog,
  conv: Conventions,
  opts: SurfacePrecision,
):
  | { ok: true; calibration: CurvedCalibration; validate: (frame: Matrix4, tile: Tile) => Matrix4 }
  | { ok: false; error: string } {
  const info = mounting(spec, cat, opts);
  if (!info.ok) return info;
  const { cap } = info;
  const calibration: CurvedCalibration = {
    sub: [...subPartMatrix(cat, info.host.type, info.host.partName).m.elements],
    socket: [...childSocketMatrix(cat, SURFACE_ELEMENT, info.socket, 'point').m.elements],
    center: cap.center,
    conventions: conv,
    precision: opts,
    staggered: spec.colorEnabled !== false && spec.color.mode !== 'single',
  };
  return { ok: true, calibration, validate: poseValidatorFromCalibration(calibration) };
}

/** Reconstruct inside the worker from small plain data, without sending the catalog. */
export function poseValidatorFromCalibration(
  calibration: CurvedCalibration,
): (frame: Matrix4, tile: Tile) => Matrix4 {
  const { center, conventions: conv, precision: opts } = calibration;
  const toPart = new Matrix4().makeTranslation(-center[0], -center[1], -center[2]);
  const toCenter = toPart.clone().invert();
  const sub = new Matrix4().fromArray(calibration.sub);
  const socket = new Matrix4().fromArray(calibration.socket);
  const mate = matingMatrix(conv),
    unsocket = socket.clone().invert();
  return (frame, tile) => {
    const part = frame.clone();
    if (calibration.staggered) {
      const lift = STAGGER * ((tile.col % 2) + 2 * (tile.row % 2));
      part.setPosition(
        new Vector3()
          .setFromMatrixPosition(part)
          .addScaledVector(new Vector3().setFromMatrixColumn(part, 0), lift),
      );
    }
    part.multiply(toPart);
    const point = roundCf(
      pointFrameFor(new Matrix4(), sub, part, socket, {}, conv),
      opts.posDecimals,
      opts.rotDecimals,
    );
    return sub
      .clone()
      .multiply(cfToMatrix4(point))
      .multiply(mate)
      .multiply(unsocket)
      .multiply(toCenter);
  };
}

export function buildCurvedSubDoc(
  tiles: AcceptedCurvedTiles,
  spec: CurvedBuildSpec,
  cat: Catalog,
  conv: Conventions,
  opts: SurfacePrecision,
): BuildResult {
  const info = mounting(spec, cat, opts);
  if (!info.ok) return info;
  if (
    tiles.tiles.length > 20_000 ||
    tiles.tiles.some((t) => !t.frame.elements.every(Number.isFinite))
  )
    return { ok: false, error: 'Invalid or oversized curved surface result.' };
  const { cap, def } = info;
  const toPart = new Matrix4().makeTranslation(-cap.center[0], -cap.center[1], -cap.center[2]);
  const frames = tiles.tiles.map((t) => staggeredFrame(t.frame, t, spec).multiply(toPart));
  const tints =
    def.paintable && spec.colorEnabled !== false
      ? tintColors(spec.color, frames.length, (axis, i) => tiles.tiles[i][axis])
      : null;
  const sub = mountSubDoc(
    cat,
    conv,
    info.host,
    { type: SURFACE_ELEMENT, mount: info.socket },
    frames,
    tints,
    { pos: opts.posDecimals, rot: opts.rotDecimals },
  );
  return { ok: true, sub, count: frames.length, rows: tiles.rows };
}
