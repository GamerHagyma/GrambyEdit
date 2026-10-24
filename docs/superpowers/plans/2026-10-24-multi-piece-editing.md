# Multi-piece editing: select, move and re-wire one piece — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A click on a Wire end, or on any piece of a multi-piece part, selects just that piece. The gizmo, G and R move or turn only that piece, and dragging it onto a socket joins it, with snapping that is easy to hit. A double-click or an Outliner row selects the whole part.

**Architecture:**
- The selection gains `pieces`, which narrows a selected multi-piece part to one body (D19 "body" = the user's "piece").
- Transforms work on items `{ id, body | null }`:
  - Whole parts go through `applyTransform`, unchanged.
  - Pieces go through a new `transformPiece`, which always stores the piece on a point (rules P1–P5 below).
- The parts layer keeps one flags attribute per body mesh, so the outline and hover show the piece alone.
- During a drag, the view shows the sockets of parts near the drag point. The drop snaps to the nearest socket that accepts the piece, within 20 px.

**Tech Stack:** TypeScript, Preact + signals, three.js, Vitest.

**Spec:** the user's request of 2026-10-24: "wiring and multi part objects are handled as one object, so I cannot place a wire and connect it anywhere … I cannot modify the wiring in the editor." Their answers:
- A click selects that piece alone. The gizmo, G and R act on it; dragging it onto a socket joins it. The Outliner row, or a double-click, selects the whole part.
- A new wire is still dropped whole; its ends are then dragged.

Design record to add: D25, plus §9.3, §11.1, §12.1 and §12.4 of `docs/EDITOR_DESIGN.md`.

## Global Constraints

- **Secrets and docs:** never commit `settings.deepseek.json` or any secret. The user's `docs/*.txt` stay uncommitted.
- **Git:** no push. Commit only when the user asks. Haiku agents never commit.
- **Keybinds:** no browser-reserved Ctrl combinations; Ctrl held = snapping. Every new mouse action goes in the shortcut guide (`ShortcutsDialog`).
- **Style:** match the surrounding code and Prettier (`npx prettier --check src tests scripts`).
- **Done** means `npx vitest run`, `npx tsc --noEmit` and Prettier are clean, and the change is checked in the running editor.
- **Whole-part commands stay whole-part:** Delete, Copy, Duplicate, Hide, Paint, Properties, the ±90° commands, L / Ctrl+L, Outliner rows.
- **Placing a new multi-piece part is unchanged:** the user chose "drop it whole, then drag the ends".
- **A signal joint is never silently broken** (§9.3). Every Wire socket is a `conductor`, so every socket joint of a Wire end is a signal joint.
- A piece is a body of `PartDef.bodies`. The parts are Wire, Switch, Button, RemoteButton, TripWire, Splitter_1–4, RubberBand and Rope. Its own conn is the first non-raw conn on one of its body's sockets (as in `retargetBody`).

## Piece transform rules (decided here)

| case | the piece's own conn | what a gizmo, G or R does |
|---|---|---|
| P1 | on a point | Sets the point's `cframe` so the body lands at `delta · bodyWorld`. A point carries one part (`point-used`), so only this piece moves. |
| P2 | none, and the part has a pose conn on part H | Adds a point on H (H's `mainPartName`) and a conn from the body's first child socket that `canBeChild(…, 'mount')` takes, then applies P1. Refused when no socket takes it: "This piece has no free connection point to mount on." |
| P3 | structural socket joint | Becomes a mount on a new point on the same parent, if that socket can mount once the joint is removed; then P1. Otherwise refused, with `makeFreeMovable`'s wording. |
| P4 | signal joint | Refused, doc unchanged: "`<Type> #n` is wired to `<Type> #m` at this piece. Drag the piece onto another socket to re-wire it." |
| P5 | the part has no conns at all (a root) | Moves the part's layout. Its pieces have no place of their own, so they all move together. |

**Shared details:**
- The new or changed point's frame is `pointFrameFor(hostWorld, Sub(partName), target, childSocketMatrix(type, socket, 'point'), props, conv, piecePivot)`, with `target = delta · bodyWorld(poses, id, body)`. This is the inverse `setWorldPose` already uses, so a reload poses the body exactly there.
- Moving the lead piece also carries every piece that has no conn of its own (D19: such a piece keeps its place next to the lead). In P5 every piece moves. That is expected, not a bug, and the preview must show the same (`pieceBodies`, Task 3).

## Review Focus

1. **The selected piece's part is deleted, or Undo removes it.** `sanitizeSelection` must drop its `pieces` entry. Highlight, gizmo and G must never throw on a stale piece. Test in Task 1; the guards are in Tasks 2 and 4.
2. **G on a wire end that is wired to a socket.** It must be refused with the P4 message, and the doc must stay unchanged, not freed onto a point. Test in Task 3.
3. **A loose wire end moved with G must stay there after export and import.** P2 must store a conn and a point, not only preview them. Test in Task 3: the doc round-trips through `toShareCode` / `parseShareText` and the pose is unchanged.
4. **A Button selected whole, plus the end of a Wire wired to that Button selected as a piece.** The end must follow the Button once. It must not be moved twice, and it must not raise the P4 "wired" refusal. Test in Task 4 (carried items).
5. **Per-body highlight bits are lost when a layer grows** (`PartsLayer.grow`), or a base bit (hidden, approx, painted) is missing on one body. Test in Task 2.

---

### Task 1: Selection by piece (state) — Haiku bundle A

**Files:**
- Modify: `src/state/selection.ts`, `src/ui/panels/Properties.tsx` (`narrow` sets `pieces: new Map()`)
- Modify: any test that builds a `Selection` literal (`npx tsc --noEmit` lists them)
- Test: `tests/state/selection.test.ts` (new)

**Interfaces (produces):**
- `Selection.pieces: ReadonlyMap<PartId, number>`: a selected part listed here is selected by that body only; unlisted parts are whole. Invariant: every key is in `parts`. `EMPTY` has an empty map.
- `selectPiece(id: PartId, body: number, op: 'replace' | 'add' | 'toggle' | 'remove'): void`
  - `replace` → `parts {id}`, `pieces {id → body}`, `points` cleared.
  - `add` → adds `id` with `body`; a part already selected whole stays whole.
  - `toggle`:
    - the same piece is selected → removes `id`;
    - it is selected whole or by another piece → it becomes whole;
    - otherwise → adds it with `body`.
  - `remove` → removes `id` and its piece.
  - `active` follows the same rule as `select`.
  - In `attached` mode it calls `select([id], op)`: the whole part plus its descendants.
- `select(ids, op)`: `replace` clears `pieces`. `add` and `toggle` make the picked ids whole (delete their entries). `remove` deletes them.
- `selectPoints(keys, 'replace')` clears `pieces` with `parts`.
- `sanitizeSelection(doc)` also drops entries whose part is gone or no longer selected.
- `hoverPieceSig = signal<number | null>(null)`: the body under the pointer on a multi-piece part, else null. It is reset wherever `hoverSig` is reset (`resetSelectionForTests`, `sanitizeSelection` when the part is gone).

- [ ] **Step 1: Write the failing tests** in `tests/state/selection.test.ts`:
  - `selectPiece(4, 1, 'replace')` → parts `{4}`, pieces `{4 → 1}`, active 4.
  - Then `selectPiece(7, 0, 'toggle')` → `{4 → 1, 7 → 0}`.
  - Then `selectPiece(4, 0, 'toggle')` → 4 is whole: no entry for 4, 4 still in parts.
  - Then `selectPiece(7, 0, 'toggle')` → 7 is out.
  - `select([4], 'add')` after a piece selection makes 4 whole.
  - `selectPoints(['4:u'], 'replace')` empties `pieces`.
  - `sanitizeSelection` on a doc without part 4 drops its entry.
  - In `attached` mode, `selectPiece` on a part with a posed child selects both, with no entries.
- [ ] **Step 2:** `npx vitest run tests/state/selection.test.ts`. Expected: FAIL, `selectPiece` is not exported.
- [ ] **Step 3:** Implement as above. Then `npx tsc --noEmit` and fix every `Selection` literal it reports.
- [ ] **Step 4:** Run the test file and `npx vitest run tests/state tests/tools`. Expected: PASS.

### Task 2: Per-body highlight (viewport) — Haiku bundle A

**Files:**
- Modify: `src/viewport/parts-layer.ts`; `src/viewport/index.ts` (the `stopHighlight` effect)
- Test: `tests/viewport/parts-highlight.test.ts` (new). It uses the two-body fixture pattern of `tests/assets/textured-geometry.test.ts`: `texturedAssets()` with `Part.bodies` Left/Right.

**Interfaces:**
- Consumes `Selection.pieces` and `hoverPieceSig` (Task 1).
- `Layer.flags: InstancedBufferAttribute[]`: one per mesh; each mesh's geometry gets its own `aFlags`.
  - `sync` writes the base bits (approx, hidden, painted) to every body.
  - `attach`, `grow` and `release` handle every body's attribute.
- `PartsLayer.highlight(selected, hovered, active, pieces: ReadonlyMap<PartId, number> = new Map(), hoveredPiece: number | null = null): void`
  - `FLAG_SELECTED | FLAG_ACTIVE` go on every body of a whole part, and only on body `pieces.get(id)` for a piece.
  - `FLAG_HOVERED` goes on body `hoveredPiece` when it is not null and the hovered part has bodies; otherwise on every body.
  - A body index out of range lights the whole part.
  - `hasHighlight()` stays true while any body carries a highlight bit.
- `stopHighlight` passes `selectionSig.value.pieces` and `hoverPieceSig.value`.

- [ ] **Step 1: Write the failing tests:**
  - With the two-body fixture and one part, `highlight(new Set([1]), null, 1, new Map([[1, 1]]))` sets `FLAG_SELECTED` in the Right mesh's `aFlags` at slot 0, and not in the Left mesh's. Read it via `layer.meshes()[b].geometry.getAttribute('aFlags').getX(0)`.
  - Without the entry, both bodies carry it.
  - A painted part (`RGB` prop) has `FLAG_PAINTED` on both bodies.
  - After syncing 40 parts (the layer grows), part 1's piece bit is still only on the Right mesh.
- [ ] **Step 2:** Run it. Expected: FAIL (the bit is on both meshes).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `tests/viewport` and `tests/assets`. Expected: PASS.

### Task 3: `transformPiece` (core) — Opus inline

**Files:**
- Modify: `src/core/ops/move.ts`, `src/core/pose.ts`
- Test: `tests/core/ops/move-piece.test.ts` (new), on `realCatalog()`

**Interfaces (produces):**
- `pose.ts`: `piecePivot(cat: Catalog, type: string, body: number): Vector3 | undefined`, the body's pivot in part space (today's private `pivots(def)[body]`).
- `move.ts`: `pieceBodies(doc: Doc, cat: Catalog, id: PartId, body: number): number[]`: the bodies a move of `body` carries.
  - Always `body` itself.
  - When `body` is the lead (the body of the part's pose conn), also every body without a conn of its own.
  - Every body for a part with no conns (P5).
- `move.ts`: `transformPiece(d: Draft, cat: Catalog, conv: Conventions, poses: Poses, id: PartId, body: number, delta: Matrix4): Verdict`. Behaviour follows the P1–P5 table.
  - An unknown body gives `{ ok: false, code: 'no-body' }`, as `retargetBody` does.
  - All checks run before any change, so a refusal leaves the draft untouched.
  - Pose conns of other bodies and other parts are never touched.
  - A point that P2 or P3 leaves unused is dropped (`dropUnusedPoint`).

- [ ] **Step 1: Write the failing tests.** Each compares `bodyWorld` before and after (`computePoses`) to 1e-6. On a Wire, body A (index 0) has sockets 1–2 and body B (index 1) has sockets 3–4; on a Button, the base is body 0 (socket 3) and the circle body 1. The setups:
  - **P1:** a root `Part` with two points, and a `Wire` with conns `[3 → point u1, 1 → point u2]`. Moving body A (sockets 1–2) by `T(2, 0, 0)` moves A by exactly that; body B's world is unchanged; the Part has two points still.
  - **P1, rotation:** an Rz(90°) about A's pivot world point turns A to `delta · before`; B is unchanged.
  - **P2:** the `Wire` has `[3 → point u1]` only. Moving A by `T(0, 1, 0)` adds one point on the Part and a conn `1 → point`. A lands at `delta · before`; B is unchanged. The doc round-trips through `toShareCode` / `parseShareText` with the same poses (Review Focus 3).
  - **P3:** a `Button` with conns `[3 → socket Part.6]` (the base on the Part's top). Moving the base by `T(1, 0, 0)` replaces the socket conn with a point on the Part, and the base lands at `delta · before`. The circle has no conn, so it moves with the base (D19); `pieceBodies(doc, cat, button, 0)` is `[0, 1]`.
  - **`pieceBodies`:** on the P1 Wire, `pieceBodies(…, 0)` is `[0]`; on the P5 Wire, `[0, 1]`.
  - **P4:** a `Wire` with `[1 → socket Button.2]`, `Button` base on the Part. Moving A gives `ok: false` with the P4 message, and `transact` returns `patch: null`.
  - **P5:** a root `Wire` with no conns. Moving A by `T(0, 0, 3)` moves its layout; both bodies move by the delta.
- [ ] **Step 2:** Run. Expected: FAIL, not exported.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the file and `tests/core`. Expected: PASS.

### Task 4: Transforms on pieces: sessions, gizmo, G and R — Opus inline

**Files:**
- Modify: `src/tools/transform.ts`, `src/tools/modal.ts`, `src/viewport/index.ts` (the `gizmoPlacement` call gains `cat`)
- Test: `tests/tools/transform.test.ts`, `tests/tools/modal.test.ts`

**Interfaces:**
- Consumes `Selection.pieces` (Task 1), `transformPiece` and `piecePivot` (Task 3).
- `pieceOrigin(poses, cat, doc, id, body): Vector3`: the world point of the body's pivot. An unknown body or pivot falls back to the part's origin, so a stale piece never throws (Review Focus 1).
- `pivotOf(poses, ids, mode, active, originOf?: (id: PartId) => Vector3 | undefined)`: origins come from `originOf`, defaulting to the part origin.
- `gizmoPlacement(doc, poses, sel, mode, space, cat?: Catalog | null)`:
  - pieces count by their `pieceOrigin`; without `cat` they count as whole parts, so existing callers keep working;
  - local space takes the active piece's body rotation.
- `Session.pieces: ReadonlyMap<PartId, number>`, built by `beginSession()`:
  - A whole item moves its part and its `poseDescendants`. A piece item moves the bodies `pieceBodies` lists, and their `bodyDescendants`.
  - A piece item's **anchor** is the part its own conn targets; with no own conn, the part its part's pose conn targets; a root has none.
  - A whole item is dropped when another item moves its part. A piece item is dropped when another item moves its anchor: it follows that part already (Review Focus 4).
- `previewSession` / `cancelSession`: a piece item draws each of its `pieceBodies` with `setBodyPreview(id, b, delta · bodyWorld(b))`, and its descendants through `previewMoving`. Cancel puts the bodies back.
- `finishSession`:
  - one history entry: `applyTransform` for whole items, `transformPiece` for piece items;
  - refusals are toasted together;
  - label: "Move 1 piece" / "Rotate 2 pieces" when all items are pieces; today's label otherwise;
  - `individual` rotation turns each piece about its own `pieceOrigin`.
- `modal.ts` `partsTarget()` takes its pivot and local axes from the same helpers.

- [ ] **Step 1: Write the failing tests:**
  - `gizmoPlacement` for `{ parts {w}, pieces {w → 0} }` sits at A's pivot world point, not the Wire's origin.
  - `beginSession()` with that selection: `moving` excludes a part hanging from body B.
  - `finishSession` with a move commits one entry, and only body A moved.
  - A Button selected whole, plus a piece of a Wire whose end is wired to the Button's output, gives a session whose items are the Button only, and `finishSession` toasts nothing.
  - In `modal.test.ts`, with `baseCatalogSig.value = await realCatalog()` and `fakeViewport({ layer: stub })`, where the stub has `setPreview` and `setBodyPreview` spies: G on a piece selection calls `setBodyPreview` with that part and body only.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `tests/tools`. Expected: PASS.

### Task 5: Clicks pick pieces; a double-click picks the part — Haiku bundle B

**Files:**
- Modify: `src/tools/select.ts`; `src/tools/transform.ts` (the press and click path of `createTransformTool`)
- Test: `tests/tools/select.test.ts`

**Interfaces:**
- Consumes `selectPiece`, `hoverPieceSig` (Task 1).
- `createClickSelect(hasPieces: (part: PartId) => boolean): (hit: { part: PartId; body: number } | null, e: { shift: boolean; ctrl: boolean; x: number; y: number }, now: number) => void`. Each tool makes its own; the closure keeps the last click for the double-click. The returned function:
  - A hit on a part where `hasPieces` is true → `selectPiece(part, body, op)`, with `op` from `clickOp`.
  - A second plain click on the same part within `DOUBLE_MS = 400` and 4 px → `select([part], 'replace')`, the whole part, and the double-click resets.
  - Anything else → `select(ids, op)`, as today.
  - The tools pass `performance.now()`, and a `hasPieces` that reads `catalogSig`: `(cat.parts[type]?.bodies?.length ?? 0) > 1`.
- The Select tool's hover also sets `hoverPieceSig`: the hit's body when the part has pieces, else null. `deactivate` clears it.
- Move tool:
  - a press then release without a drag → its own `createClickSelect` function;
  - a drag that starts on an unselected multi-piece part → `selectPiece(part, body, 'replace')` before re-attaching that body (today it selects the whole part).

- [ ] **Step 1: Write the failing tests** (pure: a fresh `createClickSelect` per test, a stub `hasPieces`, explicit `now`):
  - A click on part 3 body 1 with `hasPieces` true → pieces `{3 → 1}`.
  - A click at `now + 300` on part 3, at the same x and y → whole: no entry.
  - A click at `now + 900` → a piece again.
  - With `hasPieces` false → whole.
  - After a click on part 3 body 1, a Shift+click on part 5 body 0 gives `{3 → 1, 5 → 0}`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `tests/tools`. Expected: PASS.

### Task 6: Socket snapping that is easy to hit while dragging — Opus inline

**Root cause (from the code):**
- During a drag the view shows only the hovered part's sockets (`updateMarkers`: `socketParts = [hover]`).
- `pickSocket` considers shown sockets only, within 12 px.
- So a socket at a part's edge disappears as the cursor slides off the part. A nearer socket that would refuse the piece also shadows a good one: `prefer` only breaks 2 px ties. The drop then falls through to the surface.

**Files:**
- Modify: `src/viewport/raycast.ts`, `src/tools/transform.ts`, `src/viewport/index.ts`
- Create: `src/viewport/drag-sockets.ts`
- Test: `tests/viewport/drag-sockets.test.ts` (new)

**Interfaces:**
- `raycast.ts`: `pickSocketWhere(ndc: Vector2, accept: (s: { part: PartId; socket: SocketId }) => boolean, radiusPx: number): { part: PartId; socket: SocketId } | null`: the nearest shown socket within `radiusPx` that `accept` takes.
- `transform.ts`:
  - `SNAP_PX = 20`.
  - `reattachSig = signal<{ point: Vector3; near: PartId | null; moving: ReadonlySet<PartId> } | null>`.
    - `point` is the last 3D point under the cursor: the snapped socket's world position, or the surface hit.
    - `near` is the last part hovered during this drag.
    - Set by `updateReattach`, cleared on end and cancel.
  - `findTarget` calls `pickSocketWhere` first. Its `accept` holds the checks `findTarget` runs today after picking: not skipped, a child socket `self` found (`bodySockets` for a body, `defaultChildSocket` for a part), `canBeChild(…, 'joint')` and `canBeParent` both ok. Then comes the surface pick, as today.
  - Where `findTarget` sets `hoverSig` to the target part, it sets `hoverPieceSig` to null: a target lights whole.
- `drag-sockets.ts`: `dragSocketParts(doc: Doc, poses: Poses, hover: PartId | null, drag: { point: Vector3; near: PartId | null; moving: ReadonlySet<PartId> }, hidden: ReadonlySet<PartId>, n: number): PartId[]`.
  - Returns `hover`, then `near`, then the `n` parts whose origins are nearest `point`.
  - Never moving or hidden parts; no duplicates.
  - `updateMarkers` uses it in the `reattach` state with `n = 12`.

- [ ] **Step 1: Write the failing tests** for `dragSocketParts`:
  - The hovered and the last-hovered part come first.
  - The nearest parts follow, by distance.
  - Moving and hidden parts never appear.
  - The list has at most `n + 2` entries, without duplicates.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement and wire it.
- [ ] **Step 4:** Run `tests/viewport` and `tests/tools`. Expected: PASS.
- [ ] **Step 5 (browser):** drag a Wire end towards a Button's output from off the Button. It snaps within about 20 px of the marker and joins (the Wire's conn targets `Button.2`). It no longer lands on a surface point.

### Task 7: Docs and shortcut guide — Haiku bundle B

**Files:**
- Modify: `docs/EDITOR_DESIGN.md`, `src/ui/dialogs/ShortcutsDialog.tsx`
- Test: `tests/ui/*shortcuts*` if one lists mouse actions; otherwise none

**Content:**
- **D25 row:** "Multi-piece parts are edited by piece". A click selects the piece; a double-click or an Outliner row selects the part; the gizmo, G and R move a piece by P1–P5; a drag joins sockets with 20 px snapping; whole-part commands are unchanged. Source: user (2026-10-24).
- **§9.3:** the P1–P5 table.
- **§11.1:** the outline and hover can light a single piece.
- **§12.1:** the click / double-click rows.
- **§12.4:** pieces in the gizmo and modal, and refusals.
- **Shortcut guide:** "Double-click a part: select the whole part (multi-piece parts)" and "Click a piece of a Wire, Switch, Button…: select that piece".

- [ ] **Step 1:** Write it.
- [ ] **Step 2:** `npx prettier --check docs src` and `npx vitest run tests/ui`. Expected: clean, PASS.

### Task 8: Verification — Opus inline

- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run format:check`: all clean.
- [ ] Browser, on a Part with a Button and a Light:
  1. Place a Wire (dropped whole).
  2. Click end A: only A is outlined.
  3. G moves A; the other end stays.
  4. Drag end B onto the Button's output: it snaps and joins.
  5. Drag end A onto the Light's input: it joins.
  6. Double-click: the whole Wire is outlined.
  7. An Outliner row selects the whole Wire.
  8. Delete removes the whole Wire, and Undo brings it back.
  9. G on a wired end shows the P4 toast.
  10. Export, then import: the wiring and poses are unchanged.
- [ ] Read the whole diff as a hostile reviewer (Review Focus 1–5).

## Execution

| Who | Tasks |
|---|---|
| Haiku bundle A | Tasks 1–2 |
| Opus inline | Task 3, then Task 4 |
| Haiku bundle B | Tasks 5 and 7 |
| Opus inline | Task 6, then Task 8 |

- Bundle A must land before Tasks 4 and 5. Task 3 can run alongside bundle A.
- Haiku never commits. Opus reviews each bundle's diff and runs the suite before moving on.
