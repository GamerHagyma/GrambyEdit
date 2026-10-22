// The 3D viewport (spec §11): mounts a WebGL2 canvas into the shell and keeps it in sync with the store.
import { effect } from '@preact/signals';
import { Box3, Sphere, Vector2, Vector3, type Scene, type WebGLRenderer } from 'three';
import { PLACEHOLDER_BOX } from '../core/approx';
import { parseShareText } from '../core/share';
import type { PartId } from '../core/types';
import { posesSig } from '../state/derived';
import { hiddenSig, selectionSig } from '../state/selection';
import { settingsSig } from '../state/settings';
import { assetsSig, catalogSig, docSig, loadDoc, viewBus } from '../state/store';
import { BlenderControls, type NavHost } from './cameras/blender';
import { CameraRig } from './cameras/rig';
import { StudioControls } from './cameras/studio';
import { registerDebug } from './debug';
import { createGrid } from './grid';
import { createNavGizmo } from './nav-gizmo';
import { PartsLayer } from './parts-layer';
import { createRenderer, hasWebGL2 } from './renderer';
import { createScene } from './scene';

export interface ViewportContext {
  readonly rig: CameraRig;
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly canvas: HTMLCanvasElement;
  layer: PartsLayer | null;
  request(): void;
  ndc(e: { clientX: number; clientY: number }): Vector2;
}

let current: ViewportContext | null = null;

/** The mounted viewport, for picking and tools; null when none is mounted. */
export function getViewport(): ViewportContext | null {
  return current;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function overlay(
  el: HTMLElement,
  text: string,
  action?: { label: string; run(): void },
): HTMLElement {
  const box = document.createElement('div');
  box.className = 'viewport-overlay';
  const p = document.createElement('p');
  p.textContent = text;
  box.append(p);
  if (action) {
    const b = document.createElement('button');
    b.className = 'button primary';
    b.textContent = action.label;
    b.addEventListener('click', action.run);
    box.append(b);
  }
  el.append(box);
  return box;
}

/** Mounts the viewport into `el`; returns its disposer. Shows a message when WebGL2 is missing. */
export function mountViewport(el: HTMLElement): () => void {
  if (!hasWebGL2()) {
    const box = overlay(
      el,
      'WebGL2 is required to show the 3D view. Use a current version of Chrome, Edge, Firefox or Safari.',
    );
    return () => box.remove();
  }
  let stop = () => {};
  const run = () => {
    stop();
    stop = startSession(el, run);
  };
  run();
  return () => stop();
}

/** One renderer lifetime. A lost WebGL context ends it; "Reload view" starts a fresh one. */
function startSession(el: HTMLElement, reload: () => void): () => void {
  const canvas = document.createElement('canvas');
  canvas.tabIndex = -1;
  el.append(canvas);
  const renderer = createRenderer(canvas);
  const { scene, follow } = createScene();
  const grid = createGrid();
  scene.add(grid.mesh);
  const rig = new CameraRig();
  let frame = 0;
  let lostBox: HTMLElement | null = null;

  const render = () => {
    frame = 0;
    renderer.info.reset();
    grid.update(rig.target, rig.distance);
    follow(rig.camera);
    gizmo.update(rig.camera);
    renderer.render(scene, rig.camera);
  };
  const request = () => {
    if (!frame && !lostBox) frame = requestAnimationFrame(render);
  };
  const gizmo = createNavGizmo(el, (axis) => {
    rig.setView(axis);
    request();
  });
  const ndc = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return new Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  };

  const ctx: ViewportContext = { rig, renderer, scene, canvas, layer: null, request, ndc };
  current = ctx;

  const resize = () => {
    const r = el.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    rig.setSize(r.width, r.height);
    request();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(el);
  resize();

  /** Fits the given parts (all parts when null) in view. */
  const frameParts = (ids: Iterable<PartId> | null) => {
    const doc = docSig.value;
    const poses = posesSig.value;
    const cat = catalogSig.value;
    const box = new Box3();
    const p = new Vector3();
    let reach = 0.5;
    for (const id of ids ?? doc.order) {
      const m = poses.world.get(id);
      const part = doc.parts.get(id);
      if (!m || !part) continue;
      box.expandByPoint(p.setFromMatrixPosition(m));
      const b = cat?.parts[part.type]?.mesh ?? PLACEHOLDER_BOX;
      reach = Math.max(
        reach,
        Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2,
      );
    }
    if (box.isEmpty()) rig.frame(new Vector3(), 6);
    else {
      const s = box.getBoundingSphere(new Sphere());
      rig.frame(s.center, s.radius + reach);
    }
    request();
  };

  const host: NavHost = {
    rig,
    dom: canvas,
    settings: () => settingsSig.value,
    request,
    ndc,
    pivotAt: () => null,
    frameSelection: () => {
      const sel = selectionSig.value.parts;
      frameParts(sel.size > 0 ? sel : null);
    },
    frameAll: () => frameParts(null),
  };
  const blender = new BlenderControls(host);
  const studio = new StudioControls(host);
  const controls = () => (settingsSig.value.cameraScheme === 'studio' ? studio : blender);

  const onPointerDown = (e: PointerEvent) => {
    canvas.focus({ preventScroll: true });
    controls().onPointerDown(e);
  };
  const onWheel = (e: WheelEvent) => controls().onWheel(e);
  const onContextMenu = (e: MouseEvent) => e.preventDefault();
  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target) || document.querySelector('.dialog-backdrop')) return;
    if (controls().onKeyDown(e)) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => studio.onKeyUp(e);
  const onBlur = () => studio.releaseAll();
  const onLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
    lostBox = overlay(el, 'The 3D view stopped.', { label: 'Reload view', run: reload });
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('webglcontextlost', onLost);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  const offView = viewBus.on((e) => {
    if (e.kind === 'frame-all') host.frameAll();
    else if (e.kind === 'frame-selection') host.frameSelection();
    else if (e.kind === 'view') {
      rig.setView(e.axis);
      request();
    } else {
      rig.isOrtho = !rig.isOrtho;
      request();
    }
  });

  const stopSync = effect(() => {
    const assets = assetsSig.value;
    const doc = docSig.value;
    const poses = posesSig.value;
    const selected = selectionSig.value.parts;
    const hidden = hiddenSig.value;
    const s = settingsSig.value;
    grid.setTheme(s.theme);
    if (assets && ctx.layer?.assets !== assets) {
      if (ctx.layer) {
        scene.remove(ctx.layer.group);
        ctx.layer.dispose();
      }
      ctx.layer = new PartsLayer(assets);
      scene.add(ctx.layer.group);
    }
    ctx.layer?.sync(doc, poses, hidden, selected, s.desaturateApprox);
    request();
  });

  const offDebug = registerDebug({
    importCode(code) {
      const r = parseShareText(code);
      if (!r.ok) throw new Error(r.message);
      loadDoc(r.doc);
      host.frameAll();
    },
    instanceCount: (type) => ctx.layer?.instanceCount(type) ?? 0,
    drawCalls: () => renderer.info.render.calls,
    doc: () => docSig.value,
    poses: () => posesSig.value,
    selection: () => [...selectionSig.value.parts],
    fps: (ms = 1000) =>
      new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          render();
          n++;
          const t = performance.now() - t0;
          if (t < ms) requestAnimationFrame(tick);
          else resolve((n * 1000) / t);
        };
        requestAnimationFrame(tick);
      }),
    project(id) {
      const m = posesSig.value.world.get(id);
      if (!m) throw new Error(`part ${id} has no pose`);
      const v = new Vector3().setFromMatrixPosition(m).project(rig.camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    renderNow: render,
    camera: () => ({
      eye: rig.camera.position.toArray().map((v) => +v.toFixed(3)),
      target: rig.target.toArray().map((v) => +v.toFixed(3)),
      distance: +rig.distance.toFixed(3),
      ortho: rig.isOrtho,
    }),
    pick: () => null,
  });

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('webglcontextlost', onLost);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    offView();
    stopSync();
    offDebug();
    studio.dispose();
    blender.dispose();
    gizmo.dispose();
    ctx.layer?.dispose();
    grid.mesh.geometry.dispose();
    (grid.mesh.material as { dispose(): void }).dispose();
    renderer.dispose();
    canvas.remove();
    lostBox?.remove();
    if (current === ctx) current = null;
  };
}
