// Blender-style navigation (spec §11.3): MMB orbit, Shift+MMB pan, wheel zoom to cursor, numpad views.
import { Vector2, type Vector3 } from 'three';
import type { Settings } from '../../state/settings';
import type { CameraRig } from './rig';

export interface NavHost {
  rig: CameraRig;
  dom: HTMLElement;
  settings(): Settings;
  request(): void;
  ndc(e: { clientX: number; clientY: number }): Vector2;
  /** The orbit pivot under the cursor (a part surface), if any. */
  pivotAt(ndc: Vector2): Vector3 | null;
  frameSelection(): void;
  frameAll(): void;
}

const ORBIT_SPEED = 0.008;

export class BlenderControls {
  constructor(private readonly host: NavHost) {}

  /** Starts a camera drag when the button belongs to navigation; returns false for tool input. */
  onPointerDown(e: PointerEvent): boolean {
    const s = this.host.settings();
    const emulated = s.emulate3Button && e.button === 0 && e.altKey;
    if (e.button !== 1 && !emulated) return false;
    e.preventDefault();
    const { rig, dom } = this.host;
    const pan = e.shiftKey;
    const pivot = pan ? null : this.host.pivotAt(this.host.ndc(e));
    const invert = s.invertY ? -1 : 1;
    let x = e.clientX;
    let y = e.clientY;
    dom.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x;
      const dy = ev.clientY - y;
      x = ev.clientX;
      y = ev.clientY;
      if (pan) rig.pan(dx, dy);
      else {
        const k = ORBIT_SPEED * s.orbitSensitivity;
        if (pivot) rig.orbitAround(pivot, dx * k, dy * k * invert);
        else rig.orbit(dx * k, dy * k * invert);
      }
      this.host.request();
    };
    const up = () => {
      dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up);
      dom.removeEventListener('pointercancel', up);
    };
    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    return true;
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const notches = Math.max(-5, Math.min(5, e.deltaY / (e.deltaMode === 1 ? 3 : 100)));
    this.host.rig.zoomAt(Math.pow(1.15, notches), this.host.ndc(e));
    this.host.request();
  }

  /** Blender's view keys (numpad, Home) are commands in the keymap; nothing is handled here. */
  onKeyDown(_e: KeyboardEvent): boolean {
    return false;
  }

  dispose(): void {}
}
