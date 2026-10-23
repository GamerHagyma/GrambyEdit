// The camera rig shared by both navigation schemes: a turntable around `target` (spec §11.3).
import {
  MathUtils,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
} from 'three';

export type ViewAxis = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';

const PITCH_LIMIT = Math.PI / 2 - 1e-4;
/** Ortho cameras sit this far behind the target so nothing in front of it is clipped. */
const ORTHO_BACKOFF = 10_000;

const VIEWS: Record<ViewAxis, [yaw: number, pitch: number]> = {
  front: [0, 0],
  back: [Math.PI, 0],
  right: [Math.PI / 2, 0],
  left: [-Math.PI / 2, 0],
  top: [0, -PITCH_LIMIT],
  bottom: [0, PITCH_LIMIT],
};

export class CameraRig {
  readonly persp = new PerspectiveCamera(50, 1, 0.05, 20_000);
  readonly ortho = new OrthographicCamera(-1, 1, 1, -1, 0.05, 2 * ORTHO_BACKOFF + 10_000);
  readonly target = new Vector3(0, 0, 0);
  isOrtho = false;
  distance = 14;
  /** Around +Y; 0 looks from +Z (the front). */
  yaw = Math.PI / 5;
  /** Negative looks down. */
  pitch = -0.45;
  width = 1;
  height = 1;

  constructor() {
    this.update();
  }

  get camera(): Camera {
    return this.isOrtho ? this.ortho : this.persp;
  }

  /** Unit vector from the target toward the camera. */
  back(out = new Vector3()): Vector3 {
    const c = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * c, -Math.sin(this.pitch), Math.cos(this.yaw) * c);
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.update();
  }

  /** World units per CSS pixel at the target's depth. */
  unitsPerPixel(): number {
    return (2 * this.distance * Math.tan(MathUtils.degToRad(this.persp.fov / 2))) / this.height;
  }

  update(): void {
    this.pitch = MathUtils.clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    const back = this.back();
    this.persp.aspect = this.width / this.height;
    this.persp.position.copy(this.target).addScaledVector(back, this.distance);
    this.persp.lookAt(this.target);
    this.persp.updateProjectionMatrix();
    const h = this.distance * Math.tan(MathUtils.degToRad(this.persp.fov / 2));
    const a = this.width / this.height;
    Object.assign(this.ortho, { left: -h * a, right: h * a, top: h, bottom: -h });
    this.ortho.position.copy(this.target).addScaledVector(back, ORTHO_BACKOFF);
    this.ortho.quaternion.copy(this.persp.quaternion);
    this.ortho.updateProjectionMatrix();
    this.persp.updateMatrixWorld();
    this.ortho.updateMatrixWorld();
  }

  /** Turntable orbit around the target, in radians. */
  orbit(dYaw: number, dPitch: number): void {
    this.yaw -= dYaw;
    this.pitch -= dPitch;
    this.update();
  }

  /** Orbit around `pivot` instead of the target: both the target and the camera turn about it. */
  orbitAround(pivot: Vector3, dYaw: number, dPitch: number): void {
    const eye = this.persp.position.clone();
    const yaw0 = this.yaw;
    const pitch0 = this.pitch;
    this.orbit(dYaw, dPitch);
    // Rotate the eye about the pivot by the same turn, then re-aim the target from it.
    const rel = eye.sub(pivot);
    rel.applyAxisAngle(new Vector3(0, 1, 0), this.yaw - yaw0);
    // A pitch change turns the view direction by +Δpitch about the camera's right axis.
    const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    rel.applyAxisAngle(right, this.pitch - pitch0);
    const newEye = pivot.clone().add(rel);
    this.target.copy(newEye).addScaledVector(this.back(), -this.distance);
    this.update();
  }

  /** Mouse-look: turn the view while the camera stays put. */
  look(dYaw: number, dPitch: number): void {
    const eye = this.persp.position.clone();
    this.yaw -= dYaw;
    this.pitch -= dPitch;
    this.pitch = MathUtils.clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    this.target.copy(eye).addScaledVector(this.back(), -this.distance);
    this.update();
  }

  /** Moves target and camera together by screen pixels. */
  pan(dxPx: number, dyPx: number): void {
    const u = this.unitsPerPixel();
    const right = new Vector3().setFromMatrixColumn(this.persp.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(this.persp.matrixWorld, 1);
    this.target.addScaledVector(right, -dxPx * u).addScaledVector(up, dyPx * u);
    this.update();
  }

  /** Moves the camera and target in camera space (x right, y world up, z forward), in studs. */
  fly(dx: number, dy: number, dz: number): void {
    const right = new Vector3().setFromMatrixColumn(this.persp.matrixWorld, 0);
    const forward = this.back().negate();
    this.target.addScaledVector(right, dx).addScaledVector(forward, dz);
    this.target.y += dy;
    this.update();
  }

  /** Where the ray through `ndc` meets the plane through the target facing the camera. */
  pointAtTargetDepth(ndc: Vector2): Vector3 {
    const ray = new Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new Plane().setFromNormalAndCoplanarPoint(this.back(), this.target);
    return ray.ray.intersectPlane(plane, new Vector3()) ?? this.target.clone();
  }

  /** Zoom by `factor` (< 1 zooms in) keeping the point under the cursor fixed on screen. */
  zoomAt(factor: number, ndc: Vector2): void {
    const p = this.pointAtTargetDepth(ndc);
    const next = MathUtils.clamp(this.distance * factor, 0.2, 20_000);
    const f = next / this.distance;
    this.target.lerp(p, 1 - f);
    this.distance = next;
    this.update();
  }

  setView(axis: ViewAxis): void {
    [this.yaw, this.pitch] = VIEWS[axis];
    this.update();
  }

  /** Puts the camera at `position` looking at `target` (a saved view). */
  lookFrom(position: readonly number[], target: readonly number[]): void {
    this.target.set(target[0], target[1], target[2]);
    const back = new Vector3(position[0], position[1], position[2]).sub(this.target);
    this.distance = Math.max(0.2, back.length());
    back.normalize();
    this.pitch = -Math.asin(MathUtils.clamp(back.y, -1, 1));
    this.yaw = Math.atan2(back.x, back.z);
    this.update();
  }

  /** Looks at the target from the opposite side (Blender's numpad 9). */
  flipView(): void {
    this.yaw += Math.PI;
    this.pitch = -this.pitch;
    this.update();
  }

  /** Fits a sphere in view. */
  frame(center: Vector3, radius: number): void {
    this.target.copy(center);
    const half = MathUtils.degToRad(this.persp.fov / 2);
    this.distance = Math.max(1, (Math.max(radius, 0.5) / Math.sin(half)) * 1.15);
    this.update();
  }
}
