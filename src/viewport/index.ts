// The 3D viewport (spec §11): mounts a WebGL2 canvas into the shell and keeps it in sync with the store.
import { effect } from '@preact/signals';
import { Box3, Sphere, Vector2, Vector3 } from 'three';
import { PLACEHOLDER_BOX } from '../core/approx';
import { parseShareText } from '../core/share';
import { poseTargets, type Poses } from '../core/pose';
import type { Doc, PartId } from '../core/types';
import { posesSig } from '../state/derived';
import {
  hiddenSig,
  hoverPieceSig,
  hoverPointSig,
  hoverSig,
  select,
  selectionSig,
} from '../state/selection';
import { settingsSig } from '../state/settings';
import { assetsSig, catalogSig, docSig, loadDoc, viewBus } from '../state/store';
import { BlenderControls, type NavHost } from './cameras/blender';
import { CameraRig } from './cameras/rig';
import { StudioControls } from './cameras/studio';
import { registerDebug } from './debug';
import { dragSocketParts } from './drag-sockets';
import { createGrid } from './grid';
import { createNavGizmo } from './nav-gizmo';
import { PartsLayer } from './parts-layer';
import { createRenderer, hasWebGL2 } from './renderer';
import { createScene } from './scene';
import { getViewport, setViewport, type ViewportContext } from './context';
import { Outline } from './outline';
import { partsInDisc, partsInRect, pickPart } from './raycast';
import { SocketsLayer } from './sockets-layer';
import { registerTool, toolKey, toolPointer, type ToolPointer } from '../tools/manager';
import { createConnectTool } from '../tools/connect';
import { cancelModal, modalActiveSig, modalGuideSig } from '../tools/modal';
import { createPaintTool } from '../tools/paint';
import { createPickTool } from '../tools/pick';
import { createPlaceTool } from '../tools/place';
import {
  createPointTool,
  pointGizmoHandlers,
  pointGizmoModeSig,
  pointGizmoPlacement,
  selectedPoint,
} from '../tools/point';
import {
  cornerWorlds,
  createSurfaceTool,
  surfaceGizmoHandlers,
  surfaceGizmoPlacement,
} from '../tools/surface';
import {
  createTransformTool,
  gizmoHandlers,
  gizmoPlacement,
  pieceOrigin,
  reattachSig,
  pivotModeSig,
  spaceSig,
  transformStateSig,
} from '../tools/transform';
import { createWorkbenchTool } from '../tools/workbench';
import { toolSig } from '../tools/manager';
import {
  candidateSpots,
  captureSocket,
  wbGizmoModeSig,
  wbMateSig,
  wbSocketSig,
  wbTypeSig,
} from '../state/workbench';
import { toast } from '../state/toasts';
import { genPreviewSig } from '../state/generators';
import { arm, dragTypeSig, placeSig } from '../state/place';
import { surfaceHostSig, surfacePreviewSig, surfaceSig } from '../state/surfaces';
import { contextMenuSig, leftTabSig } from '../state/ui';
import { partMenuItems, viewMenuItems } from '../ui/widgets/ContextMenu';
import { AxisGuide } from './axis-guide';
import { GhostLayer } from './ghost';
import { TransformGizmo } from './gizmo';
import './thumbs';
import { PointsLayer } from './points-layer';
import { SurfaceHandles } from './surface-handles';
import { WorkbenchView } from './workbench-view';

export { getViewport };

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
/** While a part or piece is dragged, sockets show on this many parts nearest the drag (D25). */
const DRAG_PARTS = 12;

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

const selectTool = createTransformTool('select');
const moveTool = createTransformTool('move');
const rotateTool = createTransformTool('rotate');
const paintTool = createPaintTool({
  part: (ndc) => pickPart(ndc)?.part ?? null,
  inRect: partsInRect,
  inDisc: partsInDisc,
});
const connectTool = createConnectTool();
const placeTool = createPlaceTool();
const pointTool = createPointTool();
const workbenchTool = createWorkbenchTool();
const pickTool = createPickTool();
const surfaceTool = createSurfaceTool();

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
  registerTool(placeTool);
  registerTool(pointTool);
  registerTool(workbenchTool);
  registerTool(pickTool);
  registerTool(surfaceTool);
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
  const handles = new SurfaceHandles();
  scene.add(handles.group);
  /** What Generate or Create would add to a picked part, drawn see-through; made with the assets. */
  let preview: PartsLayer | null = null;
  const outline = new Outline();
  const guide = new AxisGuide();
  scene.add(guide.line);
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
   * points near the camera; none during a transform, only the target's during a drag re-attach. Where
   * the selected parts hang (their parent socket or point) is always drawn, in purple.
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
      tool === 'connect' || tool === 'point' || tool === 'place'
        ? nearestParts(doc, poses, rig.camera.position, NEAR_PARTS).filter((id) => !hidden.has(id))
        : null;
    let socketParts: PartId[] = [];
    const drag = reattachSig.value;
    if (state === 'reattach') {
      socketParts = drag ? dragSocketParts(doc, poses, hover, drag, hidden, DRAG_PARTS) : [];
    } else if (state === 'idle' && (tool === 'connect' || tool === 'place')) socketParts = near!;
    else if (state === 'idle') {
      socketParts = [...sel.parts].filter((id) => !hidden.has(id));
      if (hover !== null && !socketParts.includes(hover)) socketParts.unshift(hover);
      // A selected piece also shows the sockets around it: where a drag can join it (D25).
      const [piece] = sel.pieces;
      if (piece) {
        const point = pieceOrigin(poses, cat, doc, piece[0], piece[1]);
        const drag = { point, near: null, moving: sel.parts };
        for (const id of dragSocketParts(doc, poses, null, drag, hidden, DRAG_PARTS)) {
          if (!socketParts.includes(id)) socketParts.push(id);
        }
      }
    }
    const attach =
      state === 'idle' ? poseTargets(doc, cat, [...sel.parts].slice(0, NEAR_PARTS)) : null;
    sockets.update(doc, poses, cat, socketParts, rig, s.maxSockets, attach?.sockets);
    const hostOf = (key: string) => Number(key.slice(0, key.indexOf(':')));
    const hoverPoint = hoverPointSig.value;
    const pointHosts =
      state === 'transform'
        ? []
        : (near ??
          [
            ...new Set([
              ...sel.parts,
              ...[...sel.points].map(hostOf),
              ...(hover === null ? [] : [hover]),
              ...(hoverPoint === null ? [] : [hostOf(hoverPoint)]),
            ]),
          ].filter((id) => !hidden.has(id)));
    const freeOnly = tool === 'connect' || tool === 'place';
    points.update(
      doc,
      poses,
      cat,
      pointHosts,
      rig,
      s.maxSockets,
      sel.points,
      freeOnly,
      attach?.points,
    );
  };

  let markedReady = false;
  const render = () => {
    frame = 0;
    renderer.info.reset();
    grid.update(rig.target, rig.distance);
    follow(rig.camera);
    gizmo.update(rig.camera);
    const wb = inWorkbench();
    if (ctx.layer) {
      ctx.layer.group.visible = ctx.layer.labels.group.visible = !wb;
      ctx.layer.springs.group.visible = !wb;
      ctx.layer.wires.group.visible = !wb;
    }
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
    handles.placeBadges(rig.camera, canvas);
    // The load budget (spec §19.4) is measured to the first frame drawn with the part library loaded.
    if (ctx.layer && !markedReady) {
      markedReady = true;
      performance.mark('grambyedit:first-render');
    }
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
    ghost: null,
    sockets,
    points,
    workbench,
    gizmo: transformGizmo,
    afterRender: new Set(),
    snapshot: () => {
      // Drawn right after a render, while the WebGL drawing buffer still holds the frame.
      render();
      const out = document.createElement('canvas');
      out.width = 192;
      out.height = 144;
      const g = out.getContext('2d');
      if (!g || canvas.width === 0 || canvas.height === 0) return Promise.resolve(null);
      const scale = Math.max(out.width / canvas.width, out.height / canvas.height);
      const w = out.width / scale;
      const h = out.height / scale;
      g.drawImage(
        canvas,
        (canvas.width - w) / 2,
        (canvas.height - h) / 2,
        w,
        h,
        0,
        0,
        out.width,
        out.height,
      );
      return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'));
    },
    onKey: (e) =>
      (e.key === 'Escape' && transformGizmo.cancel()) || toolKey(e) || controls().onKeyDown(e),
    pointer: null,
    request,
    ndc,
  };
  setViewport(ctx);

  const resize = () => {
    const r = el.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    rig.setSize(r.width, r.height);
    guide.setResolution(r.width, r.height);
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

  const toTool = (e: MouseEvent, kind: ToolPointer['kind'], button: number): ToolPointer => ({
    kind,
    button,
    x: e.clientX,
    y: e.clientY,
    ndc: ndc(e),
    shift: e.shiftKey,
    ctrl: e.ctrlKey || e.metaKey,
    alt: e.altKey,
  });
  /** Where the right button went down on the canvas; a press the modal took never sets it. */
  let rightDown: { x: number; y: number } | null = null;
  const onPointerDown = (e: PointerEvent) => {
    canvas.focus({ preventScroll: true });
    if (e.button === 2) rightDown = { x: e.clientX, y: e.clientY };
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
    if (hoverPieceSig.value !== null) hoverPieceSig.value = null;
  };
  const onWheel = (e: WheelEvent) => controls().onWheel(e);
  /** A part card dragged over the view arms the Place tool; its ghost follows, and the drop places it. */
  const dragPointer = (e: DragEvent, kind: 'move' | 'up'): ToolPointer => ({
    kind,
    button: kind === 'move' ? -1 : 0,
    x: e.clientX,
    y: e.clientY,
    ndc: ndc(e),
    shift: e.shiftKey,
    ctrl: e.ctrlKey || e.metaKey,
    alt: e.altKey,
  });
  const onDragOver = (e: DragEvent) => {
    const type = dragTypeSig.peek();
    if (type === null || inWorkbench()) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    const src = placeSig.peek();
    if (src?.kind !== 'part' || src.type !== type) arm({ kind: 'part', type });
    toolPointer(dragPointer(e, 'move'));
  };
  const onDrop = (e: DragEvent) => {
    if (dragTypeSig.peek() === null) return;
    e.preventDefault();
    dragTypeSig.value = null;
    toolPointer(dragPointer(e, 'up'));
  };
  /**
   * A right-click without a drag (a drag is the Studio look) opens the part or view menu. A right press
   * that began in the view opens no other menu, the browser's included, wherever the button comes up.
   */
  const onContextMenu = (e: MouseEvent) => {
    const at = rightDown;
    if (e.target !== canvas) {
      if (!at) return;
      rightDown = null;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    rightDown = null;
    if (!at || Math.hypot(e.clientX - at.x, e.clientY - at.y) > 4 || inWorkbench()) return;
    if (settingsSig.value.cameraScheme === 'studio' && studio.rightDragged) return;
    if (toolSig.value === 'place') {
      toolPointer(toTool(e, 'up', 2));
      return;
    }
    const hit = pickPart(ndc(e))?.part ?? null;
    if (hit !== null && !selectionSig.value.parts.has(hit)) select([hit], 'replace');
    contextMenuSig.value = {
      x: e.clientX,
      y: e.clientY,
      items: hit !== null ? partMenuItems() : viewMenuItems(),
    };
  };
  /** Ctrl turns gizmo snapping on wherever focus is; the other keys reach the viewport through `ctx.onKey`. */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Control' || e.key === 'Meta') transformGizmo.setSnapping(true);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Control' || e.key === 'Meta') transformGizmo.setSnapping(false);
    studio.onKeyUp(e);
  };
  const onBlur = () => {
    rightDown = null;
    studio.releaseAll();
  };
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
  // On the window, so the menu after a look that ends over a panel is caught too.
  window.addEventListener('contextmenu', onContextMenu, true);
  canvas.addEventListener('dragover', onDragOver);
  canvas.addEventListener('drop', onDrop);
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
    } else if (e.kind === 'flip-view') {
      rig.flipView();
      request();
    } else if (e.kind === 'look') {
      rig.lookFrom(e.position, e.target);
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
        scene.remove(
          ctx.layer.group,
          ctx.layer.labels.group,
          ctx.layer.springs.group,
          ctx.layer.wires.group,
        );
        ctx.layer.dispose();
      }
      if (ctx.ghost) {
        scene.remove(ctx.ghost.group);
        ctx.ghost.dispose();
      }
      ctx.layer = new PartsLayer(assets);
      scene.add(
        ctx.layer.group,
        ctx.layer.labels.group,
        ctx.layer.springs.group,
        ctx.layer.wires.group,
      );
      ctx.ghost = new GhostLayer(assets);
      scene.add(ctx.ghost.group);
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
    workbench.setGizmoMode(wbGizmoModeSig.value);
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
    const { parts, pieces, active } = selectionSig.value;
    const hover = hoverSig.value;
    const hoverPiece = hoverPieceSig.value;
    if (!assetsSig.value) return;
    ctx.layer?.highlight(
      parts,
      hover,
      typeof active === 'number' ? active : null,
      pieces,
      hoverPiece,
    );
    request();
  });

  const stopGuide = effect(() => {
    guide.set(modalGuideSig.value);
    request();
  });
  /** The tab whose preview and corners show: none while Paint or Sockets replace the tabs. */
  const shownTab = () => {
    const tool = toolSig.value;
    return tool === 'paint' || tool === 'sockets' ? null : leftTabSig.value;
  };
  const stopPreview = effect(() => {
    const assets = assetsSig.value;
    const tab = shownTab();
    const shown =
      tab === 'generators'
        ? genPreviewSig.value
        : tab === 'surfaces'
          ? surfacePreviewSig.value
          : null;
    if (assets && preview?.assets !== assets) {
      if (preview) {
        scene.remove(preview.group);
        preview.dispose();
      }
      // Its labels stay out of the scene: a preview shows the parts alone.
      preview = new PartsLayer(assets, 0.5);
      scene.add(preview.group);
    }
    if (preview) {
      preview.group.visible = shown !== null;
      if (shown) preview.sync(shown.doc, shown.poses, new Set(), false);
    }
    request();
  });
  const stopHandles = effect(() => {
    handles.update(shownTab() === 'surfaces' ? cornerWorlds() : null, surfaceSig.value.selected);
    request();
  });
  const stopGizmo = effect(() => {
    const tool = toolSig.value;
    const s = settingsSig.value;
    // Move and Rotate serve one selected point too, in its host's axes, like the Point tool.
    const forPoint =
      tool === 'point' || ((tool === 'move' || tool === 'rotate') && selectedPoint() !== null);
    // The Surface tool moves its chosen corners, in the parent's axes.
    const forCorner =
      tool === 'surface' && surfaceSig.value.selected.length > 0 && surfaceHostSig.value !== null;
    // A modal G or R moves the selection away from the gizmo, so it hides until the modal ends.
    // A drag re-attach moves the part away from the gizmo too.
    const on =
      (tool === 'move' || tool === 'rotate' || forPoint || forCorner) &&
      assetsSig.value !== null &&
      !modalActiveSig.value &&
      transformStateSig.value !== 'reattach';
    transformGizmo.handlers = forCorner
      ? surfaceGizmoHandlers
      : forPoint
        ? pointGizmoHandlers
        : gizmoHandlers;
    const mode =
      tool === 'point' ? pointGizmoModeSig.value : tool === 'rotate' ? 'rotate' : 'translate';
    transformGizmo.configure({
      mode,
      // Moves on the world grid follow the world axes, so each handle lands on its grid lines.
      space:
        mode === 'translate' && s.snapToGrid
          ? 'world'
          : forPoint || forCorner
            ? 'local'
            : spaceSig.value,
      steps: { move: s.snapMove, rotate: s.snapRotate },
      individual: !forPoint && !forCorner && pivotModeSig.value === 'individual',
      grid: s.snapToGrid,
    });
    transformGizmo.setEnabled(on);
    const at = !on
      ? null
      : forCorner
        ? surfaceGizmoPlacement()
        : forPoint
          ? pointGizmoPlacement()
          : gizmoPlacement(
              docSig.value,
              posesSig.value,
              selectionSig.value,
              pivotModeSig.value,
              spaceSig.value,
              catalogSig.value,
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
    window.removeEventListener('contextmenu', onContextMenu, true);
    canvas.removeEventListener('dragover', onDragOver);
    canvas.removeEventListener('drop', onDrop);
    canvas.removeEventListener('webglcontextlost', onLost);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    offView();
    stopSync();
    stopHighlight();
    stopGizmo();
    stopPreview();
    stopHandles();
    cancelModal();
    stopGuide();
    guide.dispose();
    transformGizmo.dispose();
    stopWorkbench();
    offDebug();
    studio.dispose();
    blender.dispose();
    gizmo.dispose();
    ctx.layer?.dispose();
    preview?.dispose();
    sockets.dispose();
    points.dispose();
    handles.dispose();
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
