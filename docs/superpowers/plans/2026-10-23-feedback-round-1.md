# GrambyEdit feedback round 1 — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 16 problems the user found by hand on 2026-10-23, so imported builds (the user's wheel first) look as they do in game and the editor behaves like the game.

**Architecture:** Two core-model changes carry most of the weight. (1) Multi-piece parts (Wire, splitters, buttons, switches…) get one pose per piece instead of one per part. (2) `Orientation` rotates a part about its own pivot, as the in-game rotate tool does, and the R tool edits `Orientation` instead of converting parts to ephemeral points. The rest are viewport and UI fixes.

**Tech stack:** TypeScript 7, Vite 8, Vitest 5, Preact 10 + signals, three r186 (incl. `three/examples/jsm/lines` for thick lines).

**Spec:** `docs/EDITOR_DESIGN.md` (v1 design). This plan amends §10.2–§10.3 (pose equations), §9.3/D8 (rotation), §11.1 (markers) and §12.2 (Connect arming); Task 9 writes those amendments into the spec.

## Findings (what is wrong and why)

| # | user report | root cause | status | task |
|---|---|---|---|---|
| 1 | 13 parts show no model | 12 have no source mesh at all (`BeachChair, Clipboard, Cone, GlassBase, HulaDoll, Note, PolaroidCamera, Spoiler, Sprite, Toilet, WoodenChair, YibYib`; spec §5.1). `Googie` has a mesh, but its eyes are a texture (`Googie2Tex.png`) and the pipeline ignores textures | verified | needs the user's meshes; textures deferred |
| 2 | circles of Wire/Button/Switch/… must move separately; MatchingGyro is two linked parts | the game poses each **piece** by its own connection; the editor poses the whole part from `conns[0]`. Corpus: 1,600+ multi-connection entries, one conn per piece (`Wire 3+1` ×355, `RemoteButton 1+3` ×276, `Splitter_2 3+5+9` ×268 …). Meshes confirm it: every "connection circle" is a separate 334-face component | verified | T7 |
| 3 | Blender MMB orbit pitches around a far point | `CameraRig.orbitAround` turns the eye by `-(Δpitch)` while the view turns by `+Δpitch`, so pitch pivots on the pivot mirrored behind the camera. Only when the drag starts on a part (that is when a pivot is used) | verified (math) | T2 |
| 4a | no visual axis during G/R + X/Y/Z | the modal shows only text | verified | T4 |
| 4b | gizmo stays behind during G | the gizmo is not told about the modal | verified | T4 |
| 5 | sockets are one-sided flat discs | `SocketsLayer` draws flat rings | verified | T5 |
| 6 | markers stay after undo | **not reproduced**: undo and History jumps both clear them (browser, 2026-10-23) | open | ask the user for steps |
| 7 | part-card tooltip shows corpus usage | `PartCard.hoverText` | verified | T1 |
| 8 | points hard to see, not selectable outside the Point tool, not shown on hover | points draw only for selected parts or in Connect/Point/Place; only the Point tool picks them | verified | T5 |
| 9 | Ctrl+Z / Ctrl+Y do nothing | the router works with the canvas focused (verified by a real key press). It ignores keys while a text field has focus, e.g. right after editing a property | inferred | T1 |
| 10 | Connect places Anchor without the menu | after a picker placement the type stays armed (`armedSig`) until Esc, with no visible sign | verified | T1 |
| 11 | Anchor shows only Orientation Y | a type's props come from the corpus (`props.includes(key)`) | verified | T1 |
| 12 | highlight where a selected part is attached | not implemented | — | T5 |
| 13–14 | Orientation turns about the joint, R about the centre | `R(c)` is applied at the parent socket (spec §10.3 guess); D8 made R convert parts to ephemeral points | verified | T6 |
| 15 | the wheel looks wrong | mostly #2: its Wires are used as flipped spacers between overlapping tires, and each Wire end must be posed by its own conn. Also needs real frames for `Wire`, `Connector`, `ConnectorBall` (approx today) | inferred | T7 + captures |
| 16 | nav gizmo needs ± labels | negative ends have no label | verified | T1 |
| 17 | captured `socket_geometry.json` | 47 types, 88 sockets, captured by the user | — | T3 |

## Decisions (mine; each is reversible)

- **D-F1** `Orientation` is applied **after** mating, about the posed piece's own pivot: `World = Base · T(c) · R · T(−c)`, `Base = World(q) · S(q,b) · M · S(c,a)⁻¹`, `c` = piece pivot in part space (origin for single-piece parts). `conventions.json` gains `orientationPivot: 'part' | 'socket'` (default `'part'`, the user's in-game observation); `'socket'` keeps today's formula. Euler order: `YXZ` since 2026-10-24 (spec D18; inferred from the user's `Part` report, probes P2–P3 confirm).
- **D-F2** R, the rotate gizmo and Properties all edit `OrientationX/Y/Z` for jointed and point-mounted parts, about each part's own pivot. Roots still rotate their layout about the chosen pivot. A selected point rotates its `cframe`. Moves keep D5 (a moved jointed part becomes a point mount). This replaces D8.
- **D-F3** A multi-piece part has a lead piece (the piece of its pose conn) and other pieces. A piece with its own conn is posed by its first such conn. A piece without one keeps its default offset from the lead piece. `Orientation` applies to every piece about that piece's own pivot (its mesh-component centre). The wheel needs this: its flipped Wire ends must flip in place.
- **D-F4** Connect no longer arms the picked type: every click opens the picker (recent types first). Shift+click still gathers several targets.
- **D-F5** Points are first-class in Select/Move/Rotate: click a point marker to select it, then use the gizmo, G/R or Delete. The Point tool still creates points.
- **D-F6** Markers: a socket is a shaded sphere with an outward arrow, coloured by role. A point is a diamond with an outward arrow and a dashed line to its host's centre. A selected part's attach target is purple.

## Global constraints

- `core/` imports nothing outside core, plus three.js math classes only (spec §4).
- Every action stays a registered command; keymap data stays in `state/keymap.ts`; no new Ctrl shortcuts except Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z (user, 2026-10-23).
- Share-code fidelity rules F1–F10 (spec §6.2) are untouched: posing changes how codes look, never what they contain.
- Haiku agents never commit; the orchestrator runs `npx tsc --noEmit -p .`, `npx vitest run`, reads the diff and commits.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review focus

1. A multi-piece part whose pieces form a loop through other parts, e.g. a Switch whose circle drives a Light mounted on its own base: it must pose without W-CYCLE when every piece can be reached.
2. Rotating a jointed part whose `Orientation` already holds values past 360 (1080 in real codes): the result must equal the visual rotation, and the written angles must stay finite.
3. Undo after a piece move or an Orientation edit: the pieces return exactly, with no stale markers or guide lines.
4. A point selected in the Select tool when its host is deleted or the doc is undone: the selection drops it and the gizmo hides.
5. Corpus regression: every code in `tests/fixtures/corpus.ts` still imports, poses with no NaN matrices, and round-trips (F9).

---

### Task 1 (Haiku bundle A): small UI fixes

**Files:** `src/ui/widgets/PartCard.tsx`, `src/viewport/nav-gizmo.ts`, `src/ui/layout/Toolbar.tsx`, `src/ui/icons.tsx`, `src/ui/App.tsx`, `src/ui/panels/Properties.tsx`, `scripts/lib/catalog.ts`, `src/tools/connect.ts`, their tests.

- [ ] Part card hover text: game tooltip and `N sockets` only (drop corpus usage).
- [ ] Nav gizmo: every axis end shows a label, `X+ Y+ Z+` and `X− Y− Z−`, in the axis colour (negative circles get the positive radius and a transparent fill).
- [ ] Toolbar: Undo and Redo icon buttons left of the tool buttons, disabled when `historySig` has no past/future, titles `Undo (Ctrl+Z)` / `Redo (Ctrl+Y)` from `keysFor`.
- [ ] Router: while focus is in a field inside an element with `data-app-undo`, `edit.undo`/`edit.redo` keys blur the field and run the command. The Properties panel root gets `data-app-undo`. Other text fields keep native undo.
- [ ] Catalog build: every type's `props` includes `OrientationX`, `OrientationY`, `OrientationZ` (appended after the corpus keys when missing).
- [ ] Connect: `placeParts` no longer arms the type; remove `armedSig` and its branches (Esc then only cancels gathers, wires and the picker).
- Tests: part-card text; gizmo renders six labels; toolbar buttons enabled/disabled and run undo/redo; Ctrl+Z inside `[data-app-undo] input` undoes, inside a plain `input` does not; `Anchor` lists all three orientation props; two Connect clicks open the picker twice.

### Task 2: orbit pitch

**Files:** `src/viewport/cameras/rig.ts`, `tests/viewport/rig.test.ts`.
- [ ] Failing test: after `orbitAround(pivot, dYaw, dPitch)` the pivot projects to the same screen point (1e-6), for a centred and an off-centre pivot.
- [ ] Fix the sign: `rel.applyAxisAngle(right, this.pitch - pitch0)`.

### Task 3: captured socket geometry

**Files:** `data/socket_geometry.json` (the user's file, verbatim), generated assets.
- [ ] Validate with `importSocketFile` rules, run `npm run assets`, read the merge report (frames outside the bbox by > 0.25 studs, unknown ids). Report anything odd to the user rather than editing their data.
- [ ] Full test suite; fix tests that assumed `approx` frames for now-captured types.

### Task 4: modal feedback

**Files:** `src/tools/modal.ts`, `src/viewport/index.ts`, new `src/viewport/axis-guide.ts`, `tests/tools/keys.test.ts`.
- **Interfaces:** `modalGuideSig: Signal<{ origin: Vector3; dir: Vector3; axis: Axis } | null>` (modal.ts); `modalActiveSig: Signal<boolean>`.
- [ ] While a modal runs, the transform gizmo is disabled (the `stopGizmo` effect reads `modalActiveSig`) and returns on confirm/cancel.
- [ ] X/Y/Z constraint draws a 3 px line (`Line2`) through the pivot along the axis (local axis in local mode), in the axis colour, ±1000 studs, depth-tested off.
- Tests: pressing X during G sets the guide to X world; X again to local; Esc clears it and `modalActiveSig`.

### Task 5: markers, points and attach highlight

**Files:** `src/viewport/sockets-layer.ts`, `src/viewport/points-layer.ts`, `src/viewport/index.ts` (`updateMarkers`), `src/tools/select.ts`, `src/tools/transform.ts`, `src/tools/modal.ts`, `src/state/commands.ts`, tests.
- [ ] Sockets: instanced shaded sphere (icosahedron, detail 1) plus an arrow along +Y, constant screen size, role colours, used = 35% alpha, consumed = red.
- [ ] Points: instanced octahedron plus arrow; free = white, used = grey, selected = orange; a dashed line (`LineDashedMaterial`, dash length in pixels) from each shown point to its host's world centre.
- [ ] Shown points: the hovered part's, the selected parts', selected points' hosts', and in Connect/Place/Point the nearest hosts'.
- [ ] Attach highlight: for each selected part (first 400), its pose target (parent socket or point) is drawn purple even when its host is not otherwise shown.
- [ ] Select/Move/Rotate: a click on a point marker selects the point (Shift toggles). With one point and no part selected, the gizmo and G/R move/rotate the point (reusing `pointGizmoHandlers`), and `edit.delete` calls `requestPointDelete`.
- Tests: `updateMarkers` inputs → attach keys; select tool selects a point; G on a selected point commits `Move point`; Delete on a selected point removes it; undoing the point's creation drops it from the selection and hides the gizmo (Review focus 4).

### Task 6: rotation model (D-F1, D-F2)

**Files:** `src/core/conventions.ts`, `src/core/catalog-types.ts`, `src/core/pose.ts`, `src/tools/transform.ts`, `src/core/ops/move.ts`, `scripts/lib/catalog.ts` (conventions block), tests.
- **Interfaces:** `Conventions.orientationPivot: 'part' | 'socket'`; `mateWorld(at: Matrix4, childSocket: Matrix4, props, c: Conventions, pivot?: Vector3): Matrix4`, where `at` is the parent socket's or point's world frame — the one place `R` is applied (`'socket'`: `at·R·M·S⁻¹`; `'part'`: `at·M·S⁻¹·T(c)·R·T(−c)`); `childWorldViaSocket`, `childWorldViaPoint` and `pointFrameFor` take an optional `pivot`; `orientationFromRotation(m: Matrix4, order): { x: number; y: number; z: number }` (degrees, rounded to 4 places).
- [ ] Failing tests first: with `'part'`, `OrientationY = 90` on a Part over a Part's top socket leaves the child's centre in place and turns it; `pointFrameFor` inverts `childWorldViaPoint` for both pivots; `'socket'` reproduces today's numbers; turning a part that holds `OrientationX = 1080` by 90° about world Y gives the same world matrix as the preview, with finite written angles (Review focus 2).
- [ ] `computePoses` uses `mateWorld`.
- [ ] Rotating a jointed or point-mounted part (gizmo, modal, ±90 commands) commits `OrientationX/Y/Z = euler(Q_local · R_old)`, where `Q_local` is the world turn conjugated into the mating base. Each part turns about its own pivot; roots keep layout rotation about the chosen pivot. The preview uses the same pivots.
- [ ] Remove the rotate path of `makeFreeMovable` (moves keep it).

### Task 7: multi-piece parts (D-F3)

**Files:** `data/curation/pieces.json` (new), `scripts/lib/catalog.ts`, `scripts/lib/pack.ts`, `src/core/catalog-types.ts`, `src/core/pose.ts`, `src/core/graph.ts`, `src/viewport/parts-layer.ts`, `src/viewport/slots.ts`, `src/viewport/raycast.ts`, `src/viewport/bvh.ts`, `src/viewport/ghost.ts`, every caller of `poses.world.get(id)` that multiplies a socket frame, `src/core/ops/move.ts`, `src/tools/transform.ts`, tests.
- **Data:** `pieces.json` per type: `{ "<piece>": { "sockets": ["1","2"], "anchor": [x,y,z] } }`. The first piece listed is the default lead: a root part's layout places it, and a part's pieces without conns hang off the lead. Covers Wire, Splitter_1–4, Switch, Button, RemoteButton, TripWire, PressurePlate, MatchingGyro, RubberBand, Rope, Joint. Anchors come from the mesh-component analysis; socket→piece follows roles (base = mount socket, circle = signal sockets), confirmed for Button by the user's capture. Uncaptured circle sockets get frames on the circle's bottom (child, −Y) and top (parent, +Y), the pattern the Button capture shows; they stay `approx`.
- **Mesh:** the build assigns each connected component to the piece with the nearest captured socket, else the nearest anchor, and stores `pieces: { [piece]: { start, count, pivot } }` per mesh (triangles reordered so each piece is contiguous).
- **Interfaces:** `PartDef.pieceOf: Record<SocketId, PieceId>`, `PartDef.pieceList: PieceId[]` (empty = single piece); `Poses.pieces: ReadonlyMap<PartId, ReadonlyMap<PieceId, Matrix4>>`; `socketWorld(poses, cat, doc, part, socket): Matrix4`; `pieceWorld(poses, part, piece): Matrix4`.
- [ ] Failing tests first: the wheel (`docs/wheel.txt`) poses Wire ends independently (end A at Tire #1's socket 2, end B at Tire #11's socket 2); a Switch whose circle sits on a Light mounted on its own base poses without W-CYCLE; corpus: no NaN, fewer W-CYCLE parts than today.
- [ ] Piece-level pose order: nodes are (part, piece); a piece's parent is the piece owning its target socket (points: the host's lead piece); unposed pieces hang off their lead piece. Existing loop anchoring applies to piece nodes.
- [ ] Rendering, picking and the ghost use per-piece instances; outline and highlight cover all pieces of a part.
- [ ] Move tool drag on a non-lead piece re-attaches that piece only (`retargetPiece` op); the gizmo and G move the lead piece as today. Test: undo after a piece re-attach restores every piece's world matrix exactly (Review focus 3).

### Task 8: Generators panel (plan Task 38)

**Files:** `src/ui/panels/GeneratorsPanel.tsx`, `src/state/generators.ts` (Haiku Q, done), mount point, `src/ui/tokens.css`.
- [ ] Review Q's code against the Task 38 brief; mount the panel as the brief says; add CSS; browser check; commit.

### Task 9: verification and spec

- [ ] Browser: the wheel against the user's in-game picture (after their captures), multi-piece parts, markers, modal guide, orbit, Ctrl+Z after a property edit.
- [x] Spec amendments: §10.2–§10.3 (D-F1, D-F3), D8 → D-F2, §11.1 markers (D-F6), §12.2 arming (D-F4), keymap note on Ctrl+Z/Y.
- [ ] Full suite, typecheck, commit per task.

## Needs the user

1. Workbench captures: `Wire`, `Connector`, `ConnectorBall` (the wheel), then `Switch`, `RemoteButton`, `TripWire`, `PressurePlate`, `Splitter_1`–`Splitter_4`, `MatchingGyro`, `RubberBand`, `Rope`, `Joint`.
2. Meshes (OBJ + MTL, like the existing ones) for the 12 parts that have none, if they can be exported.
3. Calibration probes P2/P3 (Workbench → Calibration) with the SteeringGyro trick, to settle the Euler order.
4. ~~Exact steps for the leftover markers after undo.~~ Likely cause found and fixed (a marker set that grew left its old meshes in the scene); report it if it still happens.
