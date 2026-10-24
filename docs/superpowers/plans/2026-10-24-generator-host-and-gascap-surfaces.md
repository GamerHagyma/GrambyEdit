# Generator host picker, shape preview and GasCap surfaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Generators tab generate onto a part picked in the build, with a live preview, and add a Surfaces tab that fills four draggable corners with a gap-free grid of GasCaps.

**Architecture:** Three shared pieces carry both features: a one-shot **Pick** tool (click a part, get the hit), `insertSubDoc(…, { onto })` (merge a sub-doc's host into an existing part), and a translucent **preview** `PartsLayer` fed by one signal. The surface is pure math (`core/surfaces/tiling.ts`) turned into a sub-doc by the generators' mount builder, so caps land exactly where previewed.

**Tech Stack:** TypeScript, Preact + signals, three.js, Vitest (+ jsdom for UI).

**Spec:** the user's request of 2026-10-24 (this session) and their answers: the shape centres on the picked part in its own axes; surfaces are one-shot; caps stick out slightly at non-square corners rather than leave gaps. Design record: `docs/EDITOR_DESIGN.md` D21–D22, §12.8–12.9, §13.9, §13.11 (written in Task 10).

## Global Constraints

- Never commit `settings.deepseek.json` or any secret; the user's `docs/*.txt` stay uncommitted.
- No push. Commit only when the user asks. Haiku agents never commit.
- Keybinds: no browser-reserved Ctrl combos; Ctrl held = snapping.
- Match surrounding style: comment density, naming, Prettier (`npx prettier --check src tests scripts`).
- Done = `npx vitest run`, `npx tsc --noEmit`, Prettier clean, and checked in the running editor.
- GasCap size comes from the catalog bbox (0.1 × 0.6446 × 0.6446, thin along X), never hard-coded.
- Generated and surface caps use the generator precision settings (`genPosDecimals`, `genRotDecimals`) and the 20,000-element guard.

## Review Focus

1. **A twisted or tapered surface must show no gaps between caps.** `tileQuad` tests sample the surface densely and require every sample to lie inside some cap's footprint.
2. **A rectangle must stay exactly flush at its edges and use the fewest caps.** A test pins the counts as `ceil(side / cap)` and the outer caps' edges on the corners.
3. **The picked host is deleted, or a new build is loaded, after picking.** The preview and Generate/Create must ignore a host whose id is gone or now holds another type, never draw on the wrong part. Tests cover both cases in `state/generators` and `state/surfaces`.
4. **Corners that cross, coincide or need too many caps.** These give an error line and a disabled Create, never a throw. Tests cover all three.
5. **Undo after Create.** The caps vanish, the corners stay, and changing a corner shows the preview again. A test covers it in `state/surfaces`.

---

### Task 1: Tint helper, mount builder and `insertSubDoc` onto a part (core)

**Files:**
- Modify: `src/core/generators/build.ts`, `src/core/generators/index.ts`, `src/core/ops/clipboard.ts`
- Test: `tests/core/generators/build.test.ts`, `tests/core/ops/clipboard-onto.test.ts` (new)

**Interfaces:**
- Produces, in `build.ts`:
  - `type Tint<A extends string> = { mode: 'single'; rgb: RGB } | { mode: 'gradient'; from: RGB; to: RGB; axis: A } | { mode: 'random'; palette: readonly RGB[]; seed: number }`
  - `type GenColor = Tint<'x' | 'y' | 'z'>`, the same shape as today.
  - `tintColors<A extends string>(tint: Tint<A>, n: number, along: (axis: A, i: number) => number): RGB[]` returns today's `colors` behaviour: gradient endpoints exact over the min…max of `along`, random via mulberry32(seed).
  - `withTintMode<A extends string>(tint: Tint<A>, mode: Tint<A>['mode'], axis: A): Tint<A>` is today's `setColorMode` rule: the first colour carries over, others start white, the gradient gets `axis`, random gets seed 1.
  - `mountSubDoc(cat, conv, host: { type: string; partName: string }, element: { type: string; mount: SocketId }, frames: readonly Matrix4[], tints: readonly RGB[] | null, decimals: { pos: number; rot: number }): Doc`
    - Part 1 is the host, a root with layout identity, holding one point per frame.
    - Parts 2… are the elements, each mounted on its point. Each point frame is `pointFrameFor(I, subPart(host, partName), frame, mountSocket, {}, conv)`, rounded.
    - `frames` are element part frames in host *part* space.
  - `buildGeneratedSubDoc` keeps its signature and behaviour and uses the three helpers.
- Produces, in `clipboard.ts`: `insertSubDoc(d, cat, conv, poses, sub, at: { target } | { root } | { onto: PartId })`. With `{ onto }`:
  - The sub-doc's first root **is** the existing part `onto`. It must be the same type, else throw `insertSubDoc: part ${onto} is a ${type}, not a ${subType}`.
  - The root's points are added to `onto` through `addPoint` with fresh uuids, in sub-doc order. The root's props and conns are dropped.
  - Every other sub part is added with fresh ids, and joints that targeted the root are aimed at `onto`.
  - Other roots go to `poses.world(onto) · layout`.
  - The returned map sends the root to `onto`.

- [ ] **Step 1: Write the failing tests**
  - In `build.test.ts`: `tintColors` gives gradient endpoints `[0,0,0]` and `[255,255,255]` for `along = i`; `withTintMode` carries the first colour over (`single [9,9,9]` → gradient `from [9,9,9]`, `to [255,255,255]`, axis as given).
  - `mountSubDoc` with three identity-rotation frames at x = 0, 1, 2 on a `Connector` host gives four parts. `computePoses` puts each element's world translation at x = 0, 1, 2 (to 4 places).
  - Existing generator tests unchanged.
  - New `clipboard-onto.test.ts`: on `docOf(part(1,'Connector'))` with a generated line of 3 `Part`s:
    - `insertSubDoc(…, { onto: 1 })` leaves 4 parts;
    - part 1 has 3 points with uuids different from the sub-doc's;
    - each new part's `conns[0]` targets `{ kind: 'point', part: 1 }` with one of those uuids;
    - `checkInvariants` passes;
    - each element's world equals `poses.world(1) · subWorld(element)`, with part 1 moved to (5, 0, 0) first.
  - A type mismatch throws `/is a Connector, not a Part/`.
- [ ] **Step 2:** Run `npx vitest run tests/core/generators tests/core/ops/clipboard-onto.test.ts` and see the new tests fail.
- [ ] **Step 3:** Implement the interfaces above. Extract from today's code; no behaviour change for existing callers.
- [ ] **Step 4:** Run the same command: all pass. Run `npx tsc --noEmit`.

### Task 2: GasCap tiling (core math)

**Files:**
- Create: `src/core/surfaces/tiling.ts`, `src/core/surfaces/build.ts`
- Test: `tests/core/surfaces/tiling.test.ts`, `tests/core/surfaces/build.test.ts`

**Interfaces:**
- `tiling.ts`:
  - `type Corners = readonly [Vec3, Vec3, Vec3, Vec3]`, in order around the edge: P0→P1 is U, P0→P3 is V.
  - `interface TileSize { width: number; height: number }`
  - `interface Tile { col: number; row: number; frame: Matrix4 }`
  - `type Tiling = { ok: true; cols: number; rows: number; tiles: readonly Tile[] } | { ok: false; error: string }`
  - `tileQuad(corners: Corners, size: TileSize, maxTiles: number): Tiling`
  - `bilinear(corners: Corners, u: number, v: number): Vector3`
- `build.ts`:
  - `type SurfaceColor = Tint<'u' | 'v'>`
  - `const SURFACE_ELEMENT = 'GasCap'`
  - `const STAGGER = 0.005`
  - `capSize(cat): { width: number; height: number; thickness: number; center: Vec3 } | null`
  - `buildSurfaceSubDoc(spec: { hostType: string; corners: Corners; color: SurfaceColor }, cat, conv, opts: { posDecimals: number; rotDecimals: number; maxElements: number }): { ok: true; sub: Doc; cols: number; rows: number } | { ok: false; error: string }`
  - `defaultCorners(frame: Matrix4, cap: { width: number; thickness: number }): Corners`
    - `frame` is a point-like frame in host part space: +Y is the outward face normal, X and Z lie in the face.
    - It returns a square two caps wide, centred on the frame's origin lifted by `thickness / 2` along +Y: P0 = c − X·w + Z·w, P1 = c + X·w + Z·w, P2 = c + X·w − Z·w, P3 = c − X·w − Z·w. The U × V cross product then points out of the face.

**Algorithm (`tileQuad`).** S(u,v) is the bilinear patch: `(1−u)(1−v)P0 + u(1−v)P1 + uv·P2 + (1−u)v·P3`.
1. Degenerate checks (as built: a bow-tie's diagonal cross product is zero, so corner normals decide):
   - Each corner's normal is (next − corner) × (previous − corner), and N0 is their sum.
   - If every corner normal is ~0, return `The corners are too close together.`
   - If N0 is ~0, or any non-zero corner normal points against it, return `The corners cross over or dent inward; keep them in order around the edge.`
   - Lower bounds: `cols0 = ceil(max(|P1−P0|, |P2−P3|) / width)` and `rows0 = ceil(height / height_tile)`, where the quad's height is |N0| / (2(|P1−P0| + |P2−P3|)).
   - As built, the count search tries rows0 … rows0+3 and grows columns for each (stopping when a cell is too tall, or skewed past a tile along U), keeping the fewest tiles. It falls back to growing both counts. This replaced the first greedy rule, which over-counted rows on tapers.
2. Loop. If `cols·rows > maxTiles`, return `This surface needs more than ${maxTiles} GasCaps.` Otherwise build every cell (col, row):
   - **Cell corners:** Q00 = S(col/cols, row/rows), Q10, Q11, Q01.
   - **Cell axes:** du = (Q10+Q11−Q00−Q01)/2, dv = (Q01+Q11−Q00−Q10)/2, n = du × dv.
     - If |n| ≈ 0, return the same "too close" error.
     - If n·N0 ≤ 0, return `The corners cross over; keep them in order around the edge.`
     - x̂ = n/|n|, ẑ = normalize(du − (du·x̂)x̂), v̂ = x̂ × ẑ (in-plane +V).
   - **Corner offsets:** c = mean of the 4 corners. zs, ys and xs are each corner's offset from c along ẑ, v̂ and x̂.
   - **Fit check:** if span(zs) > width(1+1e-9), set growU. If |(Q01−Q00)·ẑ| or |(Q11−Q10)·ẑ| exceeds width/2, set growV too (the skew term). The same holds symmetrically for span(ys) against height.
   - **Placement:**
     - zA and zB are S(0, vc) and S(1, vc) along ẑ from c, with vc = (row+½)/rows.
     - The soft range is [zA+w/2, zB−w/2], or its midpoint when it is empty.
     - zc = clamp(clamp(mid(zs), soft), max(zs)−w/2, min(zs)+w/2). Coverage wins over the soft range: square edges stay flush, odd corners stick out, and strongly tapered rows pull inward.
     - yc is found the same way from S(uc, 0) and S(uc, 1). xc = mid(xs).
   - **Frame:** `makeBasis(x̂, ẑ × x̂, ẑ)`, positioned at c + ẑ·zc + v̂·yc + x̂·xc. Tiles are row-major.
3. If neither growU nor growV is set, return the tiles. Otherwise grow:
   - on growU, `cols += max(1, ceil(cols·(worstSpanZ/width − 1)))`;
   - on growV, `rows` grows the same way.

**Why it has no gaps:** each tile contains its cell's 4 corners in projection, and every bilinear point is a convex combination of them.

**`buildSurfaceSubDoc`:**
- Error `This part library has no GasCap.` when the catalog lacks it. An unknown host type is allowed (a placeholder carries points under its own name, as for generators).
- Tiling is done with `{ width: z-extent, height: y-extent }`.
- Element frame = `tile.frame · T(−center)`, plus `STAGGER · ((col % 2) + 2·(row % 2))` along X when the colour mode is not `single`.
- Tints come from `tintColors(color, n, (axis, i) => axis === 'u' ? tiles[i].col : tiles[i].row)`.
- It returns `mountSubDoc(..., host = { type: hostType, partName: mainPartName }, element = { type: 'GasCap', mount: defaultMount })`.

- [ ] **Step 1: Write the failing tests** (`tiling.test.ts`, size 0.6446 × 0.6446):
  - A planar 3w × 2w rectangle gives `cols 3, rows 2`. The outer tiles' edges lie on the rectangle's edges (|edge − boundary| < 1e-9), and every frame is orthonormal with X = the rectangle's normal.
  - A 2.5w × 1w rectangle gives `cols 3, rows 1`, with the first and last tiles flush.
  - Coverage: for 40 seeded random quads, half planar and half twisted with heights within ±0.5·side, sample S on a 60×60 grid. Every sample is within some tile: |Δ·Z| ≤ w/2+1e-6, |Δ·Y| ≤ h/2+1e-6 and |Δ·X| ≤ 0.2.
    - Quads come from a jittered square, with side 1–6 caps, in-plane jitter ≤ 0.2·side (keeps corners in order). Every quad must tile `ok`.
  - A symmetric trapezoid (bottom 4w, top 2w, height 2w) is covered. Its bottom and top rows are flush with the bottom and top edges (|edge − boundary| < 1e-9); only the end tiles cross the slanted sides.
  - Errors: coincident corners give the "too close" error; swapping P1 and P2 gives the "cross over" error; `maxTiles = 3` on the 3w × 2w rectangle gives `needs more than 3`.
- [ ] **`build.test.ts`** (real catalog via `realCatalog()`):
  - A 2w square on a `Part` host gives 4 GasCaps.
  - `computePoses(sub)` puts each cap's world equal to its tile frame (positions to 4 places, axes to 4 places).
  - Single colour gives no stagger. Random colours stagger levels 0, 1, 2 and 3 × 0.005 along X.
  - A gradient along `u` gives `from` on column 0 and `to` on the last column.
  - `defaultCorners` returns a 2w square lifted by 0.05 whose U × V points along the frame's +Y.
- [ ] **Step 2:** Run `npx vitest run tests/core/surfaces` and see it fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command: all pass. Run `npx tsc --noEmit`.

### Task 3: Pick tool and preview signal (tools, state)

**Files:**
- Modify: `src/tools/manager.ts` (`ToolId` += `'pick' | 'surface'`)
- Create: `src/tools/pick.ts`, `src/state/preview.ts`
- Test: `tests/tools/pick.test.ts`, `tests/state/preview.test.ts`

**Interfaces:**
- `pick.ts`:
  - `interface PickRequest { prompt: string; onPick(hit: Hit): void; then?: ToolId }`
  - `const pickSig = signal<PickRequest | null>`
  - `startPick(req)`
  - `cancelPick()`
  - `createPickTool(): Tool` (id `'pick'`). Its behaviour:
    - It shows the prompt in `statusHintSig`.
    - Hover sets `hoverSig` to the part under the cursor.
    - A click without a drag (≤ 4 px) on a part calls `onPick(hit)`, then `setTool(then ?? toolBeforePick)`. A click on empty space does nothing.
    - Esc (`cancelPick`) restores the tool from before the pick. Switching tools from the toolbar only drops the request (deactivate clears `pickSig`, the hint and the hover); the user's new tool stays.
- `preview.ts` (imports neither generators nor surfaces state, so there is no import cycle):
  - `interface PartsPreview { doc: Doc; poses: Poses }`
  - `previewOnHost(sub: Doc, cat, hostWorld: Matrix4): PartsPreview`
    - `poses = computePoses(sub, cat, cat.conventions)`, every world and body premultiplied by `hostWorld`.
    - The doc is every part but the sub's first root.
- [ ] Tests:
  - `startPick` switches to `'pick'`, and a stubbed `pickPart` hit calls `onPick` once and returns to the earlier tool.
  - `then: 'surface'` lands on `'surface'`.
  - Esc restores the earlier tool and never calls `onPick`.
  - `previewOnHost` with a translated host moves every element by that translation and drops the host.
- [ ] Implement, run `npx vitest run tests/tools/pick.test.ts tests/state/preview.test.ts`, then `npx tsc --noEmit`.

### Task 4: Generators state: picked host, build, cost, preview, generate

**Files:**
- Modify: `src/state/generators.ts`
- Test: `tests/state/generators.test.ts`

**Interfaces** (all exported):
- `genHostPickSig = signal<{ part: PartId; type: string } | null>(null)`
- `genHostSig` is the picked `Part` while its id is in the doc with the type it had when picked; else null.
- `pickGenHost()` calls `startPick({ prompt: 'Click the part to generate the shape on. Esc cancels.', onPick: hit => set })`.
- `clearGenHost()`
- `genBuildSig` is `buildGeneratedSubDoc(host ? { ...liveRequest, host: host.type } : liveRequest)`, or null without a catalog.
- `subDocCost(doc, cat, conv, sub, limits, onto?: PartId): CostPreview` measures `insertSubDoc` in a scratch transaction. `addParts = partsAfter − partsBefore`.
- `costPreview(doc, cat, conv, req, limits, onto?)` keeps its errors and adds `onto`.
- `genCostSig`
- `genPreviewSig` is `previewOnHost(sub, cat, poses.world(host))` when a host is picked and the build is ok; else null.
- `generate()`:
  - With a host, it runs `commit('Generate ' + SHAPES[shape].label, d => insertSubDoc(…, { onto }))`, selects the new parts and clears the host.
  - Without one, it arms Place exactly as today.
  - It toasts the error if the insert throws.
- [ ] Tests:
  - With host Connector #1 in the doc, `genCostSig` reports `+31 parts`, not 32.
  - `generate()` adds 31 parts, gives part 1 31 new points, selects the 31 and clears the host.
  - A deleted host makes `genHostSig` null and the preview null.
  - A host id reused by another type (via `loadDoc`) is ignored.
  - `genPreviewSig` worlds equal the host world times the sub-doc worlds.
- [ ] Implement, run `npx vitest run tests/state/generators.test.ts`, then `npx tsc --noEmit`.

### Task 5: Surfaces state

**Files:**
- Create: `src/state/surfaces.ts`
- Test: `tests/state/surfaces.test.ts`

**Interfaces:**
- `interface SurfaceState`:
  - `host: { part: PartId; type: string } | null`
  - `corners: Corners`
  - `home: Corners`
  - `active: number | null`
  - `color: SurfaceColor`
  - `created: readonly PartId[] | null` (as built: the caps the last Create made; `surfaceCreatedSig` counts them while they are in the build, so Undo alone brings the preview back; choosing an active corner does not clear it)
- `surfaceSig` starts with no host, all corners at the origin (unused until a pick), no active corner, single colour = the active colour, and `created` false.
- `surfaceHostSig` is the same validity rule as Task 4.
- `pickSurfaceHost()`:
  - It calls `startPick({ prompt: 'Click the face the surface starts on. Esc cancels.', then: 'surface', onPick })`.
  - `onPick` computes the host-part-space frame with `surfacePointFrame(poses.world(part), identity, hit.point, hit.normal)`, so the normal snaps within 10° as for points. It then sets `corners = home = defaultCorners(frame, cap)`, `active = null` and `created = false`.
- `setCorner(i, at: Vec3)`, `setActiveCorner(i | null)`, `setSurfaceColor(color)` and `resetCorners()` each also clear `created`.
- `clearSurface()` drops the host.
- `surfaceBuildSig`, `surfaceCostSig` and `surfacePreviewSig` are null while `created` is set.
- `createSurface()` runs `commit('Create GasCap surface', d => insertSubDoc(…, { onto }))`, selects the caps and sets `created`.
- `enterSurfaceTab()` switches to `'surface'` when a host is set. `leaveSurfaceTab()` cancels a pick and goes back to `'select'` from `'surface'` or `'pick'`.
- [ ] Tests (real catalog, a `Part` host):
  - The pick callback with hit (0, 0.5, 0) and normal +Y gives corners at y = 0.55 spanning x and z ±0.6446.
  - `createSurface` adds 4 GasCaps, selects them and sets `created`, which hides the preview.
  - `undo` removes them.
  - `setCorner` clears `created`, and the preview returns.
  - A crossing corner gives `surfaceBuildSig.ok === false` and makes `createSurface` a no-op.
  - A deleted host nulls everything.
- [ ] Implement, run `npx vitest run tests/state/surfaces.test.ts`, then `npx tsc --noEmit`.

### Task 6: Surface tool, gizmo and handles (viewport)

**Files:**
- Create: `src/tools/surface.ts`, `src/viewport/surface-handles.ts`
- Modify: `src/viewport/index.ts`, `src/viewport/parts-layer.ts`
- Test: `tests/tools/surface.test.ts`, `tests/viewport/surface-handles.test.ts`

**Interfaces:**
- `surface.ts`:
  - `cornerWorlds(): Vector3[] | null` gives the host world times each corner.
  - `cornerAt(ndc): number | null` gives the nearest corner within 12 css px.
  - `surfaceGizmoPlacement()` gives the active corner, turned to the host's axes.
  - `surfaceGizmoHandlers: GizmoHandlers`:
    - `start` remembers the corner;
    - `change` and `end` set the corner to the host-space position of start + world offset (live);
    - `cancel` restores it.
  - `createSurfaceTool()` (id `'surface'`):
    - A click (≤ 4 px) sets the active corner to `cornerAt`, or null.
    - A press on the gizmo is ignored.
    - Esc clears the active corner (returns true only then).
- `SurfaceHandles` (`group`):
  - `update(corners: readonly Vector3[] | null, active: number | null)` draws 4 points (10 px, no depth test; orange when active, white otherwise) and a closed outline.
  - `placeBadges(camera, canvas)` puts the corner numbers 1–4 as HTML badges (`.surface-corner`) beside the points.
  - `dispose()`.
- `PartsLayer` constructor: `(assets, opacity = 1)`. Below 1, every material it creates is transparent at that opacity with no depth writes.
- `index.ts` changes:
  - Register the pick and surface tools.
  - A preview `PartsLayer(assets, 0.5)` is synced by an effect: `genPreviewSig` while the Generators tab is open, `surfacePreviewSig` while the Surfaces tab is, nothing while the tool is `paint` or `sockets` (their panels replace the tabs). Its labels are not added to the scene.
  - Surface handles show while the Surfaces tab is open and a host is set.
  - In the gizmo effect, a `forSurface` branch (tool `'surface'` with an active corner) gets translate in local space with the surface handlers.
- [ ] Tests:
  - `cornerAt` picks the nearest corner within 12 px and null outside, using a stub viewport whose camera projects the corners.
  - Gizmo `change` with offset (1, 0, 0) on a host turned 90° about Y moves the corner by (0, 0, 1) in host space (the inverse turn), and `cancel` restores it.
  - `SurfaceHandles.update` positions 4 points and colours the active one orange.
  - A `PartsLayer` with opacity 0.5 has transparent materials.
- [ ] Implement, run the tests, then `npx tsc --noEmit`.

### Task 7: Generator panel preview renderer (viewport)

**Files:**
- Create: `src/viewport/shape-preview.ts`

**Interfaces:**
- `drawShapePreview(sub: Doc | null, out: HTMLCanvasElement): void`
  - It uses one lazily made offscreen `WebGLRenderer` with alpha and `preserveDrawingBuffer`, sized to `out`, plus a hemisphere light, a sun and an opaque `PartsLayer` from `assetsSig`.
  - The camera looks along (1, 0.8, 1.2) and fits the parts' bounding sphere plus the largest part radius.
  - Each call syncs, renders and draws into `out`'s 2D context.
  - It clears `out` and returns when `sub` is null, the assets are missing or `hasWebGL2()` is false.
- [ ] Checked in the browser in Task 9. jsdom has no WebGL, so the unit tests rely on the no-op path.

### Task 8: Panels (Haiku bundle, after Tasks 1–5 land)

**Files:**
- Create: `src/ui/widgets/ColorFields.tsx`, `src/ui/widgets/ShapePreview.tsx`, `src/ui/panels/SurfacePanel.tsx`, `tests/ui/panels/surfaces.test.tsx`
- Modify: `src/ui/panels/GeneratorsPanel.tsx`, `src/ui/App.tsx` (`LEFT_TABS` += `{ id: 'surfaces', label: 'Surfaces' }`), `src/ui/tokens.css`, `tests/ui/panels/generators.test.tsx`

**Interfaces:**
- `ColorFields<A>({ idPrefix, color: Tint<A>, axes: { id: A; label: string }[], onChange })` is today's colour block moved out unchanged: the same labels (Color mode, Color, From, To, Axis, Palette color N, Remove, Add color, Seed). Mode changes go through `withTintMode(color, mode, axes[0].id)`.
- `ShapePreview({ sub })` is a 240 × 150 `<canvas role="img" aria-label="Shape preview">` redrawn through `drawShapePreview` 150 ms after `sub` changes.
- **Generators panel:**
  - The Host row adds `Pick in build`, which is `aria-pressed` while the tool is `'pick'` and calls `pickGenHost`.
  - With a host picked, the row shows `#<id> <type>` and a `Clear` button, and hides the type picker.
  - The cost and error lines come from `genCostSig`. `ShapePreview` sits under the cost line. Generate calls `generate()`.
  - On unmount the panel calls `cancelPick()` if the tool is `'pick'`.
- **Surface panel:**
  - Loading and "no GasCap" messages.
  - The Parent row: `Pick parent`, or `#<id> <type>` with `Pick again` and `Clear`, plus a hint while unpicked.
  - Four corner rows. Each has a `Corner N` button (`aria-pressed` = active) and X/Y/Z number inputs labelled `Corner N X`, `Corner N Y` and `Corner N Z`, with step 0.05 and values to 3 decimals.
  - `Reset corners`.
  - A status line `C × R = N GasCaps`, or the error as an alert.
  - The cost line.
  - `ColorFields` with axes `u: Corner 1 → 2` and `v: Corner 1 → 4`.
  - `Create`, disabled unless the build is ok.
  - After Create, `Created N GasCaps. Undo to adjust and create again.`
  - On mount the panel calls `enterSurfaceTab`, and on unmount `leaveSurfaceTab`.
- **`tokens.css`:** reuse the `.gen-*` field styles for the surface panel (root class `.surfaces`, same flex column as `.generators`). Add `.gen-preview` (full-width canvas, `--line` border, rounded like fields), `.gen-host-picked`, and `.surface-corner`: an absolutely positioned 18 px round badge like `.point-plus` (`pointer-events: none`), used by the viewport's corner numbers.
- [ ] UI tests mock `src/viewport/shape-preview` (`vi.mock`), since jsdom has no WebGL. The existing generator UI tests pass unchanged. New tests cover:
  - `Pick in build` starts a pick;
  - a picked host shows its label, and `Clear` clears it;
  - Generate with a host commits without arming Place;
  - the Surface panel's pick button, corner fields writing `surfaceSig`, the count line, Create disabled on error, and colour modes.

### Task 9: Integrate and verify in the editor (orchestrator)

- [ ] Run `npx vitest run`, `npx tsc --noEmit` and the Prettier check.
- [ ] In the dev server with `tests/fixtures/kamaz_truck.txt`:
  - Pick a host in Generators, see the live ghost, Generate, then Undo.
  - Pick a parent in Surfaces, then twist and taper the corners by typed values and by the gizmo.
  - Check no gaps at close zoom, colour modes, Create, Undo and re-Create.
  - Take screenshots.

### Task 10: Design record

- [ ] `docs/EDITOR_DESIGN.md`:
  - D21: generator host picker (centre on the part in its axes, direct Generate, panel preview).
  - D22: GasCap surfaces (4 corners, bilinear, overlap to fit, stick out at odd corners, multi-colour stagger, one-shot; corners are editor state only, outside undo).
  - §12.8 Pick, §12.9 Surface, the §13.9 update, §13.11 Surfaces tab, and the §11.1 preview layer.
