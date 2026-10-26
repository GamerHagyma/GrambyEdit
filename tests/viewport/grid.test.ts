import { ShaderMaterial, Vector3 } from 'three';
import { createGrid } from '../../src/viewport/grid';
import { CameraRig } from '../../src/viewport/cameras/rig';

test('oblique orthographic grid fades from the navigation eye instead of the distant physical camera', () => {
  const rig = new CameraRig();
  rig.target.set(7, 0, -3);
  rig.update();
  const grid = createGrid();
  grid.update(rig.target, rig.distance, rig.persp.position);
  const material = grid.mesh.material as ShaderMaterial;
  const before = material.uniforms.uEye.value.clone() as Vector3;
  rig.isOrtho = true;
  grid.update(rig.target, rig.distance, rig.persp.position);
  expect(material.uniforms.uEye.value.equals(before)).toBe(true);
  const projectedDistance = Math.hypot(before.x - rig.target.x, before.z - rig.target.z);
  expect(projectedDistance).toBeLessThan(material.uniforms.uFade.value * 0.45);
  expect(
    Math.hypot(rig.camera.position.x - rig.target.x, rig.camera.position.z - rig.target.z),
  ).toBeGreaterThan(material.uniforms.uFade.value);
  grid.mesh.geometry.dispose();
  material.dispose();
});
