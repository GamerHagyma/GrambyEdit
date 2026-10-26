# Profile surfaces and optional Bézier edges

Status: implementation and verification completed on 2026-10-26. See the [final verification report](../research/2026-10-26-profile-surfaces-verification.md) for automated, browser, collaboration and native-game evidence. Publishing is separate.

## Outcome and scope

Extend Surfaces with ordered cross-section **profiles**: for example, several ribs defining a roof's crown, or sections shaping a hood. Each profile can curve between its anchors. Adjacent profiles can meet smoothly or form an intentional crease. Adding a profile gives control across the middle of the surface, as requested; it does not add another vertex to an arbitrary polygon outline.

Keep the existing four-corner workflow. Add optional Bézier boundary controls there, and a separate **Profiles** mode for more complex work. Both produce ordinary GasCaps attached to the chosen parent. Authoring controls stay local, while created parts use existing history, export, collaboration and mirroring behavior.

The guide surface can have mathematically smooth joins. The generated GasCaps remain fixed-size, flat parts: tight curves and exact sharp outer silhouettes cannot be promised without gaps, overlap or overhang. Establish useful limits before building the full editor.

## Verified starting point

| Source | Current behavior and implication |
| --- | --- |
| `src/core/surfaces/tiling.ts` | One bilinear four-corner patch. Its rows and coverage tests rely on straight isoparametric bands. Replacing only its evaluator with a Bézier function would invalidate those assumptions. |
| `tests/core/surfaces/tiling.test.ts` | Dense sampled projected coverage, allowing 0.2 studs of normal displacement; this is not a watertight mesh guarantee. |
| `src/core/surfaces/build.ts` | Uses the real GasCap bounds, calibrated mounting, coloring and a 0–0.015 stud color stagger. These affect seams and must be retained or deliberately accounted for. |
| `meshes/runtime/parts/GasCap.obj` | Bounds are approximately 0.6446 × 0.6446 studs, with 0.1 stud thickness. Current surface generation emits rigid poses, not scaled or clipped plates. |
| `src/core/generators/build.ts` | `mountSubDoc` handles GasCap's calibrated attachment transform. Reuse it for every generated pose. |
| `src/state/surfaces.ts` | Parent-local draft, synchronous preview/cost calculation, 20,000-cap generation ceiling, one Create transaction, symmetry integration. Draft edits are outside blueprint history. |
| `src/viewport/surface-handles.ts` | Four-dot buffers and a straight outline. An advanced handle layer needs dynamic buffers and curve rendering. |
| `src/core/types.ts` | Current defaults: 8,000,000 code characters, 8,000-part soft cap, 16,000-part warning. These are distinct from the generator's hard ceiling. |

These are observations from the repository, not evidence that curved tiling is already feasible.

## Options and decision

1. **Triangulate an N-sided outline.** Useful for perimeter filling, but does not address the requested interior profiles or predictable smooth joins.
2. **Build a general NURBS/CAD editor.** Powerful, but introduces substantially more topology, weights and UI than this task needs.
3. **Loft ordered profiles with piecewise bicubic Bézier patches.** Chosen: local edits, explicit smooth/crease boundaries, and shape-preserving insertion without a new dependency.

Use a shared rectangular Bézier control net underneath a profiles-first UI. Avoid independent patches with duplicated boundary data, and avoid automatic interpolation that refits the entire surface whenever a profile is inserted.

## Interaction

### Four corners

- Default mode and existing controls remain unchanged, with **Curve edges** off.
- Curve edges exposes two tangent handles per boundary: the original corners remain the endpoints. Initial handles sit at one-third and two-thirds of each straight edge.
- A Coons patch interpolates the four cubic boundaries. Straight boundaries reduce to the existing bilinear surface. Route curve-off generation through the existing builder unchanged.
- Turning curves off retains the curved draft for toggling back on; it does not silently delete handles.

### Profiles

Start from the current quad or curved quad. Initially there are two profiles, running from corner 1 to 2 and from corner 4 to 3. Profiles are ordered along the surface; anchors within each profile run across its width.

- **Add profile** inserts a section between two existing profiles. **Add anchor column** inserts an anchor at the same parameter across every profile. Both preserve the current guide shape exactly until edited.
- A profile list controls selection and ordering. Select a whole profile to move its section, or select individual anchors and tangent handles. Show only the selected profile's detailed handles by default.
- Click selects; Shift adds/removes selection; the move gizmo and G move controls; Ctrl uses the existing world grid. Numeric XYZ fields use parent-local coordinates, as existing corners do. Esc restores an unfinished drag.
- **Smooth** and **Crease** apply to interior profile joins and interior anchor columns. Smooth preserves first derivatives across the entire join. Crease preserves the shared edge but permits a normal discontinuity. Straightening a segment resets its handles onto the chord; it is separate from join continuity.
- Removing a profile/column generally changes the shape. Preview the result, forbid removal below two profiles/two anchors, and support **Undo draft edit / Redo draft edit**. One drag or committed field edit is one draft step. Existing blueprint Ctrl+Z behavior stays unchanged.
- Switching modes retains their separate drafts. **Start profiles from quad** explicitly replaces the profiles draft, with confirmation when it already contains edits. No automatic conversion back to four corners.
- Parent, coloring toggle, U/V gradients, code/count warnings and Create remain common controls. U runs across profiles; V runs along their order, with consistent global coordinates across every patch.

Do not add a shortcut that conflicts with Studio camera navigation. Profile insertion is a panel action initially.

## Geometry contract

All geometry is in the parent's part space. The advanced draft contains stable control IDs, a rectangular grid of control IDs, their Vec3 positions, strictly increasing U/V breakpoints spanning [0,1], and Smooth/Crease metadata for internal joins. With M U spans and N V spans the grid has `(3*N+1) × (3*M+1)` entries. Profile curves are grid rows `3*j`; anchor stations are columns `3*i`.

Each 4×4 neighborhood evaluates as a bicubic Bézier patch and provides position and analytic U/V derivatives. Evaluation within an explicitly selected span includes its endpoints and supplies that span's one-sided derivatives at a Crease; tiling must not average the two normals there. A global convenience evaluator chooses the following span at internal breakpoints and the preceding span at the domain maximum. Shared grid entries make adjoining boundaries identical by construction. Tangent handles are grid neighbors of anchors; the remaining controls are stored explicitly, initialized by the starting patch. They are not regenerated from scratch on every edit. Free editing of all interior controls is outside the first UI.

For a Smooth join at shared boundary control P, controls immediately before and after satisfy:

`(P - before) / intervalBefore = (after - P) / intervalAfter`

Apply this to **all four boundary control positions per patch edge**, not only the visible anchor tangents. This gives C1 continuity in the common parameterization. At a Crease, retain common boundary positions and release derivative coupling. Nonuniform intervals matter after insertion.

Edits are atomic control-net transactions. Moving an anchor/profile carries its attached handles so offsets remain predictable. A moved tangent drives its linked opposite tangent when Smooth is enabled; dependent interior controls propagate both U and V constraints. When simultaneous edits constrain both sides, moving the whole linked group preserves offsets; incompatible explicit coordinate assignments are rejected with an explanation, never partially applied. Tests must cover intersecting smooth joins and mixed crease/smooth junctions before this contract is considered implemented.

Insert a profile by de Casteljau splitting every U span at the same V parameter; anchor-column insertion is the transposed operation. Split knots and controls together, preserve existing control IDs where positions remain shared, and create stable IDs for new controls. New joins start Smooth. There is no approximate refit on insertion.

For curved quads, construct a bicubic Coons control net from the four cubic boundaries. Fix boundary directions: bottom 1→2, top 4→3, left 1→4, right 2→3. Conversion into Profiles then preserves the entire guide exactly.

Validation rejects nonfinite input, invalid grids/knots, degenerate spans and folded or near-singular parameterizations. Adaptive subdivision must bound unresolved regions; a sampling pass alone must not certify the absence of a fold. If a region cannot be certified within bounded refinement, report it as unsupported and disable Create. Separate patches that intersect spatially also need a conservative check or an explicit unsupported result.

## Curved GasCap tiling: feasibility first

Keep `tileQuad` and its output unchanged. Develop a separate curved tiler; do not tile every tiny subdivision cell with a full-size GasCap, which would multiply overlap without making the plates bend.

The proposed curved layout uses physical spacing along the surface, shared seam samples, and adaptive Bézier subdivision for conservative error bounds. Choose each rigid cap frame from local tangents. Its assigned coverage region must fit inside the projected native footprint and satisfy a normal-deviation bound. Count all plates, including seam plates, against one 20,000-cap budget.

The **entire native footprint**, its 0.1-stud thickness, coloring stagger and rounded exported pose also require checks. Certifying only a tiny assigned cell would hide plate overhang, intersections and large deviations elsewhere on the cap. More plates cannot automatically fix a radius smaller than a rigid plate can follow.

Across Smooth joins, share boundary sampling, row phase and ownership so patches do not independently double-fill their seam or leave a strip uncovered. Across Creases, split the layout into separate domains and align edge rows where feasible. Do not use one averaged orientation to bridge the two sides. The full plates may overlap across a crease; this is different from promising they fit entirely inside their parameter domain. Report excessive overlap/intersection or unsupported tight angles.

First prove this with the actual GasCap mesh and export round-trip:

- Flat rectangle and skew quad as controls.
- Gentle crowned roof, cylindrical bend, S-curve and saddle.
- Two smooth spans with very unequal lengths, including reversed edge indexing.
- Shallow and tight creases, and a sharp outer boundary.
- Uncolored and multicolor variants, including the existing stagger and low export precision.

Record cap count, sampled gaps, conservative deviation bounds, overhang/intersections, runtime and rendered examples. Use finite, bounded refinement. Any purported success must survive quantized pose reconstruction; distinguish coverage, approximation quality and visual artifacts in the report.

**Gate:** do not build the full Profiles UI until this experiment establishes an acceptable useful range. Choose initial quality thresholds from those results, document them, and expose clear failure diagnostics. If fixed GasCaps cannot achieve acceptable results, narrow the supported curvature/crease range and return that evidence for review. Do not substitute scaled parts or quietly claim seamless coverage. Sharp means an intentional guide crease; it does not promise an exact trimmed GasCap silhouette.

## Preview, creation and concurrency

Advanced tiling runs in a dedicated Web Worker with serializable control-net input and transferable pose buffers. The legacy path remains synchronous. Keep only the latest pending revision; long geometry passes yield in bounded chunks so cancellation can be observed. Reuse one worker, dispose it with the owner, and handle worker failures visibly.

Curves/control handles update immediately. While final cap generation is pending, show the guide with **Updating GasCaps…**, hide stale cap previews, and disable Create/count claims. Mount and calculate final cost only for the latest completed result. The preview and Create use the same accepted frames, never independent approximate builds.

Tag jobs with draft revision, workspace generation, host identity/type and catalog generation. Supply export precision, coloring-stagger policy and serialized host/GasCap mounting matrices so the worker can validate the same rounded poses that creation will produce. Keep the desired frames as the result; reconstructed rounded frames are for validation, not input to a second rounding pass. A host moving in the same workspace only changes the parent-world transform. Host deletion/replacement, document replacement or catalog changes invalidate the result even if IDs are reused. Before Create, recheck identity, revision, current permissions, precision settings and current workspace cost. Remote edits must neither create local draft controls nor trigger a stale generation commit.

Create reuses calibrated `mountSubDoc`, `insertSubDoc`, the current cost checks, and existing symmetry hooks in one normal blueprint transaction. Only the resulting ordinary parts are synchronized/exported. Drafts, guides and worker messages are local. Editing an already-generated surface as a parametric object, cross-session draft persistence, and collaborator-visible guides are out of scope.

## Delivery and acceptance

1. Geometry/tiling feasibility report with real exported GasCaps; agree the supported range from evidence.
2. Optional curved edges for the old four-corner mode, using the same proven advanced geometry pipeline.
3. Profiles, exact insertion and Smooth/Crease editing, with draft undo and dynamic handles.
4. Integration checks: calibrated round-trip, cost, precision, one blueprint undo, symmetry and collaboration; update README/help.

Required compatibility: the uncurved quad tiler and layout remain unchanged; coloring-off still uses native colors; no change to normal part/reference-plane tools; no extra draft fields in share codes or collaboration messages. Execution found and corrected an older shared GasCap mounting error using direct native CFrames; that intentionally supersedes legacy height/axis and exported-point assumptions, as documented in [native calibration evidence](../research/2026-10-26-gascap-native-calibration.md).

Non-goals: arbitrary N-sided holes/branching surfaces, mismatched profile topology, periodic/closed lofts, C2 continuity, NURBS weights, automatic trimming and scaled/clipped GasCaps.

## Mathematical references

- [Bézier surface properties, Michigan Tech](https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/surface/bezier-properties.html): the control-hull property supports conservative subdivision bounds.
- [Bézier surface subdivision, Michigan Tech](https://pages.mtu.edu/~shene/COURSES/cs3621/LAB/surface/subdivide.html): subdivision preserves shape; later independent edits need continuity constraints.
- [Bézier surface joins, NPTEL](https://archive.nptel.ac.in/content/storage2/courses/112102102/mod3/13.htm): shared boundary controls and compatible neighboring rows govern continuity.
- [Coons patch construction, nurbspy](https://turbo-sim.github.io/nurbspy/examples/coons_patch.html): interpolating four boundaries does not independently guarantee smooth joins to another patch.

These references justify the guide representation, not a guarantee that rigid GasCaps can reproduce every such surface.
