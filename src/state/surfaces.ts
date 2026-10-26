// The Surfaces tab's state (spec §13.11, D22): the parent part, the four corners in its part space, the
// colours, and the GasCaps they make. Corners are editor state only: never in the build or its history.
import { batch, computed, effect, signal } from '@preact/signals';
import { Matrix4 } from 'three';
import type { Catalog, Vec3 } from '../core/catalog-types';
import { cfToMatrix4 } from '../core/cframe';
import { insertSubDoc } from '../core/ops/clipboard';
import { addPlacementSymmetry, rememberSymmetryPlacements } from './symmetry';
import {
  buildSurfaceSubDoc,
  capSize,
  defaultCorners,
  SURFACE_ELEMENT,
  type SurfaceColor,
} from '../core/surfaces/build';
import type { Corners } from '../core/surfaces/tiling';
import { buildCurvedSubDoc, curvedPoseValidator } from '../core/surfaces/build-curved';
import {
  activeSurfacePatchSig,
  resetSurfaceDraft,
  surfaceDraftSig,
  surfaceJobs,
  syncSurfaceQuadCorners,
} from './surface-draft';
import type { SurfaceJobContext } from './surface-worker';
import type { Part, PartId } from '../core/types';
import { setTool, toolSig } from '../tools/manager';
import { cancelPick, startPick } from '../tools/pick';
import { surfacePointFrame } from '../tools/point';
import { posesSig } from './derived';
import { subDocCost, type CostResult } from './generators';
import { previewOnHost, type PartsPreview } from './preview';
import { select } from './selection';
import { settingsSig } from './settings';
import { canEditWorkspace, catalogSig, commit, docSig, workspaceVersionSig } from './store';
import { toast } from './toasts';

/** The most GasCaps one surface may make, as for generated shapes. */
export const MAX_CAPS = 20_000;

export interface SurfaceState {
  /** The parent part, with the type it was picked as. */
  readonly host: { readonly part: PartId; readonly type: string } | null;
  /** In the parent's part space, in order around the edge. */
  readonly corners: Corners;
  /** Where the corners started, for Reset. */
  readonly home: Corners;
  /** The corners the gizmo moves, ascending; empty while none is chosen. */
  readonly selected: readonly number[];
  readonly color: SurfaceColor;
  readonly colorEnabled: boolean;
  /** The caps the last Create made, until the surface changes. */
  readonly created: readonly PartId[] | null;
  readonly createdRevision: number | null;
}

const ORIGIN: Corners = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];

function startState(): SurfaceState {
  return {
    host: null,
    corners: ORIGIN,
    home: ORIGIN,
    selected: [],
    color: { mode: 'single', rgb: settingsSig.value.activeColor },
    colorEnabled: true,
    created: null,
    createdRevision: null,
  };
}

export const surfaceSig = signal<SurfaceState>(startState());
const hostWorkspaceSig = signal<number | null>(null);
const surfaceEditingSig = signal(true);

/** A change to the surface: what Create made no longer matches it. */
function change(patch: Partial<SurfaceState>): void {
  surfaceSig.value = { ...surfaceSig.value, ...patch, created: null };
}

/** The parent while it is in the build as the type it was picked as; null otherwise. */
export const surfaceHostSig = computed<Part | null>(() => {
  const host = surfaceSig.value.host;
  const generation = hostWorkspaceSig.value;
  if (generation !== null && generation !== workspaceVersionSig.value) return null;
  const part = host ? docSig.value.parts.get(host.part) : undefined;
  return part && part.type === host!.type ? part : null;
});

/** How many caps the last Create made, while they are in the build (Undo takes them out). */
export const surfaceCreatedSig = computed<number | null>(() => {
  const ids = surfaceSig.value.created;
  if (surfaceSig.value.createdRevision !== surfaceDraftSig.value.revision) return null;
  const doc = docSig.value;
  return ids && ids.some((id) => doc.parts.get(id)?.type === SURFACE_ELEMENT) ? ids.length : null;
});

/** Starts a pick: the clicked part is the parent, and the corners start on the clicked face. */
export function pickSurfaceHost(): void {
  startPick({
    prompt: 'Click the face the surface starts on. Esc cancels.',
    then: 'surface',
    onPick: (hit) => {
      const cat = catalogSig.value;
      const part = docSig.value.parts.get(hit.part);
      const world = posesSig.value.world.get(hit.part);
      const cap = cat ? capSize(cat) : null;
      if (!part || !world || !cap) return;
      const frame = cfToMatrix4(surfacePointFrame(world, new Matrix4(), hit.point, hit.normal));
      const corners = defaultCorners(frame, cap);
      batch(() => {
        hostWorkspaceSig.value = workspaceVersionSig.value;
        resetSurfaceDraft(corners);
        change({ host: { part: part.id, type: part.type }, corners, home: corners, selected: [] });
      });
    },
  });
}

export function setCorner(i: number, at: Vec3): void {
  setCorners([[i, at]]);
}

/** Moves several corners in one change. */
export function setCorners(moves: readonly (readonly [number, Vec3])[]): void {
  const to = new Map(moves);
  const corners = surfaceSig.value.corners.map((c, k) => to.get(k) ?? c);
  const next = corners as unknown as Corners;
  batch(() => {
    syncSurfaceQuadCorners(next);
    change({ corners: next });
  });
}

/**
 * Chooses corner `i` for the gizmo, alone; with `add` (Shift) it goes in or out of the corners already
 * chosen. Null chooses none (with `add`, it keeps the choice). Choosing changes nothing else.
 */
export function selectCorner(i: number | null, add = false): void {
  const now = surfaceSig.value.selected;
  let selected: readonly number[];
  if (i === null) selected = add ? now : [];
  else if (!add) selected = [i];
  else selected = now.includes(i) ? now.filter((k) => k !== i) : [...now, i].sort((a, b) => a - b);
  surfaceSig.value = { ...surfaceSig.value, selected };
}

export function setSurfaceColor(color: SurfaceColor): void {
  change({ color });
}

export function setSurfaceColorEnabled(colorEnabled: boolean): void {
  change({ colorEnabled });
}

export function resetCorners(): void {
  batch(() => {
    syncSurfaceQuadCorners(surfaceSig.value.home);
    change({ corners: surfaceSig.value.home });
  });
}

export function clearSurface(): void {
  batch(() => {
    resetSurfaceDraft();
    hostWorkspaceSig.value = null;
    change({ host: null, selected: [] });
  });
}

const catalogGenerations = new WeakMap<Catalog, number>();
let nextCatalogGeneration = 1;
export const surfaceJobContextSig = computed<SurfaceJobContext | null>(() => {
  const cat = catalogSig.value,
    host = surfaceHostSig.value;
  if (
    !surfaceEditingSig.value ||
    !activeSurfacePatchSig.value ||
    !cat ||
    !host ||
    surfaceCreatedSig.value !== null
  )
    return null;
  if (!catalogGenerations.has(cat)) catalogGenerations.set(cat, nextCatalogGeneration++);
  const s = settingsSig.value,
    color = surfaceSig.value;
  return {
    revision: surfaceDraftSig.value.revision,
    workspaceGeneration: workspaceVersionSig.value,
    hostId: host.id,
    hostType: host.type,
    catalogGeneration: catalogGenerations.get(cat)!,
    settingsRevision: JSON.stringify([
      s.genPosDecimals,
      s.genRotDecimals,
      color.colorEnabled && color.color.mode !== 'single',
    ]),
  };
});

/** The caps as a sub-doc, or why they cannot be made; null without a parent or right after Create. */
export const surfaceBuildSig = computed(() => {
  const cat = catalogSig.value;
  const host = surfaceHostSig.value;
  const { corners, color, colorEnabled } = surfaceSig.value;
  if (!cat || !host || surfaceCreatedSig.value !== null) return null;
  const s = settingsSig.value;
  if (activeSurfacePatchSig.value) {
    const context = surfaceJobContextSig.value,
      job = surfaceJobs.state.value;
    if (!context || JSON.stringify(job.context) !== JSON.stringify(context)) return null;
    if (job.status === 'error')
      return { ok: false as const, error: job.error ?? 'Surface generation failed.' };
    if (job.status !== 'ready' || !job.result) return null;
    return buildCurvedSubDoc(
      job.result,
      { hostType: host.type, color, colorEnabled },
      cat,
      cat.conventions,
      { posDecimals: s.genPosDecimals, rotDecimals: s.genRotDecimals },
    );
  }
  return buildSurfaceSubDoc(
    { hostType: host.type, corners, color, colorEnabled },
    cat,
    cat.conventions,
    {
      posDecimals: s.genPosDecimals,
      rotDecimals: s.genRotDecimals,
      maxElements: MAX_CAPS,
    },
  );
});

/** What Create would add to the build. */
export const surfaceCostSig = computed<CostResult | null>(() => {
  const cat = catalogSig.value;
  const host = surfaceHostSig.value;
  const built = surfaceBuildSig.value;
  if (!cat || !host || !built) return null;
  if (!built.ok) return built;
  const { limits } = settingsSig.value;
  return {
    ok: true,
    cost: subDocCost(docSig.value, cat, cat.conventions, built.sub, limits, host.id),
  };
});

/** The caps drawn on the parent, for the viewport. */
export const surfacePreviewSig = computed<PartsPreview | null>(() => {
  const cat = catalogSig.value;
  const host = surfaceHostSig.value;
  const built = surfaceBuildSig.value;
  const world = host ? posesSig.value.world.get(host.id) : undefined;
  return cat && world && built?.ok ? previewOnHost(built.sub, cat, world) : null;
});

effect(() => {
  const context = surfaceJobContextSig.value;
  const draft = activeSurfacePatchSig.value,
    cat = catalogSig.value;
  if (!context || !draft || !cat) {
    if (surfaceJobs.state.peek().status !== 'idle') surfaceJobs.cancel();
    return;
  }
  const s = settingsSig.value,
    { color, colorEnabled } = surfaceSig.value;
  const validator = curvedPoseValidator(
    { hostType: context.hostType, color, colorEnabled },
    cat,
    cat.conventions,
    { posDecimals: s.genPosDecimals, rotDecimals: s.genRotDecimals },
  );
  const cap = capSize(cat);
  if (!validator.ok || !cap) {
    surfaceJobs.error(context, validator.ok ? 'This part library has no GasCap.' : validator.error);
    return;
  }
  surfaceJobs.request({ context, draft, cap, calibration: validator.calibration });
});

/**
 * Create: the caps go onto the parent in one history entry and become the selection (one-shot, D22).
 * The corners hide until Undo takes the caps out again.
 */
export function createSurface(): void {
  const cat = catalogSig.value;
  const host = surfaceHostSig.value;
  const built = surfaceBuildSig.value;
  if (!cat || !host || !built?.ok || !canEditWorkspace()) return;
  let ids: PartId[] = [];
  try {
    commit('Create GasCap surface', (d) => {
      const made = insertSubDoc(d, cat, cat.conventions, posesSig.value, built.sub, {
        onto: host.id,
      });
      ids = [...made.values()].filter((id) => id !== host.id);
      ids.push(...addPlacementSymmetry(d, ids));
    });
  } catch (e) {
    toast((e as Error).message, 'warn');
    return;
  }
  rememberSymmetryPlacements(ids);
  select(ids, 'replace');
  surfaceSig.value = {
    ...surfaceSig.value,
    created: ids,
    createdRevision: surfaceDraftSig.value.revision,
    selected: [],
  };
}

/** The Surfaces tab is on show: its tool takes the view while a parent is picked. */
export function enterSurfaceTab(): void {
  surfaceEditingSig.value = true;
  if (surfaceHostSig.value && toolSig.value !== 'surface') setTool('surface');
}

/** The Surfaces tab is hidden: a pick in progress ends, and the Surface tool gives way to Select. */
export function leaveSurfaceTab(): void {
  surfaceEditingSig.value = false;
  surfaceJobs.dispose();
  if (toolSig.value === 'pick') cancelPick();
  if (toolSig.value === 'surface') setTool('select');
}

/** Test helper: no parent, corners at the origin, the active colour. */
export function resetSurfacesForTests(): void {
  batch(() => {
    resetSurfaceDraft();
    hostWorkspaceSig.value = null;
    surfaceEditingSig.value = true;
    surfaceSig.value = startState();
  });
}
