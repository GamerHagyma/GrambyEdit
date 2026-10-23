// @vitest-environment jsdom
import { PerspectiveCamera, Vector3 } from 'three';
import { createNavGizmo } from '../../src/viewport/nav-gizmo';

test('every axis end is labelled: + for the positive end, a minus sign for the negative one', () => {
  const container = document.createElement('div');
  const gizmo = createNavGizmo(container, () => {});
  const camera = new PerspectiveCamera();
  camera.position.set(3, 4, 5);
  camera.lookAt(new Vector3());
  camera.updateMatrixWorld();
  gizmo.update(camera);

  const labels = Array.from(container.querySelectorAll('text'), (t) => t.textContent);
  expect(labels).toHaveLength(6);
  expect(new Set(labels)).toEqual(new Set(['X+', 'Y+', 'Z+', 'X−', 'Y−', 'Z−']));
  const radii = new Set(
    Array.from(container.querySelectorAll('circle'), (c) => c.getAttribute('r')),
  );
  expect(radii).toEqual(new Set(['9']));
});
