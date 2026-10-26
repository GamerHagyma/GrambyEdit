// Local image meshes and their own gizmo; never part of blueprint picking, history or exports.
import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  type Camera,
  type Texture,
} from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import {
  referenceErrorSig,
  updateReferencePlane,
  type ReferenceImage,
  type ReferencePlane,
} from '../state/references';

interface Entry {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  texture: Texture;
  failed: boolean;
}
const DEG = Math.PI / 180;

export class ReferencePlanesLayer {
  readonly group = new Group();
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly entries = new Map<number, Entry>();
  private readonly gizmo: TransformControls;
  private selected: number | null = null;
  private disposed = false;
  private pointer: number | null = null;
  private readonly rememberPointer = (e: PointerEvent) => {
    if (this.gizmo.enabled) this.pointer = e.pointerId;
  };
  private readonly cancelPointer = () => this.endInteraction();

  constructor(
    camera: Camera,
    private readonly canvas: HTMLElement,
    private readonly request: () => void,
  ) {
    this.group.name = 'local-reference-planes';
    this.gizmo = new TransformControls(camera, canvas);
    this.gizmo.enabled = false;
    this.gizmo.setSize(0.8);
    this.gizmo.setSpace('local');
    this.group.add(this.gizmo.getHelper());
    canvas.addEventListener('pointerdown', this.rememberPointer);
    canvas.addEventListener('pointercancel', this.cancelPointer);
    canvas.addEventListener('lostpointercapture', this.cancelPointer);
    this.gizmo.addEventListener('change', request);
    this.gizmo.addEventListener('objectChange', () => {
      const id = this.selected,
        entry = id === null ? null : this.entries.get(id);
      if (!entry || id === null) return;
      const m = entry.mesh;
      m.position.clampScalar(-1e6, 1e6);
      m.scale.set(
        Math.max(0.01, Math.min(1e5, Math.abs(m.scale.x))),
        Math.max(0.01, Math.min(1e5, Math.abs(m.scale.y))),
        1,
      );
      updateReferencePlane(id, {
        position: m.position.toArray(),
        rotation: [m.rotation.x / DEG, m.rotation.y / DEG, m.rotation.z / DEG],
        width: m.scale.x,
        height: m.scale.y,
      });
    });
  }

  sync(
    images: readonly ReferenceImage[],
    planes: ReadonlyMap<number, ReferencePlane>,
    selected: number | null,
    mode: 'translate' | 'rotate' | 'scale',
  ): void {
    if (
      selected !== this.selected ||
      (selected !== null &&
        (!planes.get(selected)?.visible || !images.some((image) => image.id === selected)))
    )
      this.endInteraction();
    for (const [id, entry] of this.entries)
      if (!planes.has(id) || !images.some((image) => image.id === id)) {
        if (this.selected === id) this.gizmo.detach();
        this.group.remove(entry.mesh);
        entry.texture.dispose();
        entry.mesh.material.dispose();
        this.entries.delete(id);
      }
    for (const [id, p] of planes) {
      const image = images.find((image) => image.id === id);
      if (!image) continue;
      let entry = this.entries.get(id);
      if (!entry) {
        const material = new MeshBasicMaterial({
          side: DoubleSide,
          transparent: true,
          depthWrite: false,
        });
        const mesh = new Mesh(this.geometry, material);
        mesh.name = `reference-image-${id}`;
        const texture = new TextureLoader().load(
          image.src,
          (loaded) => {
            if (this.disposed || this.entries.get(id)?.texture !== loaded) {
              loaded.dispose();
              return;
            }
            loaded.colorSpace = SRGBColorSpace;
            material.map = loaded;
            material.needsUpdate = true;
            this.request();
          },
          undefined,
          () => {
            const current = this.entries.get(id);
            if (!current || current.texture !== texture || this.disposed) return;
            current.failed = true;
            current.mesh.visible = false;
            if (this.selected === id) {
              this.endInteraction();
              this.gizmo.detach();
            }
            referenceErrorSig.value =
              'Could not load the workspace image. For image links, try downloading it and choosing the file instead (the image server must allow CORS for 3D textures).';
            this.request();
          },
        );
        entry = { mesh, texture, failed: false };
        this.entries.set(id, entry);
        this.group.add(mesh);
      }
      entry.mesh.visible = p.visible && !entry.failed;
      entry.mesh.material.opacity = p.opacity;
      if (!this.gizmo.dragging) {
        entry.mesh.position.fromArray(p.position);
        entry.mesh.rotation.set(p.rotation[0] * DEG, p.rotation[1] * DEG, p.rotation[2] * DEG);
        entry.mesh.scale.set(p.width, p.height, 1);
        entry.mesh.updateMatrixWorld();
      }
    }
    this.selected = selected;
    const mesh = selected === null ? null : this.entries.get(selected)?.mesh;
    if (mesh?.visible) {
      if (this.gizmo.object !== mesh) this.gizmo.attach(mesh);
      this.gizmo.setMode(mode);
      this.gizmo.showZ = mode !== 'scale';
    } else this.gizmo.detach();
    this.gizmo.enabled = !!mesh?.visible;
  }

  setCamera(camera: Camera, visible: boolean): void {
    if (!visible && this.group.visible) this.endInteraction();
    this.group.visible = visible;
    this.gizmo.camera = camera;
    this.gizmo.enabled = visible && this.selected !== null && !!this.gizmo.object;
  }

  dispose(): void {
    this.disposed = true;
    this.endInteraction();
    this.canvas.removeEventListener('pointerdown', this.rememberPointer);
    this.canvas.removeEventListener('pointercancel', this.cancelPointer);
    this.canvas.removeEventListener('lostpointercapture', this.cancelPointer);
    this.gizmo.detach();
    this.gizmo.dispose();
    for (const e of this.entries.values()) {
      e.texture.dispose();
      e.mesh.material.dispose();
    }
    this.entries.clear();
    this.geometry.dispose();
    this.group.clear();
  }

  private endInteraction(): void {
    const pointer = this.pointer;
    this.pointer = null;
    const dragging = this.gizmo.dragging;
    this.gizmo.dragging = false;
    this.gizmo.axis = null;
    if (pointer !== null && this.canvas.hasPointerCapture?.(pointer))
      this.canvas.releasePointerCapture(pointer);
    if (pointer !== null || dragging) {
      this.gizmo.disconnect();
      this.gizmo.connect(this.canvas);
    }
  }
}
