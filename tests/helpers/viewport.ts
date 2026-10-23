// A stand-in viewport for tool tests: a camera looking at the origin, an 800×600 canvas and pointer maths.
import { Vector2 } from 'three';
import { CameraRig } from '../../src/viewport/cameras/rig';
import type { ViewportContext } from '../../src/viewport/context';

export function fakeViewport(extra: Partial<ViewportContext> = {}): ViewportContext {
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  host.append(canvas);
  document.body.append(host);
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  const rig = new CameraRig();
  rig.setSize(800, 600);
  return {
    rig,
    renderer: null as never,
    scene: null as never,
    canvas,
    layer: null,
    ghost: null,
    sockets: null,
    points: null,
    workbench: null,
    gizmo: null,
    onKey: () => false,
    snapshot: () => Promise.resolve(null),
    afterRender: new Set(),
    pointer: { x: 400, y: 300 },
    request() {},
    ndc: (e) => new Vector2((e.clientX / 800) * 2 - 1, -(e.clientY / 600) * 2 + 1),
    ...extra,
  };
}
