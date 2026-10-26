import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Points,
  PointsMaterial,
  Vector3,
  type Camera,
} from 'three';
import type { Vec3 } from '../core/catalog-types';
import { evaluatePatch, type PatchDraft } from '../core/surfaces/patches';

export interface CurveControl {
  readonly id: string;
  readonly position: Vec3;
  readonly label: string;
  readonly kind: 'anchor' | 'tangent';
}
export function curveControlLayout(
  d: PatchDraft,
  mode: 'quad' | 'profiles',
  profile: number,
): CurveControl[] {
  const out: CurveControl[] = [];
  d.grid.forEach((row, r) =>
    row.forEach((id, c) => {
      const anchor = r % 3 === 0 && c % 3 === 0;
      const visible =
        mode === 'quad'
          ? r === 0 || r === 3 || c === 0 || c === 3
          : anchor || r === profile * 3 || (Math.abs(r - profile * 3) === 1 && c % 3 === 0);
      if (!visible) return;
      const corner = r === 0 ? (c === 0 ? 1 : 2) : c === 0 ? 4 : 3;
      const label = anchor
        ? mode === 'quad'
          ? `Corner ${corner}`
          : `Profile ${r / 3 + 1} anchor ${c / 3 + 1}`
        : mode === 'quad'
          ? `Edge handle ${id}`
          : `Profile ${profile + 1} ${r === profile * 3 ? 'curve' : 'loft'} handle ${id}`;
      out.push({ id, position: d.points[id], kind: anchor ? 'anchor' : 'tangent', label });
    }),
  );
  return out;
}
const FREE = new Color(0xf2f4f7),
  TANGENT = new Color(0x65cde9),
  ACTIVE = new Color(0xff9d2e);
function positions(
  object: { geometry: BufferGeometry },
  values: number[],
  colors?: number[],
): void {
  const old = object.geometry.getAttribute('position');
  if (!old || old.count * 3 !== values.length) {
    object.geometry.dispose();
    object.geometry = new BufferGeometry();
    object.geometry.setAttribute('position', new BufferAttribute(new Float32Array(values), 3));
    if (colors)
      object.geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  } else {
    (old.array as Float32Array).set(values);
    old.needsUpdate = true;
    if (colors) {
      const color = object.geometry.getAttribute('color');
      (color.array as Float32Array).set(colors);
      color.needsUpdate = true;
    }
  }
}

/** Dynamic advanced guides; independent of the legacy four-dot layer. */
export class SurfaceCurveHandles {
  readonly group = new Group();
  private readonly dots = new Points(
    new BufferGeometry(),
    new PointsMaterial({
      size: 9,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  private readonly curves = new LineSegments(
    new BufferGeometry(),
    new LineBasicMaterial({
      color: 0x65cde9,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    }),
  );
  private readonly tangents = new LineSegments(
    new BufferGeometry(),
    new LineBasicMaterial({
      color: 0x8796ad,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
      depthWrite: false,
    }),
  );
  private labels: { label: string; position: Vector3; active: boolean }[] = [];
  private badges: HTMLElement[] = [];
  constructor() {
    this.group.add(this.curves, this.tangents, this.dots);
    for (const o of this.group.children) {
      o.renderOrder = 999;
      o.frustumCulled = false;
    }
    this.group.visible = false;
  }
  update(
    d: PatchDraft | null,
    world: Matrix4,
    selected: readonly string[],
    mode: 'quad' | 'profiles',
    profile: number,
  ): void {
    this.group.visible = d !== null;
    this.labels = [];
    if (!d) return;
    const controls = curveControlLayout(d, mode, profile),
      dots: number[] = [],
      colors: number[] = [];
    const byId = new Map<string, Vector3>();
    for (const c of controls) {
      const p = new Vector3(...c.position).applyMatrix4(world),
        active = selected.includes(c.id);
      byId.set(c.id, p);
      dots.push(...p.toArray());
      const color = active ? ACTIVE : c.kind === 'anchor' ? FREE : TANGENT;
      colors.push(color.r, color.g, color.b);
      const row = d.grid.findIndex((r) => r.includes(c.id));
      if ((c.kind === 'anchor' && (mode === 'quad' || row === profile * 3)) || active)
        this.labels.push({
          label:
            c.kind === 'anchor'
              ? mode === 'quad'
                ? c.label.replace('Corner ', '')
                : `P${row / 3 + 1}.${d.grid[row].indexOf(c.id) / 3 + 1}`
              : 'H',
          position: p,
          active,
        });
    }
    positions(this.dots, dots, colors);
    const curves: number[] = [];
    const samples = (breaks: readonly number[]) =>
      [
        ...breaks,
        ...Array.from(
          { length: Math.min(128, Math.max(24, (breaks.length - 1) * 8)) + 1 },
          (_, i) => i / Math.min(128, Math.max(24, (breaks.length - 1) * 8)),
        ),
      ]
        .sort((a, b) => a - b)
        .filter((n, i, a) => i === 0 || n - a[i - 1] > 1e-10);
    const us = samples(d.uBreaks),
      vs = samples(d.vBreaks);
    const line = (uv: readonly (readonly [number, number])[]) => {
      for (let i = 1; i < uv.length; i++)
        for (const [u, v] of [uv[i - 1], uv[i]])
          curves.push(
            ...new Vector3(...evaluatePatch(d, u, v).position).applyMatrix4(world).toArray(),
          );
    };
    for (const v of d.vBreaks) line(us.map((u) => [u, v] as const));
    for (const u of d.uBreaks) line(vs.map((v) => [u, v] as const));
    positions(this.curves, curves);
    const tangents: number[] = [];
    d.grid.forEach((row, r) =>
      row.forEach((id, c) => {
        if (r % 3 !== 0 || c % 3 !== 0 || !byId.has(id)) return;
        for (const [dr, dc] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ]) {
          const neighbour = d.grid[r + dr]?.[c + dc];
          if (neighbour && byId.has(neighbour))
            tangents.push(...byId.get(id)!.toArray(), ...byId.get(neighbour)!.toArray());
        }
      }),
    );
    positions(this.tangents, tangents);
  }
  placeBadges(camera: Camera, canvas: HTMLCanvasElement): void {
    const host = canvas.parentElement;
    const count = host && this.group.visible ? this.labels.length : 0;
    while (this.badges.length > count) this.badges.pop()!.remove();
    while (this.badges.length < count) {
      const b = document.createElement('div');
      b.className = 'surface-corner surface-curve-badge';
      b.setAttribute('aria-hidden', 'true');
      host!.append(b);
      this.badges.push(b);
    }
    const rect = canvas.getBoundingClientRect();
    this.badges.forEach((b, i) => {
      const label = this.labels[i],
        p = label.position.clone().project(camera);
      b.textContent = label.label;
      b.hidden = p.z < -1 || p.z > 1;
      b.classList.toggle('active', label.active);
      b.style.left = `${((p.x + 1) / 2) * rect.width + 10}px`;
      b.style.top = `${((1 - p.y) / 2) * rect.height - 12}px`;
    });
  }
  dispose(): void {
    for (const b of this.badges) b.remove();
    this.badges = [];
    for (const o of [this.dots, this.curves, this.tangents]) {
      o.geometry.dispose();
      o.material.dispose();
    }
  }
}
