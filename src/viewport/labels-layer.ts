// Text the game draws on parts when it spawns them: a sensor's key or value on its front panel, and the
// EntitySensor's six direction words. Each label is an unlit plane on its face, posed with its part, in
// a group of its own so the ID and outline passes, which draw the parts group, never see it.
import {
  CanvasTexture,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from 'three';
import type { Poses } from '../core/pose';
import type { Doc, Json, PartId } from '../core/types';

export interface LabelSpec {
  /** The face's centre in part space, its outward normal, and the text's up (unit axes). */
  readonly center: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  /** The box the text is fitted into, in studs. */
  readonly size: readonly [number, number];
  readonly font: 'sans' | 'pixel';
  /** Fixed text, or the prop whose value it shows. */
  readonly text: string | { readonly prop: string };
}

// The keycap sensors share one native mesh. The key goes on its +Z face: that face points out of the
// Kamaz's grille, letters up, on all five of its keys however each is turned (tests/core/in-game.test.ts).
const PANEL = {
  center: [0, 0, 0.3],
  normal: [0, 0, 1],
  up: [0, 1, 0],
  size: [0.442, 0.36],
  font: 'sans',
} as const;
// The EntitySensor's button tops (y = 0.443) read with +Z up, as the user's screenshot shows.
const button = (text: string, x: number, z: number): LabelSpec => ({
  center: [x, 0.443, z],
  normal: [0, 1, 0],
  up: [0, 0, 1],
  size: [0.48, 0.16],
  font: 'pixel',
  text,
});

/** The labels each part type shows in game (user, 2026-10-24). */
export const PART_LABELS: Readonly<Record<string, readonly LabelSpec[]>> = {
  InputSensor: [{ ...PANEL, text: { prop: 'ActivationKey' } }],
  AltitudeSensor: [{ ...PANEL, text: { prop: 'ActivationHeight' } }],
  VelocitySensor: [{ ...PANEL, text: { prop: 'ActivationSpeed' } }],
  EntitySensor: [
    button('UP', 0.838, 0.18),
    button('FRONT', 0, -0.02),
    button('DOWN', -0.838, 0.18),
    button('LEFT', 0.8, -0.82),
    button('BACK', 0, -0.82),
    button('RIGHT', -0.8, -0.82),
  ],
};

/** What a label shows: a string prop as stored, a finite number in plain digits, '' for nothing. */
export function labelText(spec: LabelSpec, props: Readonly<Record<string, Json>>): string {
  if (typeof spec.text === 'string') return spec.text;
  const v = props[spec.text.prop];
  if (typeof v === 'string') return v;
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

/** How far off its face a label floats, in studs. */
const LIFT = 0.002;

/** The label plane's frame in part space: +Z out of the face, +Y the text's up. */
export function labelMatrix(spec: LabelSpec): Matrix4 {
  const z = new Vector3(...spec.normal);
  const y = new Vector3(...spec.up);
  const x = new Vector3().crossVectors(y, z);
  return new Matrix4()
    .makeBasis(x, y, z)
    .setPosition(new Vector3(...spec.center).addScaledVector(z, LIFT));
}

/**
 * The font size in px that fits text `perPx` px wide per px of font into a w × h px box, as Roblox's
 * TextScaled does: as tall as the box allows, smaller when the text is too wide.
 */
export function fitPx(perPx: number, w: number, h: number): number {
  const byWidth = perPx > 0 ? (w * 0.9) / perPx : Infinity;
  return Math.max(1, Math.floor(Math.min(h * 0.8, byWidth)));
}

export type DrawLabel = (text: string, spec: LabelSpec) => Texture;

/** White text on a clear canvas; the pixel font is drawn small and scaled up unsmoothed. */
export const drawLabel: DrawLabel = (text, spec) => {
  const pixel = spec.font === 'pixel';
  const w = pixel ? 64 : 256;
  const h = Math.max(1, Math.round((w * spec.size[1]) / spec.size[0]));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (g) {
    const font = (px: number) =>
      pixel ? `bold ${px}px "Courier New", monospace` : `${px}px Arial, Helvetica, sans-serif`;
    g.font = font(100);
    g.font = font(fitPx(g.measureText(text).width / 100, w, h));
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (pixel) {
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
  }
  return texture;
};

interface Label {
  readonly mesh: Mesh;
  readonly local: Matrix4;
  text: string;
}

/** Every part's labels, kept in step with the parts layer (sync and transform previews). */
export class LabelsLayer {
  readonly group = new Group();
  /** Per labelled part: its type, and per spec its label (null while the spec shows nothing). */
  private readonly parts = new Map<PartId, { type: string; labels: (Label | null)[] }>();
  private readonly materials = new Map<string, MeshBasicMaterial>();
  private readonly geometries = new Map<string, PlaneGeometry>();

  constructor(private readonly draw: DrawLabel = drawLabel) {}

  sync(doc: Doc, poses: Poses, hidden: ReadonlySet<PartId>): void {
    for (const [id, entry] of this.parts) {
      if (doc.parts.get(id)?.type !== entry.type) this.drop(id);
    }
    for (const id of doc.order) {
      const part = doc.parts.get(id)!;
      const specs = Object.hasOwn(PART_LABELS, part.type) ? PART_LABELS[part.type] : undefined;
      if (!specs) continue;
      let entry = this.parts.get(id);
      if (!entry) this.parts.set(id, (entry = { type: part.type, labels: specs.map(() => null) }));
      const { labels } = entry;
      const world = poses.world.get(id);
      specs.forEach((spec, i) => {
        const text = labelText(spec, part.props);
        let label = labels[i];
        if (!text) {
          if (label) this.group.remove(label.mesh);
          labels[i] = null;
          return;
        }
        if (!label) {
          const mesh = new Mesh(this.geometry(spec), this.material(text, spec));
          mesh.matrixAutoUpdate = false;
          // Labels are never picked; clicks go through to the part.
          mesh.raycast = () => {};
          this.group.add(mesh);
          labels[i] = label = { mesh, local: labelMatrix(spec), text };
        } else if (label.text !== text) {
          label.mesh.material = this.material(text, spec);
          label.text = text;
        }
        label.mesh.visible = world !== undefined && !hidden.has(id);
        if (world) label.mesh.matrix.multiplyMatrices(world, label.local);
      });
    }
  }

  /** Draws the labels of previewed parts at their preview matrices, as the parts layer does. */
  setPreview(world: ReadonlyMap<PartId, Matrix4>): void {
    for (const [id, m] of world) {
      for (const label of this.parts.get(id)?.labels ?? []) {
        if (label) label.mesh.matrix.multiplyMatrices(m, label.local);
      }
    }
  }

  dispose(): void {
    for (const m of this.materials.values()) {
      m.map?.dispose();
      m.dispose();
    }
    for (const g of this.geometries.values()) g.dispose();
    this.materials.clear();
    this.geometries.clear();
    this.parts.clear();
    this.group.clear();
  }

  private drop(id: PartId): void {
    for (const label of this.parts.get(id)?.labels ?? []) if (label) this.group.remove(label.mesh);
    this.parts.delete(id);
  }

  /** One material per text and box, shared by every label that shows it. */
  private material(text: string, spec: LabelSpec): MeshBasicMaterial {
    const key = `${spec.font} ${spec.size.join('x')} ${text}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new MeshBasicMaterial({
        map: this.draw(text, spec),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
      });
      this.materials.set(key, m);
    }
    return m;
  }

  private geometry(spec: LabelSpec): PlaneGeometry {
    const key = spec.size.join('x');
    let g = this.geometries.get(key);
    if (!g) this.geometries.set(key, (g = new PlaneGeometry(spec.size[0], spec.size[1])));
    return g;
  }
}
