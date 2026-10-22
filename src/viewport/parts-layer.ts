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
import { partGeometry, type Assets } from '../assets/geometry';
import { POSE_APPROX, type Poses } from '../core/pose';
import type { Doc, Json, PartId } from '../core/types';
import { SlotAllocator } from './slots';

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
  mesh: InstancedMesh;
  readonly slots: SlotAllocator;
  flags: InstancedBufferAttribute;
}

const isRgb = (v: Json | undefined): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((c) => typeof c === 'number');

export class PartsLayer {
  readonly group = new Group();
  private readonly layers = new Map<string, Layer>();
  private readonly owner = new Map<PartId, Layer>();
  /** Per part: the sync-owned bits (approx, hidden, painted) and the highlight bits. */
  private readonly base = new Map<PartId, number>();
  private highlights = new Map<PartId, number>();
  private readonly desaturate = { value: 1 };
  readonly material = createPartMaterial(this.desaturate);
  private readonly color = new Color();

  constructor(readonly assets: Assets) {}

  /** Writes every part's matrix, color and base flags. Parts gone from the doc free their slots. */
  sync(doc: Doc, poses: Poses, hidden: ReadonlySet<PartId>, desaturateApprox: boolean): void {
    this.desaturate.value = desaturateApprox ? 1 : 0;
    for (const [id, layer] of this.owner) {
      if (doc.parts.get(id)?.type !== layer.type) this.release(id, layer);
    }
    for (const id of doc.order) {
      const part = doc.parts.get(id)!;
      const layer = this.owner.get(id) ?? this.attach(id, part.type);
      const slot = layer.slots.slotOf(id)!;
      const world = poses.world.get(id);
      const isHidden = hidden.has(id);
      layer.mesh.setMatrixAt(slot, isHidden || !world ? ZERO : world);
      const rgb = part.props.RGB;
      let f = 0;
      if (isRgb(rgb)) {
        f |= FLAG_PAINTED;
        this.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, SRGBColorSpace);
        layer.mesh.setColorAt(slot, this.color);
      }
      if ((poses.flags.get(id) ?? 0) & POSE_APPROX) f |= FLAG_APPROX;
      if (isHidden) f |= FLAG_HIDDEN;
      this.base.set(id, f);
      layer.flags.setX(slot, f | (this.highlights.get(id) ?? 0));
    }
    for (const layer of this.layers.values()) {
      layer.mesh.count = layer.slots.highWater;
      layer.mesh.instanceMatrix.needsUpdate = true;
      layer.mesh.instanceColor!.needsUpdate = true;
      layer.flags.needsUpdate = true;
    }
  }

  /** Sets the selection, hover and active bits, touching only parts whose bits change. */
  highlight(selected: ReadonlySet<PartId>, hovered: PartId | null, active: PartId | null): void {
    const next = new Map<PartId, number>();
    for (const id of selected) next.set(id, FLAG_SELECTED | (id === active ? FLAG_ACTIVE : 0));
    if (hovered !== null) next.set(hovered, (next.get(hovered) ?? 0) | FLAG_HOVERED);
    for (const id of new Set([...this.highlights.keys(), ...next.keys()])) {
      const bits = next.get(id) ?? 0;
      if ((this.highlights.get(id) ?? 0) === bits) continue;
      const layer = this.owner.get(id);
      const slot = layer?.slots.slotOf(id);
      if (!layer || slot === undefined) continue;
      layer.flags.setX(slot, (this.base.get(id) ?? 0) | bits);
      layer.flags.needsUpdate = true;
    }
    this.highlights = next;
  }

  /** True when any part carries a highlight bit (the outline pass can be skipped otherwise). */
  hasHighlight(): boolean {
    for (const bits of this.highlights.values()) if (bits & HIGHLIGHT) return true;
    return false;
  }

  /** The part in a mesh slot, for ID-pass decoding. */
  partAt(mesh: InstancedMesh, slot: number): PartId | undefined {
    for (const layer of this.layers.values())
      if (layer.mesh === mesh) return layer.slots.idAt(slot);
    return undefined;
  }

  /** Instances drawn for `type`, or for every type. */
  instanceCount(type?: string): number {
    let n = 0;
    for (const layer of this.layers.values())
      if (type === undefined || layer.type === type) n += layer.slots.size;
    return n;
  }

  /** The mesh and instance slot of a part, for picking. */
  locate(id: PartId): { mesh: InstancedMesh; slot: number } | null {
    const layer = this.owner.get(id);
    const slot = layer?.slots.slotOf(id);
    return layer && slot !== undefined ? { mesh: layer.mesh, slot } : null;
  }

  meshes(): InstancedMesh[] {
    return [...this.layers.values()].map((l) => l.mesh);
  }

  dispose(): void {
    for (const layer of this.layers.values()) {
      layer.mesh.geometry.dispose();
      layer.mesh.dispose();
    }
    this.material.dispose();
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
    if (layer.slots.capacity > layer.mesh.instanceMatrix.count) this.grow(layer);
    layer.flags.setX(slot, 0);
    this.owner.set(id, layer);
    return layer;
  }

  private release(id: PartId, layer: Layer): void {
    const slot = layer.slots.slotOf(id)!;
    layer.mesh.setMatrixAt(slot, ZERO);
    layer.slots.free(id);
    this.owner.delete(id);
    this.base.delete(id);
    this.highlights.delete(id);
  }

  private createLayer(type: string, capacity: number): Layer {
    // A per-layer geometry that shares the cached part's buffers, so `aFlags` stays per layer.
    const base = partGeometry(this.assets, type);
    const geometry = new BufferGeometry();
    for (const [name, attr] of Object.entries(base.attributes)) geometry.setAttribute(name, attr);
    geometry.setIndex(base.index);
    const flags = new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(
      DynamicDrawUsage,
    );
    geometry.setAttribute('aFlags', flags);
    const mesh = this.createMesh(geometry, capacity, type);
    return { type, mesh, slots: new SlotAllocator(capacity), flags };
  }

  private createMesh(geometry: BufferGeometry, capacity: number, type: string): InstancedMesh {
    const mesh = new InstancedMesh(geometry, this.material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    mesh.instanceColor.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.userData.type = type;
    this.group.add(mesh);
    return mesh;
  }

  /** Rebuilds the layer's mesh at the allocator's doubled capacity, keeping every instance. */
  private grow(layer: Layer): void {
    const cap = layer.slots.capacity;
    const old = layer.mesh;
    const flags = new InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(DynamicDrawUsage);
    flags.array.set(layer.flags.array);
    old.geometry.setAttribute('aFlags', flags);
    const mesh = this.createMesh(old.geometry, cap, layer.type);
    mesh.instanceMatrix.array.set(old.instanceMatrix.array);
    mesh.instanceColor!.array.set(old.instanceColor!.array);
    this.group.remove(old);
    old.dispose();
    layer.mesh = mesh;
    layer.flags = flags;
  }
}
