// The Surfaces tab's corners in the view (spec §13.11): four dots and the outline between them, drawn
// over everything (the see-through preview included), with their numbers as HTML badges beside them.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineLoop,
  Points,
  PointsMaterial,
  Vector3,
  type Camera,
} from 'three';

/** A corner's dot: white, or orange for the ones the gizmo moves (the points layer's colours). */
const FREE = new Color(0xf2f4f7);
const ACTIVE = new Color(0xff9d2e);

export class SurfaceHandles {
  readonly group = new Group();
  private readonly positions = new BufferAttribute(new Float32Array(12), 3);
  private readonly colors = new BufferAttribute(new Float32Array(12), 3);
  private readonly dots: Points<BufferGeometry, PointsMaterial>;
  private readonly outline: LineLoop<BufferGeometry, LineBasicMaterial>;
  /** The corners last shown, in world space, and the chosen ones, for the badges. */
  private corners: Vector3[] | null = null;
  private selected: readonly number[] = [];
  private badges: HTMLElement[] = [];

  constructor() {
    const dots = new BufferGeometry();
    dots.setAttribute('position', this.positions);
    dots.setAttribute('color', this.colors);
    this.dots = new Points(
      dots,
      new PointsMaterial({
        size: 10,
        sizeAttenuation: false,
        vertexColors: true,
        // See-through and last, so they draw after the see-through preview instead of under it.
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    const line = new BufferGeometry();
    line.setAttribute('position', this.positions);
    this.outline = new LineLoop(
      line,
      new LineBasicMaterial({
        color: FREE,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.8,
      }),
    );
    for (const o of [this.outline, this.dots]) {
      o.renderOrder = 999;
      o.frustumCulled = false;
    }
    this.group.add(this.outline, this.dots);
    this.group.visible = false;
  }

  /** Shows the corners (world space), the `selected` ones orange; null hides them. */
  update(corners: readonly Vector3[] | null, selected: readonly number[]): void {
    this.corners = corners && corners.map((c) => c.clone());
    this.selected = selected;
    this.group.visible = corners !== null;
    if (!corners) return;
    corners.forEach((c, i) => {
      this.positions.setXYZ(i, c.x, c.y, c.z);
      const color = selected.includes(i) ? ACTIVE : FREE;
      this.colors.setXYZ(i, color.r, color.g, color.b);
    });
    this.positions.needsUpdate = true;
    this.colors.needsUpdate = true;
  }

  /** Puts each corner's number beside its dot; call after every render. */
  placeBadges(camera: Camera, canvas: HTMLCanvasElement): void {
    const host = canvas.parentElement;
    if (!this.corners || !host) {
      for (const b of this.badges) b.remove();
      this.badges = [];
      return;
    }
    while (this.badges.length < this.corners.length) {
      const b = document.createElement('div');
      b.className = 'surface-corner';
      b.textContent = String(this.badges.length + 1);
      b.setAttribute('aria-hidden', 'true');
      host.append(b);
      this.badges.push(b);
    }
    const r = canvas.getBoundingClientRect();
    const v = new Vector3();
    this.corners.forEach((c, i) => {
      v.copy(c).project(camera);
      const b = this.badges[i];
      b.hidden = v.z > 1;
      b.classList.toggle('active', this.selected.includes(i));
      b.style.left = `${((v.x + 1) / 2) * r.width + 12}px`;
      b.style.top = `${((1 - v.y) / 2) * r.height - 12}px`;
    });
  }

  dispose(): void {
    for (const b of this.badges) b.remove();
    this.badges = [];
    this.dots.geometry.dispose();
    this.dots.material.dispose();
    this.outline.geometry.dispose();
    this.outline.material.dispose();
  }
}
