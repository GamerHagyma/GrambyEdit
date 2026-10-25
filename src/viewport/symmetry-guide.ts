import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import type { SymmetrySettings } from '../state/symmetry';
export class SymmetryGuide {
  readonly group = new Group();
  private key = '';
  private readonly line = new LineBasicMaterial({
    color: 0x6bcff6,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  private readonly fill = new MeshBasicMaterial({
    color: 0x59a8e8,
    transparent: true,
    opacity: 0.1,
    side: DoubleSide,
    depthWrite: false,
  });
  constructor() {
    this.group.name = 'local-symmetry-guide';
    this.group.matrixAutoUpdate = false;
    this.group.visible = false;
  }
  set(frame: Matrix4 | null, s: SymmetrySettings): void {
    this.group.visible = !!frame && s.guide;
    if (!frame) return;
    this.group.matrix.copy(frame);
    const key = [s.mode, s.axis, s.size, s.count].join('|');
    if (key === this.key) return;
    this.key = key;
    this.clear();
    const size = s.size / 2,
      points: number[] = [];
    const at = (a: number, b: number, h = 0) =>
      s.axis === 'x' ? [h, a, b] : s.axis === 'y' ? [a, h, b] : [a, b, h];
    const segment = (a: number[], b: number[]) => points.push(...a, ...b);
    if (s.mode === 'plane') {
      const plane = new Mesh(new PlaneGeometry(s.size, s.size), this.fill);
      if (s.axis === 'x') plane.rotation.y = Math.PI / 2;
      else if (s.axis === 'y') plane.rotation.x = Math.PI / 2;
      this.group.add(plane);
      for (const sign of [-1, 1]) {
        segment(at(-size, sign * size), at(size, sign * size));
        segment(at(sign * size, -size), at(sign * size, size));
      }
      segment(at(-size, 0), at(size, 0));
      segment(at(0, -size), at(0, size));
    } else {
      for (let i = 0; i < 64; i++) {
        const a = (i * Math.PI) / 32,
          b = ((i + 1) * Math.PI) / 32;
        segment(
          at(Math.cos(a) * size, Math.sin(a) * size),
          at(Math.cos(b) * size, Math.sin(b) * size),
        );
      }
      for (let i = 0; i < s.count; i++) {
        const a = (i * 2 * Math.PI) / s.count;
        segment(at(0, 0), at(Math.cos(a) * size, Math.sin(a) * size));
      }
      segment(at(0, 0, -size), at(0, 0, size));
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    this.group.add(new LineSegments(geometry, this.line));
  }
  private clear() {
    for (const child of [...this.group.children]) {
      if (child instanceof Mesh || child instanceof LineSegments) child.geometry.dispose();
      this.group.remove(child);
    }
  }
  dispose() {
    this.clear();
    this.line.dispose();
    this.fill.dispose();
  }
}
