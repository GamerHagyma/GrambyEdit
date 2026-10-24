// Roblox Studio-style navigation (spec §11.3): hold RMB to look, WASD/QE to fly, MMB pan, wheel dolly, F focus.
import type { NavHost } from './blender';

const LOOK_SPEED = 0.005;
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);
/** Movement past this many pixels turns a right-click into a look drag, not a context menu. */
const CLICK_SLOP = 4;

export class StudioControls {
  private readonly held = new Set<string>();
  private slow = false;
  private frame = 0;
  private last = 0;
  private looked = false;

  constructor(private readonly host: NavHost) {}

  /** Whether the latest right press ever became a look drag, even if it returned to its start. */
  get rightDragged(): boolean {
    return this.looked;
  }

  onPointerDown(e: PointerEvent): boolean {
    if (e.button !== 2 && e.button !== 1) return false;
    const { rig, dom } = this.host;
    const s = this.host.settings();
    const look = e.button === 2;
    if (look) this.looked = false;
    const invert = s.invertY ? -1 : 1;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let x = x0;
    let y = y0;
    let dragged = false;
    dom.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x;
      const dy = ev.clientY - y;
      x = ev.clientX;
      y = ev.clientY;
      if (!dragged && Math.hypot(x - x0, y - y0) < CLICK_SLOP) return;
      dragged = true;
      if (look) this.looked = true;
      if (look) rig.look(dx * LOOK_SPEED * s.orbitSensitivity, dy * LOOK_SPEED * invert);
      else rig.pan(dx, dy);
      this.host.request();
    };
    const up = () => {
      dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up);
      dom.removeEventListener('pointercancel', up);
      // A right-click that never dragged is left to the context menu (Task 31).
      if (look && !dragged)
        dom.dispatchEvent(new CustomEvent('ge-context-click', { detail: { x, y } }));
    };
    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    return true;
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const notches = Math.max(-5, Math.min(5, e.deltaY / (e.deltaMode === 1 ? 3 : 100)));
    this.host.rig.fly(0, 0, -notches * Math.max(1, this.host.rig.distance * 0.15));
    this.host.request();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    this.slow = e.shiftKey;
    // F (frame selection) is a command in the keymap; only the fly keys are handled here.
    if (!MOVE_KEYS.has(e.code)) return false;
    this.held.add(e.code);
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
    return true;
  }

  onKeyUp(e: KeyboardEvent): void {
    this.slow = e.shiftKey;
    this.held.delete(e.code);
  }

  /** Stops flying when the window loses focus mid-key. */
  releaseAll(): void {
    this.held.clear();
  }

  private readonly tick = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.held.size === 0) {
      this.frame = 0;
      return;
    }
    const k = this.host.settings().flySpeed * (this.slow ? 0.25 : 1) * dt;
    const axis = (pos: string, neg: string) =>
      (this.held.has(pos) ? 1 : 0) - (this.held.has(neg) ? 1 : 0);
    this.host.rig.fly(axis('KeyD', 'KeyA') * k, axis('KeyE', 'KeyQ') * k, axis('KeyW', 'KeyS') * k);
    this.host.request();
    this.frame = requestAnimationFrame(this.tick);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.held.clear();
  }
}
