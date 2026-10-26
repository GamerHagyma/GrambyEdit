// Local image meshes and their own gizmo; never part of blueprint picking, history or exports.
import {
  DoubleSide,
  Group,
  BufferGeometry,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  Raycaster,
  Vector3,
  Quaternion,
  type Vector2,
  type Camera,
  type Texture,
} from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import {
  referenceErrorSig,
  referencePlaneSize,
  updateReferencePlane,
  type ReferenceImage,
  type ReferencePlane,
} from '../state/references';
import type { Settings } from '../state/settings';
import { gridOffset, snapValue } from '../tools/transform';

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
  private readonly outline = new LineLoop(
    new BufferGeometry().setFromPoints([
      new Vector3(-0.5, -0.5, 0),
      new Vector3(0.5, -0.5, 0),
      new Vector3(0.5, 0.5, 0),
      new Vector3(-0.5, 0.5, 0),
    ]),
    new LineBasicMaterial({ color: 0xffc46b, depthTest: false }),
  );
  private selected: number | null = null;
  private disposed = false;
  private pointer: number | null = null;
  private snapping = false;
  private moveStep = 0.25;
  private rotateStep = 15;
  private grid = false;
  private readonly dragPosition = new Vector3();
  private readonly dragQuaternion = new Quaternion();
  private dragSize = { width: 1, height: 1 };
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
    this.outline.name = 'reference-plane-selection';
    this.outline.visible = false;
    this.outline.matrixAutoUpdate = false;
    this.outline.renderOrder = 6;
    this.group.add(this.outline);
    canvas.addEventListener('pointerdown', this.rememberPointer);
    canvas.addEventListener('pointercancel', this.cancelPointer);
    canvas.addEventListener('lostpointercapture', this.cancelPointer);
    this.gizmo.addEventListener('change', request);
    this.gizmo.addEventListener('mouseDown', () => {
      const m = this.gizmo.object;
      if (m) {
        this.dragPosition.copy(m.position);
        this.dragQuaternion.copy(m.quaternion);
        this.dragSize = { width: m.scale.x, height: m.scale.y };
      }
    });
    this.gizmo.addEventListener('objectChange', () => {
      const id = this.selected,
        entry = id === null ? null : this.entries.get(id);
      if (!entry || id === null) return;
      const m = entry.mesh;
      if (this.snapping && this.gizmo.getMode() === 'translate') {
        let offset = m.position.clone().sub(this.dragPosition);
        if (this.grid) offset = gridOffset(offset, this.dragPosition, this.moveStep);
        else {
          offset.applyQuaternion(this.dragQuaternion.clone().invert());
          offset.set(
            snapValue(offset.x, this.moveStep),
            snapValue(offset.y, this.moveStep),
            snapValue(offset.z, this.moveStep),
          );
          offset.applyQuaternion(this.dragQuaternion);
        }
        m.position.copy(this.dragPosition).add(offset);
      }
      m.position.clampScalar(-1e6, 1e6);
      const size = referencePlaneSize(
        this.dragSize,
        m.scale.x,
        m.scale.y,
        this.snapping && this.gizmo.getMode() === 'scale',
      );
      m.scale.set(size.width, size.height, 1);
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
    mode: 'translate' | 'rotate' | 'scale' | null,
  ): void {
    if (
      mode === null ||
      selected !== this.selected ||
      (this.gizmo.dragging && mode !== this.gizmo.getMode()) ||
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
    this.outline.visible = !!mesh?.visible;
    if (mesh) {
      mesh.updateMatrix();
      this.outline.matrix.copy(mesh.matrix);
    }
    if (mesh?.visible && mode !== null) {
      if (this.gizmo.object !== mesh) this.gizmo.attach(mesh);
      this.gizmo.setMode(mode);
      this.gizmo.setSpace(this.grid && mode === 'translate' ? 'world' : 'local');
      this.gizmo.showZ = mode !== 'scale';
    } else this.gizmo.detach();
    this.gizmo.enabled = !!mesh?.visible && mode !== null;
  }

  /** Separate local picking, called only by the Reference-tab interaction route. */
  pick(ndc: Vector2, camera: Camera): number | null {
    if (!this.group.visible) return null;
    this.group.updateMatrixWorld(true);
    const ray = new Raycaster();
    ray.setFromCamera(ndc, camera);
    let nearest = Infinity,
      chosen: number | null = null;
    for (const [id, entry] of this.entries) {
      if (!entry.mesh.visible || entry.failed || entry.mesh.material.opacity <= 0) continue;
      const hit = ray.intersectObject(entry.mesh, false)[0];
      const clip = hit?.point.clone().project(camera).z;
      if (hit && clip !== undefined && clip >= -1 && clip <= 1 && hit.distance < nearest) {
        nearest = hit.distance;
        chosen = id;
      }
    }
    return chosen;
  }

  busy(ndc?: Vector2): boolean {
    // Refresh before viewport routing as a stationary press/touch may have no preceding hover.
    if (this.gizmo.enabled && ndc && !this.gizmo.dragging) {
      this.gizmo.getRaycaster().setFromCamera(ndc, this.gizmo.camera);
      this.gizmo.pointerHover(null);
    }
    return this.gizmo.enabled && (this.gizmo.dragging || this.gizmo.axis !== null);
  }

  configure(settings: Pick<Settings, 'snapMove' | 'snapRotate' | 'snapToGrid'>): void {
    this.moveStep = settings.snapMove;
    this.rotateStep = settings.snapRotate;
    this.grid = settings.snapToGrid;
    this.setSnapping(this.snapping);
  }

  setSnapping(on: boolean): void {
    this.snapping = on;
    this.gizmo.setRotationSnap(on ? this.rotateStep * DEG : null);
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
    this.outline.geometry.dispose();
    this.outline.material.dispose();
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
