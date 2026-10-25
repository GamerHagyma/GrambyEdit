// A GasCap surface as a sub-doc (spec §13.11, D22): `tileQuad`'s tiles become GasCaps on new points of
// the parent part, built like a generated shape, so every cap lands where the preview showed it.
import { Matrix4, Vector3 } from 'three';
import type { Catalog, Conventions, Vec3 } from '../catalog-types';
import { mountSubDoc, tintColors, type Tint } from '../generators/build';
import type { Doc } from '../types';
import { tileQuad, type Corners } from './tiling';

export type SurfaceColor = Tint<'u' | 'v'>;

/** The part surfaces are made of. */
export const SURFACE_ELEMENT = 'GasCap';
/** Neighbouring caps of different colours sit this far apart along the normal, so overlaps never flicker. */
export const STAGGER = 0.005;

export interface CapSize {
  /** Along the cap's Z (the surface's U). */
  readonly width: number;
  /** Along the cap's Y. */
  readonly height: number;
  /** Along the cap's X, out of the surface. */
  readonly thickness: number;
  /** The mesh's bounding-box centre in part space. */
  readonly center: Vec3;
}

/** A GasCap's size from its mesh, which is thin along X; null when the library has no GasCap. */
export function capSize(cat: Catalog): CapSize | null {
  const box = Object.hasOwn(cat.parts, SURFACE_ELEMENT) ? cat.parts[SURFACE_ELEMENT].mesh : null;
  if (!box) return null;
  const [min, max] = [box.min, box.max];
  return {
    width: max[2] - min[2],
    height: max[1] - min[1],
    thickness: max[0] - min[0],
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  };
}

/**
 * A square two caps wide on a face. `frame` is a new point's frame there (+Y out of the face); the square
 * is lifted half a cap off the face so the caps rest on it, and its U × V points out of the face.
 */
export function defaultCorners(frame: Matrix4, cap: Pick<CapSize, 'width' | 'thickness'>): Corners {
  const x = new Vector3().setFromMatrixColumn(frame, 0);
  const y = new Vector3().setFromMatrixColumn(frame, 1);
  const z = new Vector3().setFromMatrixColumn(frame, 2);
  const c = new Vector3().setFromMatrixPosition(frame).addScaledVector(y, cap.thickness / 2);
  const at = (sx: number, sz: number): Vec3 => {
    const p = c
      .clone()
      .addScaledVector(x, sx * cap.width)
      .addScaledVector(z, sz * cap.width);
    return [p.x, p.y, p.z];
  };
  return [at(-1, 1), at(1, 1), at(1, -1), at(-1, -1)];
}

export interface SurfaceSpec {
  readonly hostType: string;
  /** In the host's part space. */
  readonly corners: Corners;
  readonly color: SurfaceColor;
  readonly colorEnabled?: boolean;
}

/**
 * The surface's GasCaps on a host of `spec.hostType`, as a sub-doc to insert onto the parent part. With
 * more than one colour, caps are lifted 0–3 × `STAGGER` by row and place in the row (odd or even), so
 * no two overlapping caps share a plane.
 */
export function buildSurfaceSubDoc(
  spec: SurfaceSpec,
  cat: Catalog,
  conv: Conventions,
  opts: {
    readonly posDecimals: number;
    readonly rotDecimals: number;
    readonly maxElements: number;
  },
): { ok: true; sub: Doc; count: number; rows: number } | { ok: false; error: string } {
  const def = Object.hasOwn(cat.parts, SURFACE_ELEMENT) ? cat.parts[SURFACE_ELEMENT] : undefined;
  const cap = capSize(cat);
  const mount = def?.defaultMount ?? null;
  if (!def || !cap || mount === null) {
    return { ok: false, error: 'This part library has no GasCap.' };
  }
  const tiling = tileQuad(spec.corners, cap, opts.maxElements);
  if (!tiling.ok) return tiling;
  const { tiles } = tiling;
  const staggered = spec.colorEnabled !== false && spec.color.mode !== 'single';
  const toCenter = new Matrix4().makeTranslation(-cap.center[0], -cap.center[1], -cap.center[2]);
  const out = new Vector3();
  const frames = tiles.map(({ col, row, frame }) => {
    const f = frame.clone();
    const lift = staggered ? STAGGER * ((col % 2) + 2 * (row % 2)) : 0;
    if (lift > 0) {
      f.setPosition(
        out.setFromMatrixPosition(f).addScaledVector(new Vector3().setFromMatrixColumn(f, 0), lift),
      );
    }
    return f.multiply(toCenter);
  });
  const tints =
    def.paintable && spec.colorEnabled !== false
      ? tintColors(spec.color, tiles.length, (axis, i) => tiles[i][axis])
      : null;
  const hostDef = Object.hasOwn(cat.parts, spec.hostType) ? cat.parts[spec.hostType] : undefined;
  const sub = mountSubDoc(
    cat,
    conv,
    { type: spec.hostType, partName: hostDef?.mainPartName ?? spec.hostType },
    { type: SURFACE_ELEMENT, mount },
    frames,
    tints,
    { pos: opts.posDecimals, rot: opts.rotDecimals },
  );
  return { ok: true, sub, count: tiles.length, rows: tiling.rows };
}
