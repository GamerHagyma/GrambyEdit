// The 3D viewport (spec §11): mounts a WebGL2 canvas into the shell and keeps it in sync with the store.
import { effect } from '@preact/signals';
import { Box3, Sphere, Vector2, Vector3 } from 'three';
import { PLACEHOLDER_BOX } from '../core/approx';
import { parseShareText } from '../core/share';
import type { Poses } from '../core/pose';
import type { Doc, PartId } from '../core/types';
import { posesSig } from '../state/derived';
import { hiddenSig, hoverSig, selectionSig } from '../state/selection';
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
import { getViewport, setViewport, type ViewportContext } from './context';
import { Outline } from './outline';
import { partsInDisc, partsInRect, pickPart } from './raycast';
import { SocketsLayer } from './sockets-layer';
import { registerTool, toolHotkey, toolKey, toolPointer, type ToolPointer } from '../tools/manager';
import { createConnectTool } from '../tools/connect';
import { cancelModal, transformKey } from '../tools/modal';
import { createPaintTool } from '../tools/paint';
import {
  createPointTool,
  pointGizmoHandlers,
  pointGizmoModeSig,
  pointGizmoPlacement,
} from '../tools/point';
import { createSelectTool } from '../tools/select';
import {
  createTransformTool,
  gizmoHandlers,
  gizmoPlacement,
  pivotModeSig,
  spaceSig,
  transformStateSig,
} from '../tools/transform';
import { createWorkbenchTool } from '../tools/workbench';
import { toolSig } from '../tools/manager';
import {
  candidateSpots,
  captureSocket,
  wbMateSig,
  wbSocketSig,
  wbTypeSig,
} from '../state/workbench';
import { toast } from '../state/toasts';
import { TransformGizmo } from './gizmo';
import { PointsLayer } from './points-layer';
import { WorkbenchView } from './workbench-view';

export { getViewport };

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

/** How many parts near the camera show their markers for Connect and Point (the layers' limit). */
const NEAR_PARTS = 400;

function nearestParts(doc: Doc, poses: Poses, eye: Vector3, n: number): PartId[] {
  const at = new Vector3();
  const all: { id: PartId; d: number }[] = [];
  for (const id of doc.order) {
    const m = poses.world.get(id);
    if (m) all.push({ id, d: at.setFromMatrixPosition(m).distanceToSquared(eye) });
  }
  if (all.length > n) all.sort((a, b) => a.d - b.d).length = n;
  return all.map((p) => p.id);
}

const selectTool = createSelectTool();
const moveTool = createTransformTool('move');
const rotateTool = createTransformTool('rotate');
const paintTool = createPaintTool({
  part: (ndc) => pickPart(ndc)?.part ?? null,
  inRect: partsInRect,
  inDisc: partsInDisc,
});
const connectTool = createConnectTool();
const pointTool = createPointTool();
const workbenchTool = createWorkbenchTool();

/** Mounts the viewport into `el`; returns its disposer. Shows a message when WebGL2 is missing. */
export function mountViewport(el: HTMLElement): () => void {
  if (!hasWebGL2()) {
    const box = overlay(
      el,
      'WebGL2 is required to show the 3D view. Use a current version of Chrome, Edge, Firefox or Safari.',
    );
    return () => box.remove();
  }
  registerTool(selectTool);
  registerTool(moveTool);
  registerTool(rotateTool);
  registerTool(paintTool);
  registerTool(connectTool);
  registerTool(pointTool);
  registerTool(workbenchTool);
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
  const sockets = new SocketsLayer();
  scene.add(sockets.group);
  const points = new PointsLayer();
  scene.add(points.group);
  const outline = new Outline();
  let frame = 0;
  const request = () => {
    if (!frame && !lostBox) frame = requestAnimationFrame(render);
  };
  const workbench = new WorkbenchView(rig.camera, canvas, () => request());
  scene.add(workbench.group);
  workbench.onGizmoEnd = (cframe) => {
    const type = wbTypeSig.value;
    const socket = wbSocketSig.value;
    if (type && socket) {
      captureSocket(type, socket, cframe).catch((e: unknown) =>
        toast((e as Error).message, 'error'),
      );
    }
  };
  const transformGizmo = new TransformGizmo(rig.camera, canvas, scene, () => request());
  transformGizmo.handlers = gizmoHandlers;
  /** True while the Sockets tool shows a part: the workbench replaces the build in the view. */
  const inWorkbench = () => toolSig.peek() === 'sockets' && wbTypeSig.peek() !== null;
  let lostBox: HTMLElement | null = null;

  /**
   * Socket and point markers, rebuilt per frame for constant screen size. Normally the selection's and
   * the hovered part's; with Connect, the sockets and free points near the camera; with Point, the
   * points near the camera; none during a transform, only the target's during a drag re-attach.
   */
  const updateMarkers = () => {
    const cat = catalogSig.value;
    if (!cat) return;
    const doc = docSig.value;
    const poses = posesSig.value;
    const s = settingsSig.value;
    const sel = selectionSig.value;
    const hover = hoverSig.value;
    const hidden = hiddenSig.value;
    const tool = toolSig.peek();
    const state = transformStateSig.peek();
    const near =
      tool === 'connect' || tool === 'point'
        ? nearestParts(doc, poses, rig.camera.position, NEAR_PARTS).filter((id) => !hidden.has(id))
        : null;
    let socketParts: PartId[] = [];
    if (state === 'reattach') socketParts = hover === null ? [] : [hover];
    else if (state === 'idle' && tool === 'connect') socketParts = near!;
    else if (state === 'idle') {
      socketParts = [...sel.parts].filter((id) => !hidden.has(id));
      if (hover !== null && !socketParts.includes(hover)) socketParts.unshift(hover);
    }
    sockets.update(doc, poses, cat, socketParts, rig, s.maxSockets);
    const selectedHosts = [...sel.points].map((k) => Number(k.slice(0, k.indexOf(':'))));
    const pointHosts =
      state === 'transform'
        ? []
        : (near ?? [...new Set([...sel.parts, ...selectedHosts])].filter((id) => !hidden.has(id)));
    points.update(doc, poses, cat, pointHosts, rig, s.maxSockets, sel.points, tool === 'connect');
  };

  const render = () => {
    frame = 0;
    renderer.info.reset();
    grid.update(rig.target, rig.distance);
    follow(rig.camera);
    gizmo.update(rig.camera);
    const wb = inWorkbench();
    if (ctx.layer) ctx.layer.group.visible = !wb;
    sockets.group.visible = !wb;
    points.group.visible = !wb;
    workbench.group.visible = wb;
    workbench.setEnabled(wb);
    workbench.setCamera(rig.camera);
    transformGizmo.setCamera(rig.camera);
    if (!wb) updateMarkers();
    renderer.render(scene, rig.camera);
    if (ctx.layer && !wb) outline.render(renderer, ctx.layer, rig.camera);
    for (const after of ctx.afterRender) after();
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

  const ctx: ViewportContext = {
    rig,
    renderer,
    scene,
    canvas,
    layer: null,
    sockets,
    points,
    workbench,
    gizmo: transformGizmo,
    afterRender: new Set(),
    pointer: null,
    request,
    ndc,
  };
  setViewport(ctx);

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
    pivotAt: (at) => pickPart(at)?.point ?? null,
    frameSelection: () => {
      const sel = selectionSig.value.parts;
      frameParts(sel.size > 0 ? sel : null);
    },
    frameAll: () => frameParts(null),
  };
  const blender = new BlenderControls(host);
  const studio = new StudioControls(host);
  const controls = () => (settingsSig.value.cameraScheme === 'studio' ? studio : blender);

  const toTool = (e: PointerEvent, kind: ToolPointer['kind'], button: number): ToolPointer => ({
    kind,
    button,
    x: e.clientX,
    y: e.clientY,
    ndc: ndc(e),
    shift: e.shiftKey,
    ctrl: e.ctrlKey || e.metaKey,
    alt: e.altKey,
  });
  const onPointerDown = (e: PointerEvent) => {
    canvas.focus({ preventScroll: true });
    if (controls().onPointerDown(e) || e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    toolPointer(toTool(e, 'down', 0));
    const move = (ev: PointerEvent) => toolPointer(toTool(ev, 'move', 0));
    const up = (ev: PointerEvent) => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      toolPointer(toTool(ev, 'up', 0));
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  };
  const onHover = (e: PointerEvent) => {
    ctx.pointer = { x: e.clientX, y: e.clientY };
    // Runs before a gizmo drag's own move handler, so Ctrl decides this move's snapping.
    transformGizmo.setSnapping(e.ctrlKey || e.metaKey);
    if (e.buttons === 0) toolPointer(toTool(e, 'move', -1));
  };
  const onLeave = () => {
    if (hoverSig.value !== null) hoverSig.value = null;
  };
  const onWheel = (e: WheelEvent) => controls().onWheel(e);
  const onContextMenu = (e: MouseEvent) => e.preventDefault();
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Control' || e.key === 'Meta') transformGizmo.setSnapping(true);
    if (isTyping(e.target) || document.querySelector('.dialog-backdrop')) return;
    if (e.key === 'Escape' && transformGizmo.cancel()) e.preventDefault();
    else if (controls().onKeyDown(e) || transformKey(e) || toolKey(e) || toolHotkey(e)) {
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Control' || e.key === 'Meta') transformGizmo.setSnapping(false);
    studio.onKeyUp(e);
  };
  const onBlur = () => studio.releaseAll();
  const onLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
    lostBox = overlay(el, 'The 3D view stopped.', { label: 'Reload view', run: reload });
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onHover);
  canvas.addEventListener('pointerleave', onLeave);
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
    ctx.layer?.sync(doc, poses, hidden, s.desaturateApprox);
    request();
  });
  let framedType: string | null = null;
  const stopWorkbench = effect(() => {
    const active = toolSig.value === 'sockets';
    const type = wbTypeSig.value;
    const socket = wbSocketSig.value;
    const mate = wbMateSig.value;
    const assets = assetsSig.value;
    const cat = catalogSig.value;
    if (active && type && assets && cat) {
      workbench.show(assets, cat, type, socket, mate, cat.conventions, candidateSpots(cat, type));
      if (framedType !== type) {
        const b = workbench.bounds(cat, type);
        rig.frame(b.center, b.radius);
        framedType = type;
      }
    } else if (!active && framedType !== null) {
      framedType = null;
      host.frameAll();
    }
    request();
  });
  const stopHighlight = effect(() => {
    const { parts, active } = selectionSig.value;
    const hover = hoverSig.value;
    if (!assetsSig.value) return;
    ctx.layer?.highlight(parts, hover, typeof active === 'number' ? active : null);
    request();
  });

  const stopGizmo = effect(() => {
    const tool = toolSig.value;
    const s = settingsSig.value;
    const forPoint = tool === 'point';
    const on = (tool === 'move' || tool === 'rotate' || forPoint) && assetsSig.value !== null;
    transformGizmo.handlers = forPoint ? pointGizmoHandlers : gizmoHandlers;
    transformGizmo.configure({
      mode: forPoint ? pointGizmoModeSig.value : tool === 'rotate' ? 'rotate' : 'translate',
      space: forPoint ? 'local' : spaceSig.value,
      steps: { move: s.snapMove, rotate: s.snapRotate },
      individual: !forPoint && pivotModeSig.value === 'individual',
    });
    transformGizmo.setEnabled(on);
    const at = !on
      ? null
      : forPoint
        ? pointGizmoPlacement()
        : gizmoPlacement(
            docSig.value,
            posesSig.value,
            selectionSig.value,
            pivotModeSig.value,
            spaceSig.value,
          );
    transformGizmo.place(at);
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
    pick(x, y) {
      const hit = pickPart(ndc({ clientX: x, clientY: y }));
      return hit && { part: hit.part, subPart: hit.subPart };
    },
  });

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onHover);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('webglcontextlost', onLost);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    offView();
    stopSync();
    stopHighlight();
    stopGizmo();
    cancelModal();
    transformGizmo.dispose();
    stopWorkbench();
    offDebug();
    studio.dispose();
    blender.dispose();
    gizmo.dispose();
    ctx.layer?.dispose();
    sockets.dispose();
    points.dispose();
    workbench.dispose();
    outline.dispose();
    grid.mesh.geometry.dispose();
    (grid.mesh.material as { dispose(): void }).dispose();
    renderer.dispose();
    canvas.remove();
    lostBox?.remove();
    if (getViewport() === ctx) setViewport(null);
  };
}
