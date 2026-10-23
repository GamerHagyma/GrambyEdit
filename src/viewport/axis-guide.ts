// The constraint line of a modal move or rotate (spec §12.4): as in Blender, the axis X, Y or Z locked
// is drawn through the pivot in its colour, 3 px wide and over everything.
import type { Vector3 } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Axis } from '../tools/transform';

/** The navigation gizmo's axis colours. */
const COLORS: Readonly<Record<Axis, number>> = { X: 0xe5484d, Y: 0x46a758, Z: 0x3e7bfa };
/** Half the drawn length, in studs: far enough to read as an infinite line. */
const REACH = 1000;

export class AxisGuide {
  readonly line: Line2;
  private readonly material = new LineMaterial({
    linewidth: 3,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });

  constructor() {
    this.line = new Line2(new LineGeometry(), this.material);
    this.line.renderOrder = 998;
    this.line.frustumCulled = false;
    this.line.visible = false;
  }

  /** Draws the guide along `dir` through `origin`, or hides it. */
  set(
    guide: { readonly origin: Vector3; readonly dir: Vector3; readonly axis: Axis } | null,
  ): void {
    this.line.visible = guide !== null;
    if (!guide) return;
    const d = guide.dir.clone().normalize().multiplyScalar(REACH);
    const a = guide.origin.clone().sub(d);
    const b = guide.origin.clone().add(d);
    this.line.geometry.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);
    this.material.color.set(COLORS[guide.axis]);
  }

  /** The canvas size in pixels; line widths are in pixels of it. */
  setResolution(width: number, height: number): void {
    this.material.resolution.set(width, height);
  }

  dispose(): void {
    this.line.geometry.dispose();
    this.material.dispose();
  }
}
