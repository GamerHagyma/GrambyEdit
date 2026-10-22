import { DirectionalLight, HemisphereLight, Scene, Vector3, type Camera } from 'three';

export interface SceneParts {
  readonly scene: Scene;
  /** Keeps the key light over the camera's shoulder, so every view is lit (spec §11.1). */
  follow(camera: Camera): void;
}

/** A hemisphere fill plus one directional key light; no shadows. */
export function createScene(): SceneParts {
  const scene = new Scene();
  scene.add(new HemisphereLight(0xf2f4f8, 0x5a5f69, 1.9));
  const key = new DirectionalLight(0xffffff, 1.6);
  scene.add(key, key.target);
  const forward = new Vector3();
  return {
    scene,
    follow(camera) {
      camera.getWorldDirection(forward);
      key.target.position.copy(camera.position).addScaledVector(forward, 10);
      key.position.set(0.45, 0.85, 0.35).applyQuaternion(camera.quaternion).multiplyScalar(10);
      key.position.add(camera.position);
    },
  };
}
