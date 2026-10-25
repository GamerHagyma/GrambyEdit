// Session camera models are visual presence only: they never enter picking, history or export.
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  type Camera,
} from 'three';
import type { CameraPose, Member } from '../state/collaboration';
interface Avatar {
  group: Group;
  target: Vector3;
  rotation: Quaternion;
  label: Sprite;
  name: string;
  color: string;
}
export class CollaboratorsLayer {
  readonly group = new Group();
  private avatars = new Map<string, Avatar>();
  constructor() {
    this.group.name = 'collaborator-cameras';
  }
  sync(members: readonly Member[], poses: ReadonlyMap<string, CameraPose>, self: string) {
    const present = new Set(
      members.filter((m) => m.id !== self && !m.pending && poses.has(m.id)).map((m) => m.id),
    );
    for (const [id, avatar] of this.avatars)
      if (!present.has(id)) {
        this.disposeAvatar(avatar);
        this.avatars.delete(id);
      }
    for (const member of members) {
      const pose = poses.get(member.id);
      if (!present.has(member.id) || !pose) continue;
      let a = this.avatars.get(member.id);
      if (a && (a.name !== member.name || a.color !== member.color)) {
        this.disposeAvatar(a);
        this.avatars.delete(member.id);
        a = undefined;
      }
      if (!a) {
        a = this.create(member);
        a.group.position.fromArray(pose.p);
        a.group.quaternion.fromArray(pose.q);
        this.avatars.set(member.id, a);
        this.group.add(a.group);
      }
      a.target.fromArray(pose.p);
      a.rotation.fromArray(pose.q).normalize();
    }
  }
  private create(member: Member): Avatar {
    const group = new Group(),
      body = new Mesh(
        new BoxGeometry(0.45, 0.28, 0.3),
        new MeshBasicMaterial({ color: member.color }),
      );
    group.add(body);
    const points = [
      0, 0, -0.15, -0.35, -0.22, -0.6, 0, 0, -0.15, 0.35, -0.22, -0.6, 0, 0, -0.15, -0.35, 0.22,
      -0.6, 0, 0, -0.15, 0.35, 0.22, -0.6, -0.35, -0.22, -0.6, 0.35, -0.22, -0.6, 0.35, -0.22, -0.6,
      0.35, 0.22, -0.6, 0.35, 0.22, -0.6, -0.35, 0.22, -0.6, -0.35, 0.22, -0.6, -0.35, -0.22, -0.6,
    ];
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    group.add(new LineSegments(geometry, new LineBasicMaterial({ color: member.color })));
    const canvas = document.createElement('canvas');
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = '28px sans-serif';
      canvas.width = Math.max(
        96,
        Math.min(768, Math.ceil(ctx.measureText(member.name).width) + 24),
      );
      ctx.fillStyle = 'rgba(20,23,28,.88)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = '28px sans-serif';
      ctx.fillStyle = new Color(member.color).getStyle();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(member.name, canvas.width / 2, 24, canvas.width - 24);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const label = new Sprite(new SpriteMaterial({ map: texture, depthTest: false }));
    label.position.y = 0.85;
    label.scale.set(canvas.width / canvas.height, 1, 1);
    group.add(label);
    return {
      group,
      target: new Vector3(),
      rotation: new Quaternion(),
      label,
      name: member.name,
      color: member.color,
    };
  }
  update(camera: Camera): boolean {
    let moving = false;
    for (const a of this.avatars.values()) {
      if (
        a.group.position.distanceToSquared(a.target) > 1e-6 ||
        a.group.quaternion.angleTo(a.rotation) > 0.001
      ) {
        a.group.position.lerp(a.target, 0.35);
        a.group.quaternion.slerp(a.rotation, 0.35);
        moving = true;
      } else {
        a.group.position.copy(a.target);
        a.group.quaternion.copy(a.rotation);
      }
      const scale = Math.max(
        0.3,
        Math.min(8, camera.position.distanceTo(a.group.position) * 0.025),
      );
      a.group.scale.setScalar(scale);
    }
    return moving;
  }
  private disposeAvatar(a: Avatar) {
    this.group.remove(a.group);
    a.group.traverse((o) => {
      if (o instanceof Mesh || o instanceof LineSegments) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
    a.label.material.map?.dispose();
    a.label.material.dispose();
  }
  dispose() {
    for (const a of this.avatars.values()) this.disposeAvatar(a);
    this.avatars.clear();
  }
}
