// The Socket Workbench view (spec §12.7): one part at the origin, its socket rings (solid when
// captured, hollow when approximate) with an arrow along each socket's facing, candidate dots, a
// test-mate cube and a gizmo on the selected socket, along the socket's own axes. Part space equals
// world space here, so a hit on the mesh is already a part-space frame.
import {
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Raycaster,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Camera,
  type Intersection,
  type Vector2,
} from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { partGeometry, type Assets } from '../assets/geometry';
import { PLACEHOLDER_BOX } from '../core/approx';
import type { Catalog, Conventions } from '../core/catalog-types';
import { cfToMatrix4, matrix4ToCf } from '../core/cframe';
import { childWorldViaSocket } from '../core/conventions';
import { frameFromNormal } from '../core/frames';
import type { CFrame12, SocketId } from '../core/types';

export type WorkbenchPick =
  | { kind: 'dot'; label: string; cframe: CFrame12 }
  | { kind: 'socket'; socket: SocketId }
  | { kind: 'surface'; cframe: CFrame12 };

const RING = new RingGeometry(0.62, 1, 24).rotateX(-Math.PI / 2);
const DISC = new CircleGeometry(1, 24).rotateX(-Math.PI / 2);
const DOT = new SphereGeometry(1, 12, 8);
/** The facing arrow in ring units: out of the ring along the socket's +Y, its outward normal. */
const ARROW = mergeGeometries([
  new CylinderGeometry(0.12, 0.12, 1.5, 8).translate(0, 0.75, 0),
  new ConeGeometry(0.36, 0.7, 12).translate(0, 1.85, 0),
])!;
const flat = (color: number, opacity = 1) =>
  new MeshBasicMaterial({
    color,
    side: DoubleSide,
    transparent: opacity < 1,
    opacity,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

/** Baked part colors, alpha forced to 1 (the color attribute's alpha is the paint flag). */
function partMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      '#include <color_vertex>\nvColor.a = 1.0;',
    );
  };
  m.customProgramCacheKey = () => 'grambyedit-workbench-part';
  return m;
}

export class WorkbenchView {
  readonly group = new Group();
  private readonly content = new Group();
  private readonly proxy = new Object3D();
  private readonly gizmo: TransformControls;
  private readonly partMat = partMaterial();
  private readonly mateMat = new MeshStandardMaterial({ color: 0x9a9da3, roughness: 0.7 });
  private mesh: Mesh | null = null;
  private markers: { socket: SocketId; mesh: Mesh; arrow: Mesh }[] = [];
  private dots: { label: string; cframe: CFrame12; mesh: Mesh }[] = [];
  private shownKey = '';
  /** Marker size for the current part; also the depth tolerance when picking markers. */
  private markerRadius = 0.03;
  /** The gizmo's frame when a drag starts: a click that moves nothing captures nothing. */
  private readonly dragStart = new Matrix4();
  /** Called with the gizmo's frame when a drag ends. */
  onGizmoEnd: (cframe: CFrame12) => void = () => {};

  constructor(camera: Camera, dom: HTMLElement, request: () => void) {
    this.group.add(this.content, this.proxy);
    this.gizmo = new TransformControls(camera, dom);
    this.gizmo.setSize(0.7);
    this.gizmo.setTranslationSnap(0.01);
    this.gizmo.setRotationSnap(Math.PI / 2);
    // Along the socket's own axes, so the gizmo shows its roll and R turns it about its facing.
    this.gizmo.setSpace('local');
    this.gizmo.addEventListener('change', request);
    this.gizmo.addEventListener('mouseDown', () => {
      this.proxy.updateMatrix();
      this.dragStart.copy(this.proxy.matrix);
    });
    this.gizmo.addEventListener('mouseUp', () => {
      this.proxy.updateMatrix();
      if (this.proxy.matrix.equals(this.dragStart)) return;
      this.onGizmoEnd(matrix4ToCf(this.proxy.matrix));
    });
    this.group.add(this.gizmo.getHelper());
  }

  /** True while the pointer is over or dragging the gizmo, so clicks there are not captures. */
  gizmoBusy(): boolean {
    return this.gizmo.dragging || this.gizmo.axis !== null;
  }

  setCamera(camera: Camera): void {
    this.gizmo.camera = camera;
  }

  setGizmoMode(mode: 'translate' | 'rotate'): void {
    this.gizmo.setMode(mode);
  }

  /** The gizmo takes pointer input only while the workbench is showing. */
  setEnabled(on: boolean): void {
    this.gizmo.enabled = on;
  }

  /** Rebuilds the scene for `type`, marking `socket` as selected. Cheap enough to call per change. */
  show(
    assets: Assets,
    cat: Catalog,
    type: string,
    socket: SocketId | null,
    mate: boolean,
    conv: Conventions,
    spots: readonly { label: string; cframe: CFrame12 }[],
  ): void {
    const def = cat.parts[type];
    const box = def?.mesh ?? PLACEHOLDER_BOX;
    const diag = Math.hypot(
      box.max[0] - box.min[0],
      box.max[1] - box.min[1],
      box.max[2] - box.min[2],
    );
    const r = Math.max(0.03, diag * 0.035);
    this.markerRadius = r;
    this.content.clear();
    this.mesh = new Mesh(partGeometry(assets, type), this.partMat);
    this.content.add(this.mesh);

    this.markers = Object.entries(def?.sockets ?? {}).map(([id, s]) => {
      const selected = id === socket;
      const captured = s.frameSource === 'captured';
      const color = flat(selected ? 0xffc46b : captured ? 0x3fb950 : 0x7cc4fa);
      const mesh = new Mesh(captured || selected ? DISC : RING, color);
      const arrow = new Mesh(ARROW, color);
      const size = selected ? r * 1.35 : r;
      for (const m of [mesh, arrow]) {
        m.matrixAutoUpdate = false;
        m.matrix
          .copy(cfToMatrix4(s.frame))
          .multiply(new Matrix4().makeTranslation(0, r * 0.05, 0))
          .multiply(new Matrix4().makeScale(size, size, size));
        m.userData.socket = id;
        this.content.add(m);
      }
      return { socket: id, mesh, arrow };
    });

    this.dots = spots.map((spot) => {
      const mesh = new Mesh(DOT, flat(0xffffff, 0.55));
      const p = new Vector3().setFromMatrixPosition(cfToMatrix4(spot.cframe));
      mesh.position.copy(p);
      mesh.scale.setScalar(r * 0.45);
      this.content.add(mesh);
      return { ...spot, mesh };
    });

    const frame = socket && def?.sockets[socket]?.frame;
    if (mate && frame) {
      const part = cat.parts.Part;
      const cube = new Mesh(partGeometry(assets, 'Part'), this.mateMat);
      cube.matrixAutoUpdate = false;
      if (part) {
        cube.matrix.copy(
          childWorldViaSocket(
            new Matrix4(),
            cfToMatrix4(frame),
            cfToMatrix4(part.sockets['1'].frame),
            {},
            conv,
          ),
        );
      }
      this.content.add(cube);
    }

    // The frame is part of the key: a turn or typed position re-seats the gizmo on the new frame.
    const key = `${type}|${socket}|${frame ? frame.join(',') : ''}`;
    if (frame) {
      // Re-seat the gizmo only when the socket or its frame changes, never in the middle of a drag.
      if (key !== this.shownKey && !this.gizmo.dragging) {
        cfToMatrix4(frame).decompose(this.proxy.position, this.proxy.quaternion, this.proxy.scale);
        this.proxy.scale.set(1, 1, 1);
        this.shownKey = key;
      }
      this.gizmo.attach(this.proxy);
    } else {
      this.gizmo.detach();
      this.shownKey = key;
    }
  }

  /** What is under the cursor: a candidate dot, a socket ring, or the part surface. */
  pick(ndc: Vector2, camera: Camera): WorkbenchPick | null {
    const ray = new Raycaster();
    ray.setFromCamera(ndc, camera);
    const first = (objects: Mesh[]): Intersection | undefined =>
      ray.intersectObjects(objects, false)[0];
    const hit = this.mesh ? first([this.mesh]) : undefined;
    // Markers sit on the surface: one farther than the first surface hit is behind the part.
    const limit = hit ? hit.distance + this.markerRadius * 2 : Infinity;
    const dot = first(this.dots.map((d) => d.mesh));
    if (dot && dot.distance <= limit) {
      const d = this.dots.find((x) => x.mesh === dot.object)!;
      return { kind: 'dot', label: d.label, cframe: d.cframe };
    }
    const marks = this.markers.flatMap((m) => [m.mesh, m.arrow]);
    for (const m of marks) m.updateMatrixWorld();
    const ring = first(marks);
    if (ring && ring.distance <= limit) {
      return { kind: 'socket', socket: ring.object.userData.socket as SocketId };
    }
    if (!hit?.face) return null;
    return {
      kind: 'surface',
      cframe: frameFromNormal(hit.point.toArray(), hit.face.normal.toArray()),
    };
  }

  /** Centre and radius that frame the part. */
  bounds(cat: Catalog, type: string): { center: Vector3; radius: number } {
    const box = cat.parts[type]?.mesh ?? PLACEHOLDER_BOX;
    const center = new Vector3(
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    );
    const radius =
      Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) / 2;
    return { center, radius };
  }

  dispose(): void {
    this.gizmo.detach();
    this.gizmo.dispose();
    this.content.clear();
    this.partMat.dispose();
    this.mateMat.dispose();
  }
}
