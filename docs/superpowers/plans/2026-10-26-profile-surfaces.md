# Profile Surfaces Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, task by task. Subagents may be used only for verification/review, per the user's instruction. The user authorized implementation on 2026-10-26.

**Goal:** Add optional Bézier edges and ordered profile surfaces made from native GasCaps while preserving the existing four-corner generator.

**Architecture:** Keep the legacy quad path intact. Add a shared bicubic control net and a separate curved tiler, prove native-part feasibility, then connect a worker-backed preview and profiles UI to the existing calibrated creation path.

**Tech Stack:** Existing TypeScript, Three.js, Preact/signals, Vite and Vitest; browser Web Worker. No new dependency.

**Spec:** [Profile surfaces design](../specs/2026-10-26-profile-surfaces-design.md).

**Completion:** Tasks 1–6 implemented and verified on 2026-10-26. The checklist below preserves the original execution plan; the [final verification report](../research/2026-10-26-profile-surfaces-verification.md) records the checks actually performed, native calibration correction, review fix and remaining approximation limits. Work remains local on `codex/profile-surfaces`; publishing is separate.

## Global Constraints

- All geometry is in the parent's part space.
- Keep `tileQuad` and its output unchanged.
- Count all plates, including seam plates, against one 20,000-cap budget.
- Only the resulting ordinary parts are synchronized/exported.
- Drafts, guides and worker messages are local.
- No new dependency.
- Do not build the full Profiles UI until the native GasCap feasibility experiment establishes an acceptable useful range.
- Deployment/publishing is separate from the authorized implementation.

## Review Focus

- Unequal profile spacing and intersecting joins: insertion must preserve shape and Smooth must constrain the entire edge.
- Tight curvature, thick plates and rounded poses: a smooth guide or dense sample grid must not be misreported as gap-free native geometry.
- Workspace/host replacement during generation: matching numeric IDs must not authorize a stale Create.
- Remote edits and symmetry: local drafts must remain private; generated mirrored parts must appear once through the normal transaction.
- Dense control nets and long worker jobs: cancellation, stale results and handles must not freeze navigation or re-enable stale Create.

---

## File boundaries and shared interfaces

New files are deliberately limited to the new geometry, its asynchronous owner and its editor. Do not refactor adjacent tools.

| File | Responsibility |
| --- | --- |
| `src/core/surfaces/patches.ts` | Serializable advanced draft types, validation, evaluation, Coons conversion, exact insertion and continuity-preserving edits. |
| `src/core/surfaces/curved-tiling.ts` | Native-size curved layout, conservative bounds, seams, budget and diagnostics. |
| `src/core/surfaces/build-curved.ts` | Accepted tile frames → calibrated, colored sub-document; no second tiling pass. |
| `src/state/surface-worker.ts` | Worker entry; geometry jobs and cancellation. |
| `src/state/surface-draft.ts` | Advanced draft, draft undo, job lifecycle/revision ownership and worker client. |
| `src/ui/panels/SurfaceCurveEditor.tsx` | Curved-quad/profile controls. |
| `src/viewport/surface-curve-handles.ts` | Dynamic guides, anchors, tangents, selected-profile emphasis and disposal. |

Modify `src/state/surfaces.ts`, `src/ui/panels/SurfacePanel.tsx`, `src/tools/surface.ts`, `src/state/commands.ts`, `src/tools/modal.ts` and `src/viewport/index.ts` only for mode routing and existing creation integration. Reuse the current modal target and gizmo contract; no new modal framework. Keep `src/core/surfaces/tiling.ts` and the uncurved builder behavior intact.

Public names to establish in Task 1:

```ts
type ControlId = string;
type JoinMode = 'smooth' | 'crease';
interface PatchDraft {
  points: Readonly<Record<ControlId, Vec3>>;
  grid: readonly (readonly ControlId[])[];
  uBreaks: readonly number[];
  vBreaks: readonly number[];
  uJoins: readonly JoinMode[]; // interior U breaks
  vJoins: readonly JoinMode[]; // interior V breaks
}
interface PatchSample { position: Vec3; du: Vec3; dv: Vec3 }
type DraftResult = { ok: true; draft: PatchDraft } | { ok: false; error: string };
```

IDs are stable opaque local identifiers, not part IDs. Grid dimensions are `(3*N+1) × (3*M+1)`; breaks are finite, strictly increasing and start/end at 0/1. Transactional editing never mutates the input. `CapSize` remains the existing type from `build.ts`.

### Task 1: Prove guide geometry and continuity

**Files:** Create `src/core/surfaces/patches.ts`; create `tests/core/surfaces/patches.test.ts`.

**Produces:**

- `quadPatch(corners: Corners): PatchDraft`
- `coonsPatch(edges: readonly [Cubic, Cubic, Cubic, Cubic]): DraftResult`, where `Cubic = readonly [Vec3, Vec3, Vec3, Vec3]`, ordered bottom/top/left/right per spec.
- `validatePatch(draft: PatchDraft): string | null` for structural validation; geometric certification belongs to the tiler.
- `evaluatePatch(draft: PatchDraft, u: number, v: number): PatchSample` for valid drafts and parameters in [0,1].
- `evaluatePatchSpan(draft: PatchDraft, uSpan: number, vSpan: number, uLocal: number, vLocal: number): PatchSample` for span-local parameters in [0,1], with derivatives expressed in global U/V units. The tiler uses this for one-sided crease normals. The global evaluator selects the following span at an internal breakpoint and the preceding span at 1.
- `splitPatch(draft: PatchDraft, axis: 'u' | 'v', at: number): DraftResult`; reject endpoints/existing breaks.
- `editPatch(draft: PatchDraft, edit: PatchEdit): DraftResult`; define the tagged move-controls/set-join/remove-section operations here and consume them unchanged later.

- [ ] Write failing tests for exact bilinear equivalence; Coons boundary agreement/direction; analytic derivatives against finite differences; finite/shape validation; stable IDs; no input mutation.
- [ ] Add shape-preserving U/V split tests at 0.2 and 0.73, sampling position/derivatives before/after to 1e-9 on ordinary fixture scales. Test multiple consecutive splits, global breakpoint selection, and explicit one-sided evaluation: equal positions but distinct normals at a Crease, matching derivatives at a Smooth join.
- [ ] Add Smooth tests at unequal intervals and all four boundary controls, both U and V; test a four-patch junction, mixed crease/smooth joins, whole-profile translation, and an incompatible multi-control edit rejected atomically. Test removal minima and explain that removal can change shape.
- [ ] Run `npm test -- tests/core/surfaces/patches.test.ts`; confirm the intended failures, then implement the smallest pure control-net operations.
- [ ] Re-run those tests and `npm run typecheck`; review boundary/invalid-input handling, then commit the geometry unit.

### Task 2: Native GasCap feasibility gate

**Files:** Create `src/core/surfaces/curved-tiling.ts`, `tests/core/surfaces/curved-tiling.test.ts`, and `docs/superpowers/research/2026-10-26-curved-gascap-feasibility.md` when the experiment is run.

**Consumes:** Task 1 draft/span evaluator, existing `CapSize`, real catalog and mounting/round-trip helpers used by the existing surface builder tests.

**Produces:** `tileCurved(draft: PatchDraft, cap: CapSize, options: CurvedOptions): Promise<CurvedResult>`. Options contain a total cap budget, explicit quality thresholds, finite refinement limits, `poseForValidation(frame, tile)` for the staggered/rounded native pose, `cancelled(): boolean`, and `yieldControl(): Promise<void>`. Result is accepted desired frames/global UVs/global tile IDs and diagnostics, or a typed failure: invalid, folded, uncertified, resolution-limit, budget or cancelled. Do not feed reconstructed rounded poses into a second mounting/rounding pass. No partial success on refinement exhaustion.

- [ ] Write the failing fixture tests listed in the spec: flat/skew, crowned roof, cylinder, S-curve, saddle, unequal smooth spans, crease angles and boundary overhang. Add folded, near-singular, crossing-patch and nonfinite cases.
- [ ] Implement bounded control-hull subdivision and a physical-spacing layout. Use shared seam ownership and orientation; do not emit one full cap per tiny subdivision leaf. Check assigned coverage separately from the entire cap's fidelity/intersections.
- [ ] Add dense independent sample checks as regression evidence, plus tests that conservative bounds contain those samples. Verify frames are finite, orthonormal and deterministic; one total budget includes seams. A tiny-cell fixture must not falsely pass solely because its assigned region is small.
- [ ] Round-trip actual native GasCaps through calibrated mounting and configured precision, including multicolor stagger. Render/export the fixture builds; record native mesh gap, overhang/intersection and runtime evidence. An in-game visual check remains explicitly unverified until actually performed.
- [ ] Record numerical quality defaults and supported curvature/crease limits from the experiment. If the useful range is inadequate, stop feature execution here and report the evidence; do not proceed with an unsupported generator.
- [ ] Run `npm test -- tests/core/surfaces/patches.test.ts tests/core/surfaces/curved-tiling.test.ts tests/core/surfaces/tiling.test.ts tests/core/surfaces/build.test.ts` and typecheck; review and commit only after the gate is met.

The exact useful quality thresholds are intentionally an **experimental result**, not a guessed promise in this planning document. The feasibility report becomes a required execution input for subsequent tasks.

### Task 3: Accepted tiles to calibrated parts, asynchronously

**Files:** Create `src/core/surfaces/build-curved.ts`, `src/state/surface-worker.ts`, `src/state/surface-draft.ts`; create `tests/core/surfaces/build-curved.test.ts` and `tests/state/surface-draft.test.ts`; modify `src/state/surfaces.ts` for accepted-result creation.

**Interfaces:**

- `buildCurvedSubDoc(tiles: AcceptedCurvedTiles, spec: CurvedBuildSpec, cat: Catalog, conv: Conventions, opts: {posDecimals: number; rotDecimals: number}): BuildResult` reuses mounting/color helpers and returns the existing surface builder's success/error shape. `CurvedBuildSpec` contains host type, global color settings and coloring enabled.
- Worker request: plain draft, cap size, approved quality/limits, export decimals, stagger policy, serialized host-subpart/child-socket matrices and mounting conventions, and token `{revision, workspaceGeneration, hostId, hostType, catalogGeneration, settingsRevision}`. Construct `poseForValidation` inside the worker using existing pose/rounding functions. Reply echoes the token with result/diagnostics and transferable `Float64Array` desired-pose/UV buffers. No signals, Docs, functions or Three.js instances cross the boundary.
- `surface-draft.ts` owns one worker, one running/latest-pending job, current result, cancellation/disposal, `applySurfaceEdit(edit)`, `undoSurfaceEdit()` and `redoSurfaceEdit()`. Expose a typed current/pending/error preview state to `surfaces.ts`.

- [ ] Write failing calibration/color/precision tests, comparing reconstructed exported world poses with accepted frames. Check global UV colors and stagger at seams, coloring disabled, missing GasCap and missing default mount.
- [ ] Write fake-worker state tests: out-of-order replies, edit/undo while pending, catalog or precision change, host removal/replacement, workspace replacement reusing IDs, worker failure/disposal and cancellation during a long pass. Parent movement within the same workspace must reuse local geometry.
- [ ] Implement transferable replies and cooperative yielding between bounded geometry chunks. Ensure cancelled jobs do not publish progress or accepted output as current.
- [ ] Route advanced preview/Create through the same accepted frames. Disable Create while pending/error; recheck current document cost and permissions at commit time. Do not recompute geometry inside Create.
- [ ] Run the two new test files plus `tests/state/surfaces.test.ts`, `tests/core/surfaces/build.test.ts` and typecheck; review stale-result ownership and commit.

### Task 4: Optional curved edges in the existing quad UI

**Files:** Create `src/ui/panels/SurfaceCurveEditor.tsx`, `src/viewport/surface-curve-handles.ts`, `tests/viewport/surface-curve-handles.test.ts`; modify `src/ui/panels/SurfacePanel.tsx`, `src/tools/surface.ts`, `src/state/commands.ts`, `src/tools/modal.ts`, `src/viewport/index.ts`; extend `tests/ui/panels/surfaces.test.tsx`, `tests/tools/surface.test.ts`, `tests/state/commands.test.ts` and `tests/tools/modal.test.ts`.

**Consumes:** Task 1 Coons conversion; Task 3 advanced draft/result state. Surface tool exports retain their current names and gizmo handler contract; they dispatch to legacy corners or advanced control IDs. Both command enablement and `startModal` query a mode-aware `hasSurfaceControlSelection()` rather than the legacy `surfaceSig.selected` array. Extend the existing surface modal target with an identity/liveness guard, using the same invalidation rules as the draft owner.

- [ ] Write failing tests proving Curve edges defaults off, uncurved Create retains existing frames/counts, straight initial handles reproduce the bilinear guide, eight tangent handles edit boundaries, and toggling off/on preserves the curved draft.
- [ ] Add dynamic-layer tests: increasing/decreasing control counts, selection changes, hiding/leaving the tab, parent transforms, perspective/orthographic picking, and disposal without leftover labels/buffers.
- [ ] Implement curve guides and distinguish anchor/tangent hit targets. Reuse G, Esc, Shift selection and Ctrl world snapping. Guide updates are immediate; pending GasCaps are hidden and labeled Updating GasCaps…; stale counts/Create are disabled.
- [ ] Run new/extended tests plus existing `tests/viewport/surface-handles.test.ts`, `tests/tools/modal.test.ts` and `tests/tools/reference-modal.test.ts`; verify Studio navigation keys are unaffected, then commit.

### Task 5: Profiles, exact insertion and smooth/crease controls

**Files:** Extend `src/ui/panels/SurfaceCurveEditor.tsx`, `src/state/surface-draft.ts`, `src/tools/surface.ts`, `src/viewport/surface-curve-handles.ts` and their tests from Tasks 3–4.

**Consumes:** `splitPatch` and atomic `editPatch`; no second interpolation model or independent profile refit.

- [ ] Write failing UI/state tests for two-profile initialization, Add profile, Add anchor column, selecting/moving an entire profile, numeric coordinates, Smooth/Crease, straightening a segment, and minimum removal limits.
- [ ] Test shape invariance immediately after insertion; stable selection after insertion/removal; one draft undo per drag/field commit; Esc cancel; redo invalidation after a new edit. Global blueprint undo must remain separate.
- [ ] Test retaining both mode drafts and confirming replacement through Start profiles from quad. Invalid/crossed sections must produce a diagnostic and disable Create.
- [ ] Implement the profiles list and selected-profile handle emphasis. Keep matched anchor-column topology; reject arbitrary profile reorderings that reverse/twist correspondence rather than silently sorting by position.
- [ ] Run geometry, state, panel, handle and tool tests; manually shape a hood and crowned roof in both camera projections. Record what was actually verified and commit.

### Task 6: Whole-editor verification and usage

**Files:** Extend `tests/state/surfaces.test.ts`, `tests/state/collaboration-store.test.ts`, `tests/state/symmetry.test.ts`; update `README.md`, `docs/EDITOR_DESIGN.md`, and `src/ui/dialogs/ShortcutsDialog.tsx` where the existing help content lives.

- [ ] Add integration tests for one Create/Undo, new caps attached to a moved parent, latest workspace cost checks, automatic/manual symmetry, and created-preview hiding/restoration after Undo.
- [ ] Prove worker jobs, guide edits and mode changes emit no collaboration document patches; generated parts must be sent through the normal commit exactly once. An incoming remote edit must not cancel an active local draft drag unless its host/workspace becomes invalid.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run format:check`. Re-read the diff for unintended legacy tiler, camera, reference-plane or export changes.
- [ ] Browser-check old Quad, curved Quad and Profiles; test delayed worker/rapid edits, a large supported draft, error recovery, orthographic view and two-client creation. Check count/preview/Create agree. Do not claim an in-game test unless performed.
- [ ] Document profile insertion, tangent editing, Smooth/Crease, draft undo, coloring, local-only guides and the experimentally verified native-part limits. Review and commit the completed integration.

Deployment/publishing is a later integration action, not part of this investigation. The first implementation milestone is a feasibility result, not the full editor.
