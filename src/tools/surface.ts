// The Surface tool (spec §12.9): the Surfaces tab's corners in the view. A click on a corner's dot chooses
// it, and Shift+click adds or takes out more; the gizmo (or G) moves the chosen corners together in the
// parent's axes (Ctrl snaps), and the preview follows live. Esc lets them go.
import { Matrix4, Quaternion, Vector3, type Vector2 } from 'three';
import type { Vec3 } from '../core/catalog-types';
import { posesSig } from '../state/derived';
import {
  selectCorner,
  setCorners,
  surfaceCreatedSig,
  surfaceHostSig,
  surfaceSig,
} from '../state/surfaces';
import { getViewport } from '../viewport/context';
import type { GizmoHandlers } from '../viewport/gizmo';
import type { Tool, ToolPointer } from './manager';
import { snapValue, type TransformDelta } from './transform';

/** A corner's dot within this many CSS pixels of the cursor is under it. */
const PICK_PX = 12;
/** Movement past this many pixels turns a click into a drag (the camera's). */
const DRAG_PX = 4;

/** The parent's world matrix while it is in the build. */
function hostWorld(): Matrix4 | null {
  const host = surfaceHostSig.value;
  return (host && posesSig.value.world.get(host.id)) ?? null;
}

/** The corners in world space, while the surface has a parent. */
export function cornerWorlds(): Vector3[] | null {
  // Hidden once Create made the caps, until Undo takes them out again.
  if (surfaceCreatedSig.value !== null) return null;
  const world = hostWorld();
  return world && surfaceSig.value.corners.map((c) => new Vector3(...c).applyMatrix4(world));
}

/** The corner whose dot is nearest the cursor, within `PICK_PX`. */
export function cornerAt(ndc: Vector2): number | null {
  const vp = getViewport();
  const corners = cornerWorlds();
  if (!vp || !corners) return null;
  const r = vp.canvas.getBoundingClientRect();
  let best: number | null = null;
  let bestPx = PICK_PX;
  corners.forEach((c, i) => {
    const v = c.project(vp.rig.camera);
    if (v.z > 1) return;
    const px = Math.hypot(((v.x - ndc.x) / 2) * r.width, ((v.y - ndc.y) / 2) * r.height);
    if (px < bestPx) [bestPx, best] = [px, i];
  });
  return best;
}

/** Where the gizmo sits: amid the chosen corners, turned to the parent's axes. */
export function surfaceGizmoPlacement(): { position: Vector3; quaternion: Quaternion } | null {
  const { selected } = surfaceSig.value;
  const world = hostWorld();
  const corners = cornerWorlds();
  if (selected.length === 0 || !world || !corners) return null;
  const quaternion = new Quaternion();
  world.decompose(new Vector3(), quaternion, new Vector3());
  const position = selected
    .reduce((sum, i) => sum.add(corners[i]), new Vector3())
    .divideScalar(selected.length);
  return { position, quaternion };
}

interface CornerDrag {
  readonly corners: readonly number[];
  readonly from: readonly Vec3[];
  readonly world: Matrix4;
}

let drag: CornerDrag | null = null;

/**
 * The corners moved by a world-space gizmo offset, back in the parent's part space. With a grid step,
 * each lands on its own world grid point.
 */
function movedBy(d: CornerDrag, delta: TransformDelta): [number, Vec3][] {
  if (delta.kind !== 'move') return d.corners.map((i, k) => [i, d.from[k]]);
  const back = d.world.clone().invert();
  const tidy = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
  return d.corners.map((i, k) => {
    const p = new Vector3(...d.from[k]).applyMatrix4(d.world).add(delta.offset);
    if (delta.grid)
      p.set(snapValue(p.x, delta.grid), snapValue(p.y, delta.grid), snapValue(p.z, delta.grid));
    p.applyMatrix4(back);
    return [i, [tidy(p.x), tidy(p.y), tidy(p.z)]];
  });
}

/** What the viewport gizmo (and G) call while they move the chosen corners. */
export const surfaceGizmoHandlers: GizmoHandlers = {
  start() {
    const { selected, corners } = surfaceSig.value;
    const world = hostWorld();
    drag =
      selected.length === 0 || !world
        ? null
        : { corners: selected, from: selected.map((i) => corners[i]), world };
  },
  change(delta) {
    if (drag) setCorners(movedBy(drag, delta));
  },
  end(delta) {
    const d = drag;
    drag = null;
    if (d) setCorners(movedBy(d, delta));
  },
  cancel() {
    const d = drag;
    drag = null;
    if (d) setCorners(d.corners.map((i, k) => [i, d.from[k]]));
  },
};

export function createSurfaceTool(): Tool {
  let press: { x: number; y: number } | null = null;
  let gizmoPress = false;
  return {
    id: 'surface',
    activate() {},
    deactivate() {
      press = null;
      gizmoPress = false;
    },
    onPointer(e: ToolPointer) {
      if (e.button !== 0) return;
      if (e.kind === 'down') {
        if (getViewport()?.gizmo?.busy()) gizmoPress = true;
        else press = { x: e.x, y: e.y };
        return;
      }
      if (gizmoPress) {
        if (e.kind === 'up') gizmoPress = false;
        return;
      }
      if (e.kind !== 'up' || !press) return;
      const moved = Math.hypot(e.x - press.x, e.y - press.y) > DRAG_PX;
      press = null;
      if (!moved) selectCorner(cornerAt(e.ndc), e.shift);
    },
    onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || surfaceSig.value.selected.length === 0) return false;
      selectCorner(null);
      return true;
    },
  };
}
