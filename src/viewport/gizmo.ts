// The transform gizmo (spec §12.4): three.js TransformControls on a proxy at the selection's pivot.
// A drag reports world-space deltas; the tool previews them and commits once, when the drag ends.
import { MathUtils, Object3D, Quaternion, Vector3, type Camera } from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { gridOffset, snapValue, type Space, type TransformDelta } from '../tools/transform';

export interface GizmoHandlers {
  start(): void;
  change(delta: TransformDelta): void;
  end(delta: TransformDelta): void;
  cancel(): void;
}

export interface GizmoOptions {
  readonly mode: 'translate' | 'rotate';
  readonly space: Space;
  /** Snap steps, used while snapping is on: studs for moves, degrees for rotations. */
  readonly steps: { readonly move: number; readonly rotate: number };
  /** Rotate each part about its own origin instead of about the pivot. */
  readonly individual: boolean;
  /** Snapped moves land on the world grid, on every axis, instead of going whole steps. */
  readonly grid: boolean;
}

export class TransformGizmo {
  private readonly controls: TransformControls;
  private readonly proxy = new Object3D();
  private readonly startPosition = new Vector3();
  private readonly startQuaternion = new Quaternion();
  private dragging = false;
  private moveSnap: number | null = null;
  private steps = { move: 0.25, rotate: 15 };
  private snapping = false;
  private individual = false;
  private grid = false;
  handlers: GizmoHandlers | null = null;

  constructor(
    camera: Camera,
    dom: HTMLElement,
    private readonly parent: Object3D,
    request: () => void,
  ) {
    this.controls = new TransformControls(camera, dom);
    this.controls.setSize(0.8);
    this.controls.addEventListener('change', request);
    this.controls.addEventListener('mouseDown', () => {
      this.dragging = true;
      this.startPosition.copy(this.proxy.position);
      this.startQuaternion.copy(this.proxy.quaternion);
      this.handlers?.start();
    });
    this.controls.addEventListener('objectChange', () => {
      if (this.dragging) this.handlers?.change(this.delta());
    });
    this.controls.addEventListener('mouseUp', () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.handlers?.end(this.delta());
    });
    parent.add(this.proxy, this.controls.getHelper());
  }

  /** Shows the gizmo at a pose, or hides it. Ignored mid-drag, so a drag is never re-seated. */
  place(at: { position: Vector3; quaternion: Quaternion } | null): void {
    if (this.dragging) return;
    if (!at) {
      this.controls.detach();
      return;
    }
    this.proxy.position.copy(at.position);
    this.proxy.quaternion.copy(at.quaternion);
    this.proxy.updateMatrixWorld();
    if (this.controls.object !== this.proxy) this.controls.attach(this.proxy);
  }

  configure(o: GizmoOptions): void {
    this.controls.setMode(o.mode);
    this.controls.setSpace(o.space);
    // TransformControls snaps absolute world positions; moves snap their offset here instead.
    this.controls.setTranslationSnap(null);
    this.steps = o.steps;
    this.individual = o.individual;
    this.grid = o.grid;
    this.setSnapping(this.snapping);
  }

  /** Snapping is on while Ctrl is held; it can change in the middle of a drag. */
  setSnapping(on: boolean): void {
    this.snapping = on;
    this.controls.setRotationSnap(on ? MathUtils.degToRad(this.steps.rotate) : null);
    this.moveSnap = on ? this.steps.move : null;
  }

  setCamera(camera: Camera): void {
    this.controls.camera = camera;
  }

  setEnabled(on: boolean): void {
    this.controls.enabled = on;
  }

  /** True while the pointer is over or dragging a handle, so the press is the gizmo's, not the tool's. */
  busy(): boolean {
    return (
      this.controls.object !== undefined && (this.controls.dragging || this.controls.axis !== null)
    );
  }

  /** Esc mid-drag: puts the gizmo back, reports a cancel, and ignores the rest of the drag. */
  cancel(): boolean {
    if (!this.dragging) return false;
    this.dragging = false;
    this.controls.detach();
    this.proxy.position.copy(this.startPosition);
    this.proxy.quaternion.copy(this.startQuaternion);
    this.proxy.updateMatrixWorld();
    this.controls.attach(this.proxy);
    this.handlers?.cancel();
    return true;
  }

  dispose(): void {
    this.controls.detach();
    this.controls.dispose();
    this.parent.remove(this.proxy, this.controls.getHelper());
  }

  private delta(): TransformDelta {
    if (this.controls.mode === 'rotate') {
      return {
        kind: 'rotate',
        rotation: this.proxy.quaternion.clone().multiply(this.startQuaternion.clone().invert()),
        pivot: this.individual ? 'individual' : this.startPosition.clone(),
      };
    }
    let offset = this.proxy.position.clone().sub(this.startPosition);
    const step = this.moveSnap;
    const local = this.controls.space === 'local';
    if (step !== null && this.grid) {
      // Onto the world grid on every axis, whichever handle is dragged.
      offset = gridOffset(offset, this.startPosition, step);
      this.proxy.position.copy(this.startPosition).add(offset);
      return { kind: 'move', offset, grid: step };
    } else if (step !== null) {
      // Snapped along the gizmo's own axes: world axes, or the start orientation in local space.
      const back = this.startQuaternion.clone().invert();
      if (local) offset.applyQuaternion(back);
      offset.set(snapValue(offset.x, step), snapValue(offset.y, step), snapValue(offset.z, step));
      if (local) offset.applyQuaternion(this.startQuaternion);
      this.proxy.position.copy(this.startPosition).add(offset);
    }
    return { kind: 'move', offset };
  }
}
