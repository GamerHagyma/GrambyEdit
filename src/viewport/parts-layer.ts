// All parts, drawn as one InstancedMesh per part type (spec §11.1).
import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  SRGBColorSpace,
} from 'three';
import { bodyGeometries, partGeometry, type Assets } from '../assets/geometry';
import { POSE_APPROX, type Poses } from '../core/pose';
import type { Doc, Json, PartId } from '../core/types';
import { LabelsLayer } from './labels-layer';
import { SlotAllocator } from './slots';
import { SpringsLayer } from './springs-layer';
import { WiresLayer } from './wires-layer';
import { PartMaterialCache } from './part-materials';

/** Bits of the per-instance `aFlags` attribute. */
export const FLAG_SELECTED = 1;
export const FLAG_HOVERED = 2;
export const FLAG_APPROX = 4;
export const FLAG_HIDDEN = 8;
export const FLAG_PAINTED = 16;
export const FLAG_ACTIVE = 32;
const HIGHLIGHT = FLAG_SELECTED | FLAG_HOVERED | FLAG_ACTIVE;

const ZERO = new Matrix4().makeScale(0, 0, 0);
const START_CAPACITY = 16;

/**
 * MeshStandardMaterial plus a small patch: paintable vertices (color alpha 255) take the instance's
 * `RGB` when the part has one, others keep their baked color; approximate parts desaturate 30%.
 */
export function createPartMaterial(desaturate: { value: number }): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ roughness: 0.62, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDesaturate = desaturate;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 color;\nattribute float aFlags;\nuniform float uDesaturate;\nvarying float vDesat;',
      )
      .replace(
        '#include <color_vertex>',
        [
          '#include <color_vertex>',
          'float gePainted = mod(floor(aFlags / 16.0), 2.0) * step(0.5, color.a);',
          'vColor = vec4(mix(color.rgb, instanceColor.rgb, gePainted), 1.0);',
          'vDesat = mod(floor(aFlags / 4.0), 2.0) * 0.3 * uDesaturate;',
        ].join('\n'),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDesat;')
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          'float geLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));',
          'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(geLum), vDesat);',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => 'grambyedit-part-v1';
  return m;
}

interface Layer {
  readonly type: string;
  /** One mesh, or one per body of a multi-piece part (D-F3); a part uses the same slot in each. */
  meshes: InstancedMesh[];
  readonly slots: SlotAllocator;
  /** One per mesh: each body's geometry carries its own `aFlags`. */
  flags: InstancedBufferAttribute[];
}

/** A part's highlight bits: `whole` on every body, and `bodies` on single bodies. */
interface Lit {
  whole: number;
  bodies: Map<number, number>;
}

/** Adds bits to a part's whole-part bits, or to one body's bits when `body` is given. */
function addLit(lit: Lit, bits: number, body: number | undefined): void {
  if (body === undefined) lit.whole |= bits;
  else lit.bodies.set(body, (lit.bodies.get(body) ?? 0) | bits);
}

/** The highlight bits of one body of a part with `count` bodies. A body index past the last lights them all. */
function bodyBits(lit: Lit | undefined, body: number, count: number): number {
  if (!lit) return 0;
  let bits = lit.whole;
  for (const [picked, b] of lit.bodies) if (picked === body || picked >= count) bits |= b;
  return bits;
}

const isRgb = (v: Json | undefined): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((c) => typeof c === 'number');

export class PartsLayer {
  readonly group = new Group();
  /** The text parts show in game; its group goes in the scene next to `group`. */
  readonly labels = new LabelsLayer();
  /** The game's suspension springs; its group goes in the scene next to `group` too. */
  readonly springs = new SpringsLayer();
  /** Internal connecting wires, outside picking and outline/ID passes. */
  readonly wires = new WiresLayer();
  private readonly layers = new Map<string, Layer>();
  private readonly owner = new Map<PartId, Layer>();
  /** Per part: the sync-owned bits (approx, hidden, painted), and the highlight bits. */
  private readonly base = new Map<PartId, number>();
  private highlights = new Map<PartId, Lit>();
  private readonly desaturate = { value: 1 };
  readonly material = createPartMaterial(this.desaturate);
  private readonly materials: PartMaterialCache;
  private readonly color = new Color();
  /** The poses last synced, so a preview can move every body of a part with its lead. */
  private poses: Poses | null = null;
  /** Materials already made see-through, so none fades twice. */
  private readonly faded = new WeakSet<MeshStandardMaterial>();

  /** Below 1, `opacity` draws every part see-through: the previews of parts not built yet. */
  constructor(
    readonly assets: Assets,
    private readonly opacity = 1,
  ) {
    this.materials = new PartMaterialCache(
      assets,
      () => createPartMaterial(this.desaturate),
      this.material,
    );
  }

  /** Writes every part's matrix, color and base flags. Parts gone from the doc free their slots. */
  sync(doc: Doc, poses: Poses, hidden: ReadonlySet<PartId>, desaturateApprox: boolean): void {
    this.desaturate.value = desaturateApprox ? 1 : 0;
    this.poses = poses;
    for (const [id, layer] of this.owner) {
      if (doc.parts.get(id)?.type !== layer.type) this.release(id, layer);
    }
    for (const id of doc.order) {
      const part = doc.parts.get(id)!;
      const layer = this.owner.get(id) ?? this.attach(id, part.type);
      const slot = layer.slots.slotOf(id)!;
      const world = poses.world.get(id);
      const bodies = poses.bodies?.get(id);
      const isHidden = hidden.has(id);
      layer.meshes.forEach((mesh, b) => {
        const m = bodies?.[b] ?? world;
        mesh.setMatrixAt(slot, isHidden || !m ? ZERO : m);
      });
      const rgb = part.props.RGB;
      let f = 0;
      if (isRgb(rgb)) {
        f |= FLAG_PAINTED;
        this.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, SRGBColorSpace);
        for (const mesh of layer.meshes) mesh.setColorAt(slot, this.color);
      }
      if ((poses.flags.get(id) ?? 0) & POSE_APPROX) f |= FLAG_APPROX;
      if (isHidden) f |= FLAG_HIDDEN;
      this.base.set(id, f);
      this.writeFlags(id, layer, slot);
    }
    for (const layer of this.layers.values()) {
      for (const mesh of layer.meshes) {
        mesh.count = layer.slots.highWater;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor!.needsUpdate = true;
      }
      for (const flags of layer.flags) flags.needsUpdate = true;
    }
    this.labels.sync(doc, poses, hidden);
    this.springs.sync(doc, poses, hidden, this.assets.catalog);
    this.wires.sync(doc, poses, hidden, this.assets.catalog);
  }

  /**
   * Draws parts at the given world matrices without touching the doc: a transform preview. A
   * multi-piece part's bodies all move with its lead body.
   */
  setPreview(world: ReadonlyMap<PartId, Matrix4>): void {
    for (const [id, m] of world) {
      const layer = this.owner.get(id);
      const slot = layer?.slots.slotOf(id);
      if (!layer || slot === undefined) continue;
      const bodies = this.poses?.bodies?.get(id);
      const lead = this.poses?.world.get(id);
      const delta = bodies && lead ? m.clone().multiply(lead.clone().invert()) : null;
      layer.meshes.forEach((mesh, b) => {
        mesh.setMatrixAt(slot, delta && bodies?.[b] ? delta.clone().multiply(bodies[b]) : m);
        mesh.instanceMatrix.needsUpdate = true;
      });
    }
    this.labels.setPreview(world);
    this.wires.setPreview(world);
  }

  /** Draws one body of a multi-piece part at `m` without touching the doc: a body drag preview. */
  setBodyPreview(id: PartId, body: number, m: Matrix4): void {
    const layer = this.owner.get(id);
    const slot = layer?.slots.slotOf(id);
    const mesh = layer?.meshes[body];
    if (!mesh || slot === undefined) return;
    mesh.setMatrixAt(slot, m);
    mesh.instanceMatrix.needsUpdate = true;
    this.wires.setBodyPreview(id, body, m);
  }

  /**
   * Sets the selection, hover and active bits. A piece lights its body only; a body index out of
   * range lights the whole part.
   */
  highlight(
    selected: ReadonlySet<PartId>,
    hovered: PartId | null,
    active: PartId | null,
    pieces: ReadonlyMap<PartId, number> = new Map(),
    hoveredPiece: number | null = null,
  ): void {
    const next = new Map<PartId, Lit>();
    const litOf = (id: PartId): Lit => {
      if (!next.has(id)) next.set(id, { whole: 0, bodies: new Map() });
      return next.get(id)!;
    };
    for (const id of selected) {
      addLit(litOf(id), FLAG_SELECTED | (id === active ? FLAG_ACTIVE : 0), pieces.get(id));
    }
    if (hovered !== null) addLit(litOf(hovered), FLAG_HOVERED, hoveredPiece ?? undefined);
    const touched = new Set([...this.highlights.keys(), ...next.keys()]);
    this.highlights = next;
    for (const id of touched) {
      const layer = this.owner.get(id);
      const slot = layer?.slots.slotOf(id);
      if (!layer || slot === undefined) continue;
      this.writeFlags(id, layer, slot);
      for (const flags of layer.flags) flags.needsUpdate = true;
    }
  }

  /** True when any part carries a highlight bit (the outline pass can be skipped otherwise). */
  hasHighlight(): boolean {
    for (const lit of this.highlights.values()) {
      if (lit.whole & HIGHLIGHT) return true;
      for (const bits of lit.bodies.values()) if (bits & HIGHLIGHT) return true;
    }
    return false;
  }

  /** The part in a mesh slot, for ID-pass decoding. */
  partAt(mesh: InstancedMesh, slot: number): PartId | undefined {
    for (const layer of this.layers.values())
      if (layer.meshes.includes(mesh)) return layer.slots.idAt(slot);
    return undefined;
  }

  /** Instances drawn for `type`, or for every type. */
  instanceCount(type?: string): number {
    let n = 0;
    for (const layer of this.layers.values())
      if (type === undefined || layer.type === type) n += layer.slots.size;
    return n;
  }

  meshes(): InstancedMesh[] {
    return [...this.layers.values()].flatMap((l) => l.meshes);
  }

  dispose(): void {
    for (const layer of this.layers.values()) {
      for (const mesh of layer.meshes) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
    }
    this.materials.dispose();
    this.labels.dispose();
    this.springs.dispose();
    this.wires.dispose();
    this.layers.clear();
    this.owner.clear();
  }

  private attach(id: PartId, type: string): Layer {
    let layer = this.layers.get(type);
    if (!layer) {
      layer = this.createLayer(type, START_CAPACITY);
      this.layers.set(type, layer);
    }
    const slot = layer.slots.alloc(id);
    if (layer.slots.capacity > layer.meshes[0].instanceMatrix.count) this.grow(layer);
    for (const flags of layer.flags) flags.setX(slot, 0);
    this.owner.set(id, layer);
    return layer;
  }

  /** Writes each body's flags for a part: the base bits, plus the highlight bits that body carries. */
  private writeFlags(id: PartId, layer: Layer, slot: number): void {
    const base = this.base.get(id) ?? 0;
    const lit = this.highlights.get(id);
    const count = layer.meshes.length;
    layer.flags.forEach((flags, body) => flags.setX(slot, base | bodyBits(lit, body, count)));
  }

  private release(id: PartId, layer: Layer): void {
    const slot = layer.slots.slotOf(id)!;
    for (const mesh of layer.meshes) mesh.setMatrixAt(slot, ZERO);
    layer.slots.free(id);
    this.owner.delete(id);
    this.base.delete(id);
    this.highlights.delete(id);
  }

  private createLayer(type: string, capacity: number): Layer {
    // Per-layer geometries that share the cached part's buffers, so `aFlags` stays per layer.
    const bases = bodyGeometries(this.assets, type) ?? [partGeometry(this.assets, type)];
    const flags = bases.map(() =>
      new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage),
    );
    const meshes = bases.map((base, b) => {
      const geometry = new BufferGeometry();
      for (const [name, attr] of Object.entries(base.attributes)) geometry.setAttribute(name, attr);
      geometry.setIndex(base.index);
      for (const group of base.groups)
        geometry.addGroup(group.start, group.count, group.materialIndex);
      geometry.userData = { ...base.userData };
      geometry.setAttribute('aFlags', flags[b]);
      return this.createMesh(geometry, capacity, type);
    });
    return { type, meshes, slots: new SlotAllocator(capacity), flags };
  }

  private createMesh(geometry: BufferGeometry, capacity: number, type: string): InstancedMesh {
    const material = this.materials.forType(type);
    if (this.opacity < 1) {
      for (const m of Array.isArray(material) ? material : [material]) {
        if (this.faded.has(m)) continue;
        this.faded.add(m);
        m.transparent = true;
        m.opacity *= this.opacity;
        m.depthWrite = false;
      }
    }
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    mesh.instanceColor.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.userData.type = type;
    this.group.add(mesh);
    return mesh;
  }

  /** Rebuilds the layer's meshes at the allocator's doubled capacity, keeping every instance. */
  private grow(layer: Layer): void {
    const cap = layer.slots.capacity;
    const flags = layer.flags.map((old) => {
      const next = new InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(
        DynamicDrawUsage,
      );
      next.array.set(old.array);
      return next;
    });
    layer.meshes = layer.meshes.map((old, b) => {
      old.geometry.setAttribute('aFlags', flags[b]);
      const mesh = this.createMesh(old.geometry, cap, layer.type);
      mesh.instanceMatrix.array.set(old.instanceMatrix.array);
      mesh.instanceColor!.array.set(old.instanceColor!.array);
      this.group.remove(old);
      old.dispose();
      return mesh;
    });
    layer.flags = flags;
  }
}
