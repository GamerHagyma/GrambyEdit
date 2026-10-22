# GrambyEdit — editor system design (v1)

| | |
|---|---|
| Status | **Approved 2026-10-22**, with post-approval additions D15–D17 (Appendix C) |
| Date | 2026-10-22 |
| Scope | A 3D blueprint editor for Road to Gramby's share codes, deployed as a static GitHub Pages site |
| Inputs | `docs/RTG_BLUEPRINT_FORMAT.md` (the spec), `data/*.json`, `meshes/`, `vendor/`, the user's answers of 2026-10-22 |
| Next step after approval | Task-level implementation plan (superpowers:writing-plans), executed by Haiku 5.5 subagents + inline work |

Claim labels used below: **verified** (ran it or read it in this repo), **spec** (marked VERIFIED/CORPUS in the format spec), **user** (your in-game tests), **inferred**, **guess**.

---

## 0. Bottom line

1. One static web app: TypeScript, Vite, three.js, Preact. No backend; editing, export and storage all run in the browser.
2. The share code stays the single source of truth. Any code imports losslessly, is edited as a graph of parts, joints and ephemeral points, and exports as a valid code. The 3D view is a computed preview. Placement only enters the code through ephemeral-point `cframe`s and `Orientation` props, exactly as in the game.
3. Every must-have tool and feature ships by milestone M3 (§21). Tier-1 quality-of-life additions ship inside v1; tier-2 ones are out of scope (§16, D16).
4. Spatial accuracy depends on two inputs. First, socket positions, which you capture with the editor's own **Socket Workbench** (§12.7, D15) using per-part probe codes. Second, three conventions that one round of in-game probes settles (§10.4). Until then, parts on unknown sockets render at approximate, clearly flagged positions. Graph editing and export are exact regardless.
5. The architecture is cut for Haiku subagents. Pure core modules sit behind frozen contracts with tests. The math, the 3D viewport and the integration work stay inline (§21).
6. Two data bugs must be fixed first (§5.4, §24): socket roles in the catalog conflict with 34% of real logic joints, and the Godot-derived Part socket rotations are transposed.

### 0.1 Where each requirement lives

| your requirement | design |
|---|---|
| Auto paint / region paint (all four meanings) | §12.5 |
| Multi-selection color, move, rotate, property changes (props apply only where they exist) | §12.4, §12.5, §13.3 |
| Visualise connection points; click one, choose a part, it's placed | §11.1, §12.2 |
| Select individual parts vs part + children | §12.1 (D7) |
| Free ephemeral points: place, move, rotate on a parent part | §12.3 |
| Load creations from code + edit; generate an export code | §6, §13.7 |
| Code-length limit bar with 2 decimals | §13.5 (D3) |
| Shape generators parented to one connector by ephemeral points | §15 |
| Favourite parts | §13.1 |
| Save creations locally, export, append as parts | §13.8, §14 |
| Part-type list with counts and percentages | §13.4 |
| Minimal professional look; Blender controls + optional Studio WASD | §11.3, §17, Appendix A |
| GitHub Pages deployment | §20 |
| Gather connection-point data with a visual tool (post-approval request) | §12.7 (D15) |

---

## 1. Intent

**Who:** Road to Gramby's builders, starting with you: you build large logic and structural creations (the 2,385-part MNIST classifier) and reverse-engineered the format.

**Why:** the in-game builder is slow for large or precise work, and neither bundled tool edits real codes in 3D. `vendor/rtg-preview` only previews, and can seat children only on the 2 part types that carry `LocalPoints` (one of them a placeholder). `vendor/grambys-workshop` supports only the generic `Part`.

**Success looks like:**
- You paste any code, see it in 3D, change it with Blender-grade controls, and paste the exported code into the game. It spawns as expected.
- Big jobs become fast: painting regions, editing 500 mags at once, generating shapes, and reusing saved sub-builds as parts.
- You always know where you stand against the game's limits.

### 1.1 Goals
- Lossless import and export of every real code (the 185-code corpus round-trips).
- Every must-have from the brief (§12–§15), behaving the way the game does ("mirror the game" move rule).
- Clean, minimal, professional UI with Blender-style controls and an optional Roblox-Studio WASD scheme.
- Smooth at 16,000 parts (the largest you spawned); comfortable at 8,000 (your recommended soft cap).

### 1.2 Non-goals (v1)
- Physics simulation, server storage, accounts, real-time collaboration.
- Textured, photoreal rendering. The look is clean flat-shaded parts with game colors.
- Phone layouts. The editor is desktop-first; tablets with a mouse are tolerated.
- Localisation (English only; strings are kept simple so this can be added later).
- Logic or live simulation, and every other tier-2 item in §16 (D16).

### 1.3 Anti-goals (failure even if it "works")
- Exporting a code the game rejects ("Build inválida"), or one that tears in-game (mount + partner-face joint, spec §3.1), without a blocking warning.
- Silently dropping or rewriting data from an imported code: unknown props, uuids, joint order, external references.
- Presenting guessed positions as exact.
- Moves that silently break logic wiring (§9.3).

---

## 2. Ground truth that drives the design

| fact | source |
|---|---|
| `code = base64(JSON)`, `entry = [name, connections, props]`, `connection = [child_socket, parent_socket \| "{uuid}", parent_index_1based]` | spec §1–§3 |
| Only the child stores a joint; a part's **first** connection sets its pose | spec §3, §5.2 |
| Ephemeral points live in the host's `props.EphemeralAttachments` as `{uuid: {partName, cframe[12]}}`; `cframe` is host-local, rotation row-major | spec §7; community "CONFIRMED" host-relative |
| Forbidden: a socket number in two joints; a parent circle with two children; an ephemeral mount plus any joint on the same piece (the tearing failure) | spec §3.1 (corpus 185/185; tearing reproduced in-game) |
| Both faces of one piece with ordinary joints is normal (69.2% of real builds) | spec §3.1 |
| The loader strictly validates structure (child sockets, indices, uuids) and ignores unknown prop keys | spec §11 (community) |
| Real codes: median 4,460 chars, max 98,352; 94.7% of entries have exactly one connection | verified (corpus scan) |
| Code limit: ~8,000,000 base64 chars spawned; 10,000,000 froze the server and never spawned | user |
| Part limit: 16,000 parts spawned but was "really really laggy" (minutes); advise a soft cap of ~8,000 | user |
| 132 parts in the catalog, 120 with meshes; 387 sockets, 104 with semantic names (the README and spec still say 133 / 121) | verified |
| Socket geometry: you are capturing full CFrames for every part's connection points | user |
| three.js, Roblox and Godot are all right-handed and Y-up; meshes are in studs, 1:1 | spec §10 + mesh bboxes (**verified**); handedness per the engines' docs |

---

## 3. Decision log

| # | decision | by | why |
|---|---|---|---|
| D1 | Static SPA: TypeScript (strict) + Vite + three.js + Preact with `@preact/signals`; Vitest; Playwright for a few smoke tests | me | Preact is React's API at ~4 KB, which Haiku writes fluently. Signals let panels and the viewport subscribe to exact slices of state. three.js is the de-facto WebGL library and matches the vendor preview. |
| D2 | Saved creations live in **IndexedDB**, not cookies; small prefs in `localStorage`; export/import as files | me (correction) | A cookie caps at ~4 KB; the median real code is 4.5 K chars and yours reach 607 K. IndexedDB is equally local and private and holds hundreds of MB. |
| D3 | Limits: **code 8,000,000 base64 chars = 100%**; **parts soft cap 8,000**, "beyond tested" at 16,000. All three are editable in Settings | user | Your in-game measurements. Two meters, because part count binds first for normal builds and code length for ephemeral-heavy ones (§13.5). |
| D4 | Paint: bucket fill, box/brush region, part + everything attached, auto-color new parts — all four | user | |
| D5 | Move rule: **mirror the game.** Drop on a free socket makes a socket joint; drop on a surface makes an ephemeral point there; gizmo moves turn a socket-joined part into an ephemeral point on its current parent | user | §9.3 adds one safety rule: moves never silently break signal wiring. |
| D6 | Socket data is captured in the editor's Socket Workbench (§12.7) as full frames relative to each part's pivot, stored **outward** (+Y points out of the part) | user + me | In-game extraction proved hard (user, 2026-10-22). Contract in Appendix B. |
| D7 | "Part + children" = the part plus its **pose descendants** (parts whose position hangs off it through first connections) | me | It is what moves when the part moves, and it is defined even with cycles and multi-connection relays. Everything joint-connected is a separate command (`Ctrl+L`). |
| D8 | Free-rotate gizmo converts like D5. **Native rotation** (Orientation props for socket-joined parts) is available through ±90° commands and numeric fields | me | Both are representable in the format; the gizmo needs arbitrary angles, while in-game style rotation uses Orientation props. |
| D9 | Root positions are editor-only (stored in the library, never in the code) | format | The format has no field for a root's position. |
| D10 | Deleting a part also deletes the ephemeral points its own joints used; points you created and never used survive until deleted | me | Mirrors the game, which appears to remove points when parts detach: 46 corpus parts carry an emptied `EphemeralAttachments: []` (**inferred**). |
| D11 | Export writes sockets as strings, indices as ints, empty props as `[]` | spec | Matches the game and your generator. |
| D12 | Undo/redo stores part-level patches, not whole snapshots | me | Snapshots of a 16K-part map × 500 steps would cost hundreds of MB (§9.1). |
| D13 | The app lives at the repo root next to the research folders; generated assets are built in CI, not committed | me | Standard Vite layout. Avoids binary churn in git. |
| D14 | Run the 3D pose solver in float64 on the main thread; move work to a Worker only if the perf budget (§19.4) fails | me | Simplest design that meets the budget on paper. Measured at M1. |
| D15 | **Socket Workbench:** an in-editor tool generates per-part probe codes (a colored marker stick on every socket); you click each marker's spot on the part mesh; it exports `data/socket_geometry.json` | user ("use the visualizer to gather that data") + me | Turns the missing dataset into roughly 1–2 minutes per part, prioritised by corpus usage. Captured frames apply live from local storage before they are committed. |
| D16 | v1 only: logic/live simulation and every tier-2 item are out of scope | user | |
| D17 | Repo `GrambyEdit`; Mumble Games credited as owner of the game assets; mostly private use | user | Free GitHub Pages needs a public repo (§20). |

---

## 4. Architecture

```
            build time (Node, CI)                                runtime (browser)
 ┌───────────────────────────────────┐        ┌──────────────────────────────────────────────────┐
 │ data/part_catalog.json            │        │  ui/ (Preact panels, dialogs, toolbar)           │
 │ data/props_schema.json            │        │        ▲ signals            │ commands           │
 │ data/socket_geometry.json (yours) │ assets │        │                    ▼                    │
 │ data/corpus/wiki_codes.txt        ├───────►│  state/ (doc, history, selection, settings,      │
 │ meshes/rtg-format/*.obj           │ build  │          derived: poses, issues, stats, meters)  │
 │ meshes/workshop/*/*.mtl           │        │        ▲                    │                    │
 │ data/curation/*.json              │        │  tools/ (select, connect, point, move,           │
 └───────────────────────────────────┘        │          rotate, paint, place) ◄── viewport/     │
          │                                   │        │                         (three.js)      │
          ▼                                   │  core/ (pure TS: codec, doc, rules, graph, ops,  │
 public/assets/{catalog.json,                 │         pose, conventions, stats, generators,    │
   parts.bin, parts.json, version.txt}        │         signal, prefab, size)                    │
                                              │  storage/ (IndexedDB, localStorage)              │
                                              └──────────────────────────────────────────────────┘
```

Dependency rule: `core` imports nothing from the other layers. It may import three.js **math classes only** (`Vector3`, `Quaternion`, `Matrix4`, `Euler`) so it stays testable in Node. `state` imports `core`. `viewport` and `tools` import `state` + `core`. `ui` imports `state` + `core`. Its only viewport import is `viewport/index.ts` (`mountViewport(el)`); everything else goes through `state` (for example `state.view.frameSelection()` requests).

### 4.1 Source tree (file ownership is how parallel subagents avoid collisions)

```
package.json  vite.config.ts  tsconfig.json  index.html  .github/workflows/{ci,pages}.yml
scripts/      build-assets.ts  obj.ts  mtl.ts  pack.ts  catalog.ts  sockets.ts   (Node, run via tsx)
data/curation/categories.json  prop-meta.json  roles-fix.json  part-names.json  paint-groups.json
src/
  core/   types.ts  codec.ts  doc.ts  invariants.ts  rules.ts  graph.ts  size.ts  stats.ts
          uuid.ts  cframe.ts  conventions.ts  pose.ts  signal.ts  prefab.ts  catalog-types.ts
          ops/{transact.ts,parts.ts,conns.ts,points.ts,move.ts,props.ts,paint.ts,clipboard.ts}
          generators/{index.ts,line.ts,grid.ts,box.ts,ring.ts,cylinder.ts,sphere.ts,cone.ts,
                      torus.ts,arc.ts,helix.ts,stairs.ts,text.ts}
  state/  store.ts  history.ts  selection.ts  settings.ts  derived.ts  keymap.ts  commands.ts
  assets/ load.ts  geometry.ts  thumbnails.ts
  storage/ idb.ts  library.ts  autosave.ts  prefs.ts  bundle.ts
  viewport/ index.ts  renderer.ts  scene.ts  parts-layer.ts  sockets-layer.ts  points-layer.ts
            outline.ts  id-pass.ts  bvh.ts  raycast.ts  grid.ts  nav-gizmo.ts  ghost.ts  gizmo.ts
            cameras/{blender.ts,studio.ts}
  tools/  manager.ts  select.ts  connect.ts  point.ts  transform.ts  modal.ts  paint.ts  place.ts
  ui/     App.tsx  tokens.css  icons.tsx  layout/  toolbar/  panels/  dialogs/  widgets/
tests/    (mirrors src/) + fixtures/
```

---

## 5. Data pipeline (build time)

`npm run assets` (also run before `dev` and `build`, and in CI) executes `scripts/build-assets.ts`. Inputs are committed; outputs go to `public/assets/` and are git-ignored.

### 5.1 Meshes → `parts.bin` + `parts.json`
- Source geometry: `meshes/rtg-format/<Part>/<Part>.obj`. These are pivot-relative: the `Part` mesh is centred at ±0.5, while `Gate-AND` and `Connector` are off-centre, consistent with a pivot that is not the bbox centre (bboxes **verified**; the pivot reading is **inferred**). The workshop OBJs are in world coordinates (**verified**: the workshop `Part` spans x −20.16…−19.16, z −58.84…−57.84), so they are not used for geometry.
- Colors: each OBJ `usemtl` group (e.g. `Handle1Mtl.017` → base `Handle1Mtl`) takes the `Kd` of the same-named material in `meshes/workshop/<Part>/<Part>.mtl`, treated as linear RGB (**guess**, checked visually at M1). If missing, it falls back to neutral grey.
- Per vertex, the pipeline bakes: position (f32×3), normal (f32×3, computed if absent), group color (u8×3), and a paintable mask (u8). The **paintable** group is the one the `RGB` prop recolors: by default the largest-area group whose base name is not `Input*`, `Output*`, `Glass*`, `Screw*` or `Light*`, with overrides in `data/curation/paint-groups.json`.
- Indices are u16 per part (no part comes close to 65,536 vertices). Expected size is about 3 MB raw for the 120 meshes. Quantisation is a later optimisation, done only if load time fails the budget.
- The 12 catalog parts without a mesh (`BeachChair`, `Clipboard`, `Cone`, `GlassBase`, `HulaDoll`, `Note`, `PolaroidCamera`, `Spoiler`, `Sprite`, `Toilet`, `WoodenChair`, `YibYib`) and any unknown type get a generated 1×1×1 placeholder box with a "?" label. `GlassBase` matters: it appears 65× in the corpus.

### 5.2 Catalog → `catalog.json` (runtime, ~150 KB)
Per part type:
```ts
interface PartDef {
  type: string; category: Category; tooltip: string | null; paintable: boolean;
  sockets: Record<SocketId, SocketDef>;   // union of child + parent sides
  childSockets: SocketId[]; parentSockets: SocketId[];
  defaultMount: SocketId | null;          // socket used when mounting on a point / placing (null = root-only part, e.g. Chassis)
  pieces: Record<SocketId, string> | null;
  mainPartName: string;                   // partName written into new points on this host
  subParts: Record<string, CFrame12>;     // sub-piece frames relative to pivot (from your capture; {} until then)
  props: string[];                        // prop keys this type supports (corpus + curation)
  mesh: { id: number; min: Vec3; max: Vec3 } | null;
}
interface SocketDef {
  side: 'child' | 'parent' | 'both'; role: 'input' | 'output' | 'conductor' | 'mount' | 'socket' | null;
  name: string | null; piece: string | null;
  frame: CFrame12 | null; frameSource: 'captured' | 'workshop' | 'approx';
}
```
Also emitted:
- `pairs`: corpus joint frequency per `ChildType.self → ParentType.sock` (2,058 distinct pairs, **verified**). It drives smart defaults (§12.2).
- `propMeta`: widget type, label, step/min/max, known default and description per prop key, built from `props_schema.json` + `data/curation/prop-meta.json`.
- Roles are normalised to the `SocketDef.role` enum. The catalog's positional role words for `Base` (`left`, `right`, `front`, `top`, `bottom`) become `role: 'socket'` with that word as `name`.
- Sub-part names (the `partName` of new points) come from mesh material names: strip `Mtl`, the `.NNN` suffix and the exporter's trailing `1` (`Glass1Mtl.004` → `Glass`). A name equal to the type ignoring case takes the type's spelling, because the exporter lowercases inner capitals (`Longstick1`). This reproduces all three corpus hosts: `Base` → `Base`, `Roof` → `Glass`, `Trunk` → `Door` (**verified**). `mainPartName` is the name matching the type, else the largest group. Your capture's `subParts` names override both.
- `categories` from `data/curation/categories.json`. The catalog leaves 90 parts uncategorised; the curated browser groups are Structure, Vehicle, Logic, Sensors & Input, Motion, Weapons and Fun & Misc, seeded from the community `blocks/reference/<category>/` folders.

### 5.3 Socket geometry merge
`data/socket_geometry.json` (your capture, contract in Appendix B) is merged with `frameSource: 'captured'`. The build prints a report and fails only on malformed input:
- sockets in the catalog with no frame;
- frames outside the mesh bbox by more than 0.25 studs (how the `AltitudeSensor` placeholder was caught);
- duplicate or unknown socket ids.

Every frame is stored **outward**: local +Y points out of the part, for child and parent sockets alike. Until captured data lands, `Part` uses the Workshop frames read **row-major** (the fix in §24.1), with its ball socket 1 turned 180° about X to face outward; everything else uses `approx` frames (§10.5). Captured frames come from the Socket Workbench (§12.7). They apply at runtime from local storage, and once committed as `data/socket_geometry.json` the build merges them for everyone.

### 5.4 Data fixes before any feature relies on roles (needs your confirmation)
Under the current catalog roles, **558 of 1,621 logic-to-logic joints in the corpus (34%) join two inputs or two outputs** (**verified**). The corrections below follow the spec's own verified table:

| part | change | evidence |
|---|---|---|
| `Switch` socket 2 | input → **output** | spec §5 lists `light.self1 → sw.sock2` (switch → light) as verified, and the build log's round 2 has `splitter.self3 → switch.sock2` working; 82 corpus joints put a splitter input on it |
| `Button`, `RemoteButton` socket 2 | input → **output** | 40 corpus joints put splitter inputs on `RemoteButton.sock2`; same layout as `Switch` (**inferred**) |
| `Splitter_4` 1/2 and 3/4 | 1/2 → **output**, 3/4 → **input** | spec §4 ("3 = in, 1/5/7/9 = outs"); 43× `Splitter_4.self3` on gate outputs |
| `Wire` | input/output → **conductor** (direction comes from what drives each end) | corpus wires use `self1` on gate inputs 66× and `self3` on gate outputs 29×, the reverse of the catalog, while other builds wire them the catalog way |
| `Looper` socket 1 | input → **output** | 54 corpus joints put `Looper.self1` on gate inputs (**inferred**: a looper is a pulse source) |

These go into `data/curation/roles-fix.json`, applied by the asset build. Then the conflict count is re-run, and whatever residue remains is listed for you to judge.

---

## 6. Core model (`core/types.ts`, the central contract)

```ts
type PartId = number;                 // editor-internal, stable within a session, never exported
type SocketId = string;               // normalised to string on import ("4")
type Uuid = string;                   // "{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}", kept verbatim (braces + case)
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type CFrame12 = readonly [number, number, number,  number, number, number,  number, number, number,  number, number, number];
                       // x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 (Roblox GetComponents order)

type ConnTarget =
  | { kind: 'socket'; part: PartId; socket: SocketId }
  | { kind: 'point';  part: PartId; uuid: Uuid }        // ephemeral mount
  | { kind: 'raw';    triple: Json[] };                  // unresolvable on import (external ref, bad index); exported verbatim, read-only

interface Conn  { readonly self: SocketId; readonly target: ConnTarget }
interface Point { readonly uuid: Uuid; readonly partName: string; readonly cframe: CFrame12 }

interface Part {
  readonly id: PartId;
  readonly type: string;
  readonly conns: readonly Conn[];                    // conns[0] decides the pose
  readonly props: Readonly<Record<string, Json>>;     // every prop except EphemeralAttachments, key order kept
  readonly points: ReadonlyMap<Uuid, Point> | null;   // null = key absent; empty map = written as []
}

interface Doc {
  readonly parts: ReadonlyMap<PartId, Part>;
  readonly order: readonly PartId[];                  // export order; index in code = position + 1
  readonly layout: ReadonlyMap<PartId, CFrame12>;     // editor-only world pose of root parts
  readonly nextId: PartId;
}
```

Parts are immutable. An edit creates new `Part` objects only for what changed and a new `parts` map, so unchanged parts keep their identity. The viewport diff, size cache and history all depend on that identity.

### 6.1 Invariants (`core/invariants.ts`, asserted after every op in tests)
- I1 `order` is a permutation of the keys of `parts`; ids are unique and `< nextId`.
- I2 Every `socket`/`point` target names an existing part other than the conn's owner.
- I3 Ops never create a `point` target whose uuid the host lacks. Imports may contain such targets; they surface as error `E-UUID`.
- I4 `layout` holds only root parts (parts with no non-raw conns).
- I5 Ops never create a structural rule violation (§7). Ops that add or retarget joints refuse pose cycles; `deleteParts` avoids them where it can (§9.2). Imports may contain either; they surface as issues.

### 6.2 Import → export fidelity rules (`core/doc.ts`: `fromEntries`, `toEntries`)

| # | rule |
|---|---|
| F1 | Entry order is preserved; new parts are appended; deletions compact the order and every index is recomputed on export |
| F2 | Connection order within an entry is preserved (`conns[0]` sets the pose) |
| F3 | Socket ids are read as str or int and stored as strings (ints become their decimal string; strings stay verbatim); exported as strings; parent index exported as int |
| F4 | `props` `[]` and `{}` both mean empty and export as `[]` |
| F5 | Unknown prop keys and values, nested objects included, survive verbatim |
| F6 | `EphemeralAttachments` as an object becomes `points`; `[]` becomes an empty map and exports as `[]`; an absent key exports as absent. Uuid keys are kept verbatim. On export the key is written after the other props |
| F7 | Numbers keep their value; their text may change (`-5.6624412536621094e-05` is written `-0.000056624412536621094`). Byte-exact round-trip is impossible for any re-encoder (spec §1) |
| F8 | A connection whose parent index is not an in-range integer becomes `raw` and is exported verbatim |
| F9 | Acceptance test: for all 185 corpus codes, `decode(export(import(code)))` deep-equals `decode(code)` after normalising F3/F4 |
| F10 | Entries the model cannot represent abort the import with the entry index and reason: name not a string, connections not an array, a connection that is not a 3-element array, props neither an object nor `[]`. The game rejects these too (spec §11, phase 1). Representable faults (bad index, undeclared uuid, unknown socket) import and surface as issues, so you can repair them |

### 6.3 Codec (`core/codec.ts`)
- `decode(text)`: strips all whitespace (pasted codes often wrap), maps URL-safe `-_` to `+/`, pads `=`, base64 → bytes → UTF-8 → `JSON.parse`. Text that starts with `[` is parsed as raw JSON (paste-JSON convenience). Errors are typed: `bad-base64` with offset, `bad-utf8`, `bad-json` with message, `not-an-array`.
- `encode(entries)`: `JSON.stringify` (compact) → UTF-8 → standard-alphabet base64 **with** `=` padding (the game accepts both; 110 of 203 scraped codes are padded), via a table-driven encoder. No `btoa` on huge strings, which hits argument-length limits. An 8 M-char code must encode in under 1.5 s.

---

## 7. Rules and validation (`core/rules.ts`)

**Pieces:** `piece(type, socket)` comes from the catalog. A socket without a piece entry is its own piece. Partner faces are the other sockets of the same piece.

**A socket is "used"** on part X if it is the `self` of one of X's conns, or another part has a conn targeting `{X, socket}`. A self-joint (a raw conn `[a, b, own index]`, see I-SELF-JOINT) uses both `a` and `b`.

**A part is "mounted via socket a"** if a conn of X has `self = a` and a `point` target.

### 7.1 Availability (used by every tool before it offers a target)
- `canBeChild(doc, X, a, kind)` with kind `'joint' | 'mount'`:
  1. `a ∈ childSockets(type)` (unknown types: any id);
  2. `a` is unused;
  3. no socket in `piece(a)` carries an ephemeral mount of X;
  4. if `kind = 'mount'`: **every** socket in `piece(a)` is unused, because a mount consumes the whole piece.
- `canBeParent(doc, Y, b)`:
  1. `b ∈ parentSockets(type)` (unknown types: any id);
  2. `b` is unused;
  3. no socket in `piece(b)` carries an ephemeral mount of Y.
- `canTakeChild(doc, H, uuid)`: the point exists and no conn targets it.
- All three return `{ ok: true } | { ok: false, code, message }`. The message is shown verbatim in tooltips, for example: "Socket 10 is unavailable: piece C of this Splitter_2 is consumed by its ephemeral mount on socket 9."

### 7.2 Issues (`validate(doc, catalog, limits) → Issue[]`, debounced after each edit)

| code | severity | condition |
|---|---|---|
| E-REF | error | `raw` conn whose parent index is not an in-range integer, or whose ids are malformed; or target missing |
| E-UUID | error | `point` target not declared by the host |
| E-MATE | error | a socket number in two joints on one part (either side) |
| E-TEAR | error | an ephemeral mount plus any joint on the same piece |
| E-POINT-SHARED | error | one point targeted by two conns |
| E-CODE-LIMIT | error | code length > code limit |
| W-SOCKET-UNKNOWN | warning | socket id not in the catalog for that type (the loader validates child sockets strictly, spec §11) |
| W-TYPE-UNKNOWN | warning | type not in the catalog (rendered as a placeholder; data kept) |
| W-CYCLE | warning | parts no root reaches through first connections |
| W-PART-LIMIT | warning | parts > soft cap (8,000); text escalates past 16,000 |
| I-POINT-UNUSED | info | point with no child (~110 chars wasted) |
| I-NO-ANCHOR | info | > 200 parts and no `Anchor` with `Activated: true` (spec §8.3) |
| I-RELAY-UNMOUNTED | info | `Wire`/`Splitter_n` without an ephemeral mount (spec §8.1 — it dangles) |
| I-ROLE | info | a joint between two outputs or two inputs (after the §5.4 fix) |
| I-SELF-JOINT | info | a joint from a part to one of its own sockets (`raw`, parent index = own index). Made in game: 79 such joints in 18 of the 185 corpus builds (mostly `Splitter_2.5>Splitter_2.4` and `Switch.3>Switch.2`). Kept verbatim, not posed, and not an error |

Export with errors opens a blocking dialog that lists them, with "Export anyway". Each issue has a click-to-select action, and quick fixes where they are safe: remove unused points, remove a duplicate joint.

---

## 8. Graph queries (`core/graph.ts`, memoised per `Doc` via `WeakMap`)

| query | meaning |
|---|---|
| `index(doc)` | reverse map target → conns (built once per doc version, O(joints)) |
| `poseParent(id)` | the part `conns[0]` targets, or null (root/raw) |
| `poseChildren(id)`, `poseDescendants(id)` | parts whose `conns[0]` targets id, and that set's closure. Cycle-safe BFS |
| `jointNeighbours(id)` | every part joined to id in either direction |
| `component(id, pred)` | flood over `jointNeighbours`, restricted to parts matching `pred` (bucket fill) |
| `roots(doc)` | parts with no non-raw conns |
| `topoPose(doc)` | pose order: BFS from roots; unreached parts (cycles) get pseudo-roots (§10.6) |

---

## 9. Edits (`core/ops/*`)

### 9.1 Transactions and history
`transact(doc, label, fn: (draft) => void) → { doc, patch }`. The draft exposes `get / set / delete / order / layout / allocId`. It records the before/after of every touched part, plus the order, layout and nextId changes, as a `Patch`.

History keeps `{ past: Patch[], future: Patch[] }`, capped at 500 entries; undo applies the inverse patch. This costs memory proportional to what changed, not to build size (D12).

Live drags do **not** transact per frame. Tools render a preview override and commit one transaction on release; `Esc` or right-click cancels with no doc change. Selection is not part of history; after undo/redo it is filtered to existing ids.

### 9.2 Operations (each is a function on the draft, unit-tested against §6.1 invariants)

| op | behaviour |
|---|---|
| `addPart(type, props, conns)` | appends to order. Ops never read settings: tools pass auto-color in `props` (§12.5) |
| `deleteParts(ids)` | removes parts; removes other parts' conns that target them. If a survivor loses `conns[0]`, its first remaining conn that does not create a pose cycle moves to index 0; if every remaining conn would, they stay and the part reports W-CYCLE; with none left it becomes a root at its current world pose. Points that only the deleted parts' conns used are deleted (D10). The toast reports re-posed and loosened parts |
| `setProp(ids, key, value \| UNSET)` | applies only to parts whose type supports `key` (catalog `props` + any part already holding it). Returns `{applied, skipped}` |
| `paint(ids, rgb)` | `setProp(ids, 'RGB', [r, g, b])` limited to paintable types |
| `addConn(id, conn, {asPose})` | validated via §7.1; `asPose` inserts at index 0 |
| `removeConn(id, i)`, `detach(id)` | `detach` removes `conns[0]` and keeps the part where it was |
| `addPoint(host, cframe, partName?)` | uuid = `"{" + crypto.randomUUID() + "}"`; `partName` = clicked sub-piece or `mainPartName` |
| `setPointCFrame`, `deletePoint(host, uuid, childPolicy)` | `childPolicy` = detach the child / delete the child |
| `retargetPose(id, target)` | the single primitive behind every move (§9.3) |
| `makeFreeMovable(id)` | §9.3 |
| `extractSubDoc(ids)` / `insertSubDoc(sub, attach?)` | copy/paste, save-selection-as-creation, prefab insert, generators. Extract keeps internal joints and the points they use, and drops joints to outside parts; parts that hung off the outside become roots placed at their pose relative to the first root. Insert remaps ids, **regenerates uuids**, appends in sub-doc order |
| `duplicate(ids)` | extract + insert; then each copied top-level part re-attaches to its original's host through a new point at the same pose (§9.3 rules), and copies that cannot mount become roots. The Move tool's free move starts immediately (Blender `Shift+D` behaviour) |
| `setLayout(rootId, cframe)` | editor-only root placement |

### 9.3 Moving parts: "mirror the game", without breaking logic
A move changes **where a part's pose comes from**. Every path goes through `retargetPose`, with one rule on top of D5: **a signal joint is never silently broken.** A joint is a *signal joint* when the roles at its two ends are output/input or include a conductor.

`makeFreeMovable(p)` (used when a gizmo or modal move starts):
1. `conns[0]` already targets a point: free already; a move edits that point's `cframe`.
2. `p` is a root: a move edits `layout`.
3. `conns[0]` is a structural socket joint (not signal) and its `self` socket's piece is otherwise unused: replace it with a mount on a **new point on the same parent** at the current relative pose. The parent socket becomes free and nothing visibly jumps. Availability checks here and in rule 4 run with the replaced joint already removed.
4. `conns[0]` is a signal joint, or its piece is shared: find a child socket `m` whose whole piece is unused. Prefer `defaultMount`, then corpus frequency.
   - If found: insert a new mount `[m → new point on the same parent]` as `conns[0]` and keep the old joint as a secondary connection. The signal survives and behaves as a cable, which is exactly how your v4 relays were pinned.
   - If none: the move is refused for this part, with a reason ("Light #812 has one connection point and it carries the signal from Gate-AND #640. Detach it first to move it freely.").

Drag-and-drop re-attach (Move tool), with the target under the cursor:

| target | result |
|---|---|
| a free compatible socket | new pose joint to it |
| any part surface | new point on that part at the hit, normal-aligned; pose joint via `m` |
| empty space | cancel (roots: move `layout`) |

The same signal-preservation rule decides whether the old `conns[0]` is replaced or kept as secondary. A drop onto the part's own pose descendants is refused (it would create a cycle).

Multi-selection transforms move only the **topmost** selected parts (no selected pose ancestor). Their descendants follow. Parts refused by rule 4 are skipped and listed in a toast; the rest move in one transaction.

New point frame, so nothing jumps: `CF(u) = (World(h) · Sub(h, partName))⁻¹ · World(p) · S(p, m) · Me⁻¹ · Re(p)⁻¹`. This is §10.2's ephemeral equation solved for `CF(u)`; symbols are defined there.

---

## 10. Spatial model (`core/pose.ts`, `core/conventions.ts`)

### 10.1 Frames
`S(type, socket)` is the socket's 4×4 frame in part space, from `catalog.sockets[s].frame`. `Sub(type, partName)` is a sub-piece frame (identity for the main piece).

### 10.2 Pose equations (float64)
- Root: `World(p) = layout(p)`.
- Socket joint, child c by socket a onto parent q at socket b:

  `World(c) = World(q) · S(q, b) · R(c) · M · S(c, a)⁻¹`

- Ephemeral mount, child c by socket a onto point u of host h:

  `World(c) = World(h) · Sub(h, partName_u) · CF(u) · Re(c) · Me · S(c, a)⁻¹`

- `R(c)` and `Re(c)` are built from the child's `OrientationX/Y/Z` props (degrees; values accumulate past 360 in real codes, e.g. 1080). They rotate about the parent socket's (or point's) own axes, where +Y is the outward normal, so `OrientationY = 90` turns the child +90° about that normal.

### 10.3 Defaults until calibrated (`conventions.json`, swappable without code changes)

| symbol | default | why |
|---|---|---|
| M, Me | `Rx(180°)`: every frame is stored outward, so the child's frame is turned to face the parent's | identical to the Workshop's "frames coincide" mating, whose ball frame points inward (§24.1); the roll (flip about X vs Z) is a **guess** that probe P1 settles |
| R | `Rx(OrientationX) · Ry(OrientationY) · Rz(OrientationZ)` about the parent socket's frame (+Y = outward normal), i.e. three.js `Euler(x, y, z, 'XYZ')` | **guess**: the order and axes are unknown (spec §7 OPEN) |
| Re | same as R | **guess** |
| Sub | identity for every partName | until your capture supplies sub-piece frames |

### 10.4 Calibration
1. **Automatic** (runs once your data lands): for the 60 most common corpus joint pairs (`Connector.self5 → Connector.sock4` ×5,619 …), mated parts should touch: bbox gap ≤ 0.05 studs, overlap along the mating axis ≤ 25% of the smaller part. Each candidate `M` in {180° about X, 180° about Z} is scored by how many pairs pass, and failing sockets are listed. That validates your capture as well as the convention. Bbox contact is a heuristic, so the suite is report-only until you approve its result; after that, the approved result becomes a regression baseline in CI.
2. **In-game probe pack** (Dev menu → "Calibration probes"): six tiny codes. Each answers one question, with a screenshot checklist:
   - P1 mating, `Part` on `Part` via socket 2;
   - P2–P3 `OrientationX` and `OrientationY` = 90 on a socket joint;
   - P4 a `Gate-AND` on a `Base` point with a 90°-rotated `cframe`;
   - P5 a `Base` host with `OrientationY` = 90 hosting a point;
   - P6 a `Roof` host with `partName` `"Glass"` vs `"Roof"`.
   You report what you see; the answers become `conventions.json` values.

### 10.5 Fallback frames (`frameSource: 'approx'`)
Deterministic and readable, not true:
- named sockets map to named faces (`Top` → +Y face centre, `Left` → −X, `Front` → −Z, …);
- unnamed parent sockets spread across bbox faces in a fixed order (+Y, +X, −X, +Z, −Z, −Y), offset along the face for repeats;
- child sockets sit on the −Y face centre, frame pointing outward (−Y).

Every part posed through an `approx` frame, or through a point whose `partName` names a sub-part without a captured frame, is flagged **together with its subtree**. Flagged parts render 30% desaturated (toggle in View), a status-bar badge counts them, and Properties shows "≈ approximate position". Generators warn when the element type's mount frame is approximate.

### 10.6 Roots and cycles
Roots: the first root sits at the origin; others line up along +X with 2-stud gaps (bbox-based). `detach` and delete keep a loosened part at its last world pose.

Cycles (2 corpus codes have 0 roots): parts BFS from roots cannot reach get a pseudo-root (lowest entry index) and W-CYCLE.

### 10.7 Cost and recompute
About 4 matrix products per part, so roughly 64 K for 16 K parts: a few ms (budget checked at M1, D14). The whole map is recomputed per committed doc version; drags recompute only the dragged subtrees for the preview.

---

## 11. Viewport (`viewport/`)

### 11.1 Rendering
- `WebGLRenderer` (WebGL2 required) with sRGB output and Neutral tone mapping. Hemisphere + one directional light, no shadows (clean, cheap). Background is a subtle vertical gradient; the infinite grid is a shader plane (1-stud minor, 4-stud major lines) that fades with distance.
- **One `InstancedMesh` per part type.** Capacity doubles when full and slots are recycled. Baked vertex group colors plus the paintable mask let a small `onBeforeCompile` patch choose `instanceColor` (the `RGB` prop) for paintable vertices and the baked color elsewhere. That keeps draw calls to one per part type present.
- Per-instance attributes: `instanceColor` (paint), `aFlags` (selected / hovered / approximate / hidden / glow).
- **Selection outline:** selected instances render into a mask target, and a full-screen edge pass draws an orange outline (white for hover; the active part is brighter). This is the Blender look, and it works with 16K selected parts.
- **Sockets layer:** instanced flat rings oriented by socket frame, at constant screen size.

  | socket state | look |
  |---|---|
  | input | red |
  | output | charcoal with a white rim |
  | conductor | violet |
  | mount | amber |
  | generic | light blue |
  | used | 35% opacity |
  | consumed by a mount piece | red ✕ |

  Shown for hovered and selected parts, and in the Connect tool for every free socket within 80 studs of the camera. Either way, at most the 3,000 nearest are drawn.
- **Points layer:** cyan diamonds with a small axis triad; free points pulse gently.
- **Ghosts:** translucent preview meshes for placement, prefabs and generators.
- **Navigation gizmo:** an axis widget in the top-right corner; click an axis to snap the view (Blender style).

### 11.2 Picking
- Click and hover: a bounding-volume hierarchy over part bounding spheres (`viewport/bvh.ts`, rebuilt when poses change, ~10 ms at 16K) narrows each ray to a few candidates; exact triangle tests run only on those. three.js's own `InstancedMesh.raycast` tests every instance, which is too slow for per-frame hover at 16K. Hover picks at most once per animation frame, and only after the pointer moves.
- Box select and box paint in **visible-only** mode use an **ID pass**, rendered once on mouse-up: each instance is drawn with `baseId + gl_InstanceID` packed into RGBA8, then the box region is read back. X-ray mode (`Alt+Z`) projects each part's bbox centre and selects through.
- Brush paint casts ~16 rays spread over the brush disc on each pointer move (the BVH makes this cheap). The first hit per ray is visible by construction, so no per-frame ID render is needed.

### 11.3 Cameras and keymaps (Appendix A has every binding)
- **Blender scheme** (default):

  | input | action |
  |---|---|
  | MMB | orbit around the selection or the point under the cursor |
  | Shift+MMB | pan |
  | wheel | zoom to cursor |
  | numpad 1/3/7 (Ctrl = opposite) | front / right / top views |
  | numpad 5 | ortho / perspective |
  | numpad . | frame selection |
  | Home | frame all |
  | Alt+LMB | orbit (optional 3-button emulation for laptops) |

- **Studio scheme:**

  | input | action |
  |---|---|
  | hold RMB | mouse-look |
  | WASD | move |
  | Q / E | down / up |
  | Shift | slow (Studio convention) |
  | wheel | dolly |
  | F | focus selection |
  | MMB | pan |

  Tool keys move to Ctrl+1 / Ctrl+2 / Ctrl+4, as in Studio.
- One keymap table per scheme (`state/keymap.ts`, data only). Hotkeys never fire while a text field has focus. A right-click without drag opens the context menu in both schemes.

---

## 12. Tools (`tools/`)

The toolbar holds Select · Move · Rotate · Connect · Point · Paint (keys 1–6 in Blender, Ctrl+1/2/4 in Studio for the first three). A segmented control picks the selection mode: **Part | Part + attached**.

### 12.1 Select (must-have: individual vs part + children)

| input | action |
|---|---|
| click | select |
| Shift+click | toggle |
| Ctrl+click | remove |
| drag on empty space | box select |
| A / Alt+A | select all / none |
| Ctrl+I | invert |
| L | select the attached branch under the cursor |
| Ctrl+L | select everything joint-connected |
| Shift+G | select similar: same type / color / props |

Mode **Part + attached** expands every pick to the part plus its pose descendants (D7). The outliner obeys the same mode.

Attachment points are selectable entities (`hostId:uuid`), visible when their host is selected or the Point tool is active.

### 12.2 Connect (must-have: click a connection point, choose a part, it's placed)
1. Free sockets render on everything near the camera. Hovering shows the socket id, role, semantic name, piece and reason-if-unavailable.
2. Clicking a free **parent-side** socket or free **point** opens the **part picker** popover at the cursor: search box focused, favourites row, recent row, results with thumbnails, then "My creations". Enter picks the top result.
   - Only parts that can attach here are listed: types with at least one child socket (on a point: a non-null `defaultMount`). Root-only types such as `Chassis` are hidden.
3. The new part attaches by a **smart default child socket**:
   - the most frequent corpus pair for this parent socket (`pairs`);
   - else the role complement (output ↔ input, socket ↔ mount);
   - else `defaultMount`.

   The popover shows "attach by socket N ▾" so you can change it. On a point, the part always mounts by its default mount socket.
4. The placed part becomes selected. The picked type stays **armed**, so each further click on a socket places another (Esc disarms). Shift+click several sockets first to place on all of them at once.
5. **Wiring existing parts:** drag from one socket to another, or click one and then the other. The child side is whichever end is a child-side socket; ambiguous cases resolve by role, then corpus frequency. The preview line turns green or red with the §7.1 reason. The joint is appended, or becomes `conns[0]` if the child was a root; pose cycles are refused.

### 12.3 Point (must-have: free ephemeral connection points)
- Click a part surface: a point is created on that host at the hit.
  - Its +Y axis (outward) follows the surface normal, snapped to the host's axes within 10°.
  - Its roll aligns to the nearest host axis.
  - `partName` is the clicked sub-part's name (§5.2 rule; your capture's names win), else `mainPartName`.
- The new point is selected, with a gizmo for move and rotate in host-local space.
  - Position snap: 0.05 / 0.1 / 0.25 / 0.5 / 1 studs.
  - Rotation snap: 15° / 45° / 90°.
  - Numeric fields in Properties (position and Euler, host-local).
- A free point has a "+" handle (or press Enter): the part picker mounts the chosen part on it.
- Deleting a point that carries a part asks: detach the part, delete the part too, or cancel.

### 12.4 Move / Rotate (must-have: multi-selection move and rotate)

| control | Blender scheme | Studio scheme |
|---|---|---|
| Gizmo | three.js `TransformControls`, restyled | same |
| Modal move | G | — |
| Modal rotate | R | — |
| Native rotate 90° about Y / X (Orientation props on socket joints, `cframe` on points, layout on roots) | Ctrl+R / Ctrl+T | Ctrl+R / Ctrl+T |

- Gizmo options: World/Local space; pivot = median, active, or individual origins; snapping as in §12.3.
- Modal transforms take X/Y/Z axis constraints, typed numbers, Enter or LMB to confirm, Esc or RMB to cancel.
- The Move tool also drags parts with **snap-to-socket / snap-to-surface re-attach** (§9.3).
- All conversions follow §9.3. One transaction per completed transform.

### 12.5 Paint (must-have: auto paint / region paint — all four meanings)

| mode | behaviour |
|---|---|
| Click | paint one part |
| Fill (bucket) | flood over joint-connected parts matching the clicked one by **color** (default), **type**, or **any** |
| Box | paint everything in a dragged box; visible-only, or through with X-ray |
| Brush | paint while dragging; radius in pixels; hits only visible parts (§11.2) |
| Branch | paint a part + everything attached (pose descendants) |
| Auto-color new parts | global toggle (toolbar paint-drop icon): every part placed through Connect, Point, Place or a browser drag takes the active color. Pastes, prefabs and generators keep their own colors |

Color tools:
- color picker with hex and RGB;
- swatch palette;
- recent colors;
- **build palette**: the colors used in the current build. Click to pick one; Shift+click selects every part with that color.

Other paint behaviour:
- Alt+click is the eyedropper.
- "Paint selection" applies the color to the current selection.
- Non-paintable types are skipped; the toast reports how many.
- One transaction per stroke or fill.

### 12.6 Place (shared by armed parts, prefabs, paste, generators)
A ghost follows the cursor and snaps to sockets, points and surfaces using the same targets as §9.3. Click commits; Esc cancels. For **new** parts, prefabs and pastes, empty space makes a new root at the cursor's ground-plane position, and a status-bar hint says root positions are not stored in codes. Moving an **existing** part into empty space cancels instead (§9.3).

### 12.7 Socket Workbench (D15: gathering the connection-point data)
A separate mode, reached from the toolbar's **Sockets** button, for capturing where every socket sits.

1. **Pick a part type.** The list is sorted by corpus usage (`Connector`, used 11,484×, comes first). A progress column shows captured / total sockets per part.
2. **Probe codes** make the socket numbering visible in-game:
   - **Parent sockets:** the part as root with a `ShortStick` on every parent socket, each stick a distinct color. A code carries at most 8 sockets; parts with more get several codes. The legend reads "socket 1 = red, socket 2 = orange, …".
   - **Child sockets:** for each child socket, a copy of the part mounted by that socket onto a grey `Part` cube, which sits on a point of a `Base`. The face touching the cube is that socket.
   - Copy a code, spawn it in-game, and look at where the colors land.
3. **Capture.** The part's mesh fills the viewport. Select a socket in the list, then click the mesh where its marker was. The click sets the position and the outward direction from the surface normal.
   - Candidate dots help: bbox face centres, sub-part centroids, and named-face hints (`Top`, `Left`, …). Clicking a dot snaps exactly.
   - A gizmo fine-tunes the frame; roll turns in 90° steps.
4. **Test mate** attaches a `Part` cube to the selected socket, so you see what the editor will do with it.
5. **Storage.** Captured frames save to IndexedDB (store `sockets`) and immediately override the catalog everywhere in the editor (`frameSource: 'captured'`).
6. **Export** writes `data/socket_geometry.json` (Appendix B). Commit it, and the asset build merges it so every visitor gets the data. **Import** loads a file back.

---

## 13. Panels and dialogs (`ui/`)

### 13.1 Part browser (left dock; must-have: favourites)
- Search with fuzzy match on type, tooltip and category.
- Sections in this order: **★ Favourites**, **Recent**, the seven categories, **My creations**.
- Each card shows a 64 px thumbnail (rendered client-side once, cached in IndexedDB), the name, and a badge with its count in the current build.
- The star toggles a favourite. Favourites persist in `localStorage` and can be reordered by drag.
- Hover tooltip: the game tooltip text, a socket summary, and corpus usage ("used 11,484× in 185 real builds").
- Click arms the part (Connect/Place). Drag drops it into the viewport using the §12.6 targets.

### 13.2 Outliner (right dock tab)
- A virtualised tree by pose parent with 24 px rows. 16K rows stay fast because only visible rows render.
- Each row: disclosure, mini icon, type, `#index`, color dot, issue badge, eye toggle (editor-only hide).
- Search filters by type or `#index`. "Group by type" view toggle.
- Selection follows the selection mode. Double-click frames the part.

### 13.3 Properties (right dock tab; must-have: multi-selection property changes)
- **Header:** "3 parts — 2 Mag, 1 Stick". The type chips are clickable and narrow the selection to that type.
- **Fields:** the union of every prop key applicable to at least one selected part.
  - Shared values show the value; differing values show "mixed".
  - Partial coverage shows "applies to 2 of 3".
  - Editing writes **only** to parts where the key applies: two mags + a stick, set `Bullets` = 30 → both mags change, the stick is untouched. That is `setProp`'s `{applied, skipped}`.
  - "Reset" removes the key so the game default applies.
- **Widgets** by `propMeta`:

  | prop type | widget |
  |---|---|
  | bool | checkbox (tri-state when mixed) |
  | number | numeric field with drag-scrub (Blender style) |
  | int | integer field |
  | string | text field |
  | `RGB` | swatch + hex + RGB |
  | `ActivationKey` | press-a-key capture, Roblox `KeyCode` names |
  | `Text` | textarea |
  | Orientation X/Y/Z | numeric fields with ±90 buttons |

- Unknown imported keys appear under "Other properties" as editable JSON.
- **Single selection adds:**
  - **Connections:** each conn with a pose badge, socket names and the target as a link; disconnect; "make pose joint".
  - **Points** (if the part is a host).
  - **Info:** type, category, entry `#index`, approximate-pose flag, this entry's code cost in chars.

### 13.4 Stats (right dock tab; must-have: type counts + percentages)
- Columns: type · count · **% of parts** (2 decimals) · **% of code** (tier-1 addition) · bar.
- Code share counts each entry's bytes. Each point's bytes count toward the **child mounted on it**, so a generated shape's cost shows under its element type, not under the host connector. Unused points count toward their host.
- Sortable. Click a row to select that type; Shift+click to add.
- Footer: parts, joints, points, roots. "Copy as text".

### 13.5 Meters (status bar; must-have: code length limit indicator)
- **Code:** `Code 8.01% used` (two decimals), computed as base64 length ÷ code limit (8,000,000 by default).

  | range | color |
  |---|---|
  | < 75% | green |
  | 75–100% | amber |
  | > 100% | red, "above tested limit" |

- **Parts:** `Parts 2,385 / 8,000`.

  | range | color / text |
  |---|---|
  | < 6,000 | green |
  | 6,000–8,000 | amber |
  | 8,000–16,000 | orange, "laggy" |
  | > 16,000 | red, "beyond tested" |

- The tooltip shows exact numbers (JSON bytes, base64 chars, limits). Click opens Export.
- **Algorithm (`core/size.ts`):** an exact incremental total.
  - Each `Part` caches its entry's UTF-8 byte length with every resolved parent index removed; `raw` triples count verbatim (`WeakMap` keyed by the immutable `Part`).
  - Total JSON bytes = 2 + (N − 1) + Σ cached + Σ digits(1-based target index).
  - Base64 length = 4·⌈bytes/3⌉.
  - Cost per update: O(changed parts + joints).
  - Tests must match a full `encode` exactly.

### 13.6 Issues (right dock tab)
The §7.2 list, grouped by severity, with click-to-select and quick-fix buttons. A badge in the status bar shows the counts.

### 13.7 Import / Export
- **Import:** paste box (code or JSON, wrapped or not), file drop (`.txt`, `.json`), or "Open from library".
  - Shows a parse summary and issues before committing: "Open (replace)" with an unsaved-changes guard, or "Insert into current build" (place mode, §12.6).
- **Export:** summary (parts, chars, % used, issues), then Copy code, Download `.txt`, Download pretty `.json` (debugging), Save to library.
  - Huge codes show the first and last 200 chars only; the DOM never holds 8 M chars.
  - Errors trigger the blocking dialog from §7.2.

### 13.8 Library (must-have: save creations, export, append as parts)
- A grid of cards: thumbnail, name, parts, % of code limit, updated date. Search and sort.
- Per card: Open · Insert as part · Rename · Duplicate · Export (`.txt` code) · Delete (with undo toast).
- Library toolbar: Import bundle · Export all (bundle) · storage usage · persistence status.
- "Save" (Ctrl+S) writes the current build; "Save selection as creation" writes `extractSubDoc(selection)`.
- **Append as part:** every creation also appears under **My creations** in the part browser and the part picker. Picking one arms a prefab.
  - The prefab attaches by its **first root's** default child socket (or mounts on a point/surface), with the same targets as a part, and is inserted with fresh ids and uuids.
  - A prefab whose first root has no child sockets is inserted as a new root.

### 13.9 Generators (must-have; §15)
A dock panel: shape list, parameter form, live ghost preview, cost preview, target (new root / selected socket / selected point), Generate, Save preset.

### 13.10 Settings, shortcuts, command palette
- **Settings:**
  - controls: camera scheme, 3-button emulation, sensitivity/invert, fly speed;
  - appearance: theme dark/light;
  - limits: code, part soft cap, part warning;
  - editing: snapping defaults, auto-color, max visible sockets;
  - numbers: generator number precision (default 4 decimals for positions, 5 for rotations).
- `?` opens the shortcut overlay (generated from the keymap tables).
- `F3` (Blender) / `Ctrl+Shift+P` (both schemes) opens the command palette with every command and its key.

---

## 14. Storage (`storage/`)

IndexedDB database `grambyedit`, schema version 1:

| store | key | value |
|---|---|---|
| `creations` | `id` (uuid) | `{ id, name, code, partCount, codeLength, thumb: Blob, tags: string[], notes, createdAt, updatedAt, editorMeta, schemaVersion }` |
| `autosave` | `'current'` | `{ code, editorMeta, savedAt, creationId? }` — debounced 2 s after edits; offered on next start ("Restore unsaved work?") |
| `thumbs` | `${assetsVersion}:${type}` | `Blob` (part-browser thumbnails) |

Notes:
- `editorMeta = { rootLayout: Record<entryIndex, CFrame12>, camera }`. It is keyed by entry index, which is stable inside a saved code.
- The library stores the **share code**, not internal state. Saved work stays readable by any future editor version and by the game itself.
- `localStorage` holds settings, favourites, recents, recent colors and panel layout. These are small, and the app falls back to defaults if storage is blocked (every access is wrapped in try/catch).
- Bundle export format: `{ format: "grambyedit-library", version: 1, exportedAt, creations: [...] }` without thumbnails (they are regenerated on import). Import merges, skips duplicates by SHA-256 of the code, and renames name collisions.
- On first save, the app calls `navigator.storage.persist()`. Quota errors (`QuotaExceededError`) show a toast that suggests "Export all".

---

## 15. Shape generators (`core/generators/`, pure functions)

```ts
interface GenParams { shape: ShapeId; element: string; host: string /* default 'Connector' */;
                      dims: Record<string, number> /* per shape: length, radius, height, turns… */; spacing: number /* default = element bbox along the step axis */;
                      fill: 'shell' | 'solid' | 'frame' | 'outline'; orient: 'fixed' | 'outward' | 'tangent';
                      color: { mode: 'single' | 'gradient' | 'random'; ... }; transform: CFrame12 /* shape → host */ }
generate(params, catalog) → { elements: Array<{ pose: CFrame12 /* host space */; rgb?: [r,g,b] }> }
```

- **Shapes:** Line, Grid/Plane (filled / outline), Box (solid / hollow / frame), Circle (ring / disc), Cylinder (tube / solid), Sphere (shell via Fibonacci distribution / solid), Cone & Pyramid, Torus, Arc, Helix/Spiral, Stairs, Text (5×7 pixel font). Spacing determines counts: a ring gets n = round(2πr / spacing).
- **Output** (your spec):
  - one **host** part (Connector by default; any part type can host points, spec §7) as a new root or on the selected socket/point;
  - one ephemeral point per element on that host;
  - every element mounted by its `defaultMount` socket.
- Each point's `cframe` comes from §9.3's frame formula (the element's mount frame is compensated), so elements land exactly where previewed. It uses the same `conventions` code as the pose solver, so there is one source of truth.
- Numbers are rounded to the precision setting. Identity rotations write as `1,0,0,0,1,0,0,0,1`.
- **Cost preview before committing:** "+1,204 parts · +318,422 chars · code 4.01% → 7.99% · parts 2,385 → 3,589". It warns when a meter would cross a threshold. The hard guard is 20,000 elements.
- Every element counts toward "% of code" under the element type (§13.4).
- **Expected cost** (**inferred**): about 220 base64 chars per element with axis-aligned rotation, up to ~330 with arbitrary rotation. So 8,000 generated parts ≈ 1.8–2.6 M chars, which is 22–33% of the code limit.

---

## 16. Quality-of-life additions

### Tier 1 — proposed and included in v1

| addition | why it earns its place |
|---|---|
| Undo/redo + history list | Mandatory for any editor; patch-based (§9.1) |
| Issues panel with quick fixes | Catches "Build inválida" and tearing *before* you test in-game |
| Copy / paste / duplicate (internal + system clipboard as a code) | Paste a code from Discord straight into place mode |
| Hide / isolate (H, Shift+H, Alt+H) | Dense 8K-part builds are unworkable without it |
| Autosave + crash recovery | One lost evening is enough to stop using a tool |
| Command palette + shortcut overlay | Discoverability for two keymaps |
| Select similar, select by type from Stats | Fast bulk selection for multi-edit |
| Save selection as creation | Makes "append as part" practical: carve prefabs out of existing builds |
| Smart socket defaults from 2,058 corpus pairs | One click places parts the way real builders attach them |
| Code optimiser (round `cframe` numbers, drop unused points and empty `EphemeralAttachments`) | Directly buys headroom on the 8 M limit; undoable |
| Calibration probe pack | Turns the open spec questions into a 15-minute in-game session |
| Part-count meter + "% of code" column | Your answer showed part count binds first; this makes that visible |
| First-run tips + "Load example" (spec Appendix A/B codes) | Zero-to-something in one click |

### Tier 2 — out of scope for v1 (D16); kept here for later
- Live logic simulation: toggle switches in the viewport, lights glow, plus "fix spawn states" (sets `Light.Activated` to the predicted spawn value, spec §8.5). It needs the §5.4 roles and a net-based model, because wires behave like conductors.
- Anchor helper: four `Activated` anchors at the footprint corners (spec §8.3).
- Share links for small builds (deflate + base64url in the URL fragment).
- Mirror tool, array-from-selection, replace part type, measure tool, image → pixel-art generator, custom keymaps.

---

## 17. Visual design

Dark theme by default (Blender-like), with a light theme. Dense, quiet chrome: 1 px borders, 24 px rows, 12–13 px system UI font, monospace for codes. Inline SVG icons (a handful of MIT Lucide glyphs copied in; no icon dependency).

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ GrambyEdit  File Edit View | Select Move Rotate Connect Point Paint | Part/+Attached | Blender v   │
├──────────────────┬───────────────────────────────────────────┬─────────────────────────────────────┤
│ PARTS            │                                     [xyz] │ Properties|Outliner|Stats|Issues    │
│ search...        │                                           │ 3 parts: 2 Mag, 1 Stick             │
│ * Favourites     │                                           │ Color   #C62828      (1 of 3)       │
│   [#] [#] [#]    │                3D viewport                │ Bullets [ 30 ]       (2 of 3)       │
│ Recent           │                                           │ Orient X 0  Y 90  Z 0   +-90        │
│ > Structure      │                                           │ > Other properties                  │
│ > Vehicle        │                                           │                                     │
│ > Logic ...      │                                           │                                     │
│ > My creations   │                                           │                                     │
├──────────────────┴───────────────────────────────────────────┴─────────────────────────────────────┤
│ Part+Attached . 3 sel | Code [#------] 8.01% used | Parts [###---] 2,385/8,000 | 0 warn 0 err      │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Tokens (CSS variables on `:root`, redefined for the light theme):

| token | dark | use |
|---|---|---|
| `--bg` / `--panel` / `--line` | `#1d1f23` / `#24272c` / `#33373e` | surfaces |
| `--text` / `--muted` | `#e6e8eb` / `#9aa1ab` | text |
| `--accent` | `#4c8dff` | UI focus / active tool |
| `--select` / `--active` | `#ff9d2e` / `#ffc46b` | 3D selection outline / active part |
| `--ok` / `--warn` / `--bad` | `#3fb950` / `#d29922` / `#f85149` | meters, issues |

Docks are collapsible and resizable, and their sizes persist. Minimum supported window is 1100×700; below that, docks collapse to icons.

---

## 18. Errors, support, accessibility
- **Browsers:** current Chrome, Edge, Firefox and Safari on desktop; WebGL2 required, with a clear message if missing. WebGL context loss shows an overlay with "Reload view"; the doc is untouched.
- **Error handling:**
  - Every import, storage and asset failure produces a toast with the actual error text; none are swallowed.
  - Asset load failure blocks the viewport with a retry, while import/export of codes still works.
  - Unknown part types render as placeholders and round-trip intact.
- **Accessibility:** every control is keyboard-reachable with visible focus rings, icon buttons have `aria-label`s, and contrast is ≥ 4.5:1 for text in both themes. The 3D view itself is not screen-reader accessible; the outliner is the accessible view of the build.
- **Privacy:** no analytics, no network calls except loading the site's own assets.

---

## 19. Testing and verification

### 19.1 Unit tests (Vitest, `tests/` mirrors `src/`)

| module | key cases |
|---|---|
| codec | padding/no padding, whitespace, URL-safe chars, UTF-8 text props, `1e+22`, 8 M-char synthetic code, raw-JSON paste, every error type |
| doc | all of F1–F8; **F9 over the 185 corpus codes**; spec Appendix A and B decode to the documented JSON |
| rules | each §3.1 forbidden pattern, including the exact v5 tear (`Splitter_2` mount on `self9` + child on `sock10`); both-faces-ordinary is allowed; availability verdict messages |
| ops | each op × invariants; delete re-posing; D10 point cleanup; `makeFreeMovable` cases 1–4 (structural socket, signal joint with a free piece, `Light` refusal); uuid regeneration on insert; randomised sequences of 1,000 ops with invariants after each and undo-all = original doc |
| size | incremental total = full `encode` length on corpus codes and after random edits |
| pose | `Part` on `Part` stacking with the row-major Workshop frames; ephemeral composition; cycles; approximate-flag propagation |
| generators | element counts per shape, spacing, no duplicate uuids, round-trip of the generated sub-doc |
| storage | `fake-indexeddb` (test-only dependency) for library CRUD, bundle round-trip, autosave |

### 19.2 Calibration suite
The §10.4 adjacency test over the top-60 corpus pairs. It is skipped until captured frames exist and report-only until you approve its result; the approved result then becomes a CI regression baseline.

### 19.3 End-to-end (Playwright, a handful of smoke tests)
- Load the site, import spec Appendix A, export, and compare decoded JSON.
- Place a part through Connect, undo, redo.
- Box-paint and check the exported RGB.
- Save to the library, reload the page, open from the library.
- Generate a 100-element ring; the exported code's host has 100 points.

### 19.4 Performance budgets (checked on a synthetic 16K-part build at M1 and M5)

| operation | budget |
|---|---|
| decode + model, 8K parts | < 500 ms |
| first render, assets cached | < 2 s |
| orbit, 16K parts | ≥ 50 fps on a GTX-1060-class GPU |
| click select | < 50 ms |
| meter update after an edit | < 300 ms |
| export of an 8 M-char code | < 1.5 s |

### 19.5 In-game spot checks (you)
At M2 and M3: spawn exported codes for a socket-placed chain, an ephemeral-moved part, a prefab insert, a generated ring, and a multi-edited mag set.

---

## 20. Deployment
- GitHub repo **`GrambyEdit`**. Vite `base` is `/GrambyEdit/`, and every asset URL resolves against `import.meta.env.BASE_URL`.
- `ci.yml` on every push and PR: install → `npm run assets` → typecheck → format check (Prettier; strict `tsc` covers unused code, so there is no ESLint) → unit tests → build.
- `pages.yml` on `main`: the same steps, then `actions/deploy-pages`.
- `.gitignore`: `node_modules/`, `dist/`, `public/assets/`, `tools/__pycache__/`.
- **Credit (D17):** Road to Gramby's and every part mesh and texture are © Mumble Games. The README, the site footer and the About dialog say so. They also credit the community exporters (JuanCrakYT/RtG-Format and jirrob/GrambysWorkshop, both MIT).
- **Visibility:** the project is mostly for private use. Free GitHub Pages requires a public repo; Pages on a private repo needs a paid GitHub plan. The site is unlisted either way.
- The GitHub CLI is not installed on this machine. Either you create the empty repo on github.com, or I install it (`winget install GitHub.cli`) with your OK.

---

## 21. Delivery plan and subagent orchestration

### 21.1 Milestones (each one deploys to Pages and is usable)

| milestone | delivers | exit criteria |
|---|---|---|
| **M0 Foundations** | git + scaffold + CI/Pages; `core/types.ts`, the `state` store API, and every module's signatures with stubs; fixtures; asset pipeline; curation files; **§5.4 role fixes** and the §24 data fixes | `npm run build` deploys an empty shell; asset tests pass (120 meshes, bboxes match the catalog within 1e-4) |
| **M1 Viewer** | import/export, codec, doc, rules/issues, graph, pose (approx frames), viewport (instancing, outline, sockets, picking, grid, nav gizmo), both camera schemes, select tool + modes, outliner, read-only properties, stats, meters | F9 passes 185/185; spec Appendix A/B render; perf budget met at 16K |
| **M1b Socket Workbench** | probe-code generator, workbench mode, capture, test mate, export/import, runtime overrides (§12.7) | you capture one part's sockets end to end and the whole editor uses them immediately |
| **M2 Editing** | history; delete; multi-edit properties; paint (all modes + auto-color); Connect; Point; Move/Rotate (gizmo, modal, re-attach, §9.3); copy/paste/duplicate; hide/isolate; context menu | every must-have editing tool works; randomised-ops test green; your in-game spot check passes |
| **M3 Library & generators** | IndexedDB library, autosave, favourites/recents, My creations as parts, save selection; generators; settings; command palette; shortcuts; first-run tips | **all must-haves shipped** |
| **M4 Calibration & tier-1 finish** | workbench captures merged into `data/`; calibration suite; calibration probe pack; code optimiser | calibration suite reported and approved; conventions set from probes |
| **M5 Hardening** | E2E suite, perf pass, accessibility pass, user guide in README | v1 release |

Your socket data can land at any milestone. The pipeline for it exists from M0.

### 21.2 Who builds what

| inline (Opus, me) | Haiku 5.5 subagents |
|---|---|
| contracts (`core/types.ts`, signatures, test lists) | codec, doc conversion, rules, graph, size, stats, uuid/cframe utils |
| `pose.ts` + `conventions.ts`, the §9.3 move algorithm | ops (after contracts + rules exist), generators (one shape per task), prefab/clipboard |
| viewport core: instancing shader patch, outline, ID pass, raycast, gizmo + modal transforms | asset scripts (OBJ/MTL parsers, packer, catalog merge) with fixtures |
| state wiring, tool manager, integration of each wave | storage repos, keymap tables, curation data (categories, prop meta) |
| design tokens, app shell, final reviews | UI panels and dialogs against the defined store API, component CSS on the tokens |

### 21.3 Task template (every Haiku brief contains all of these)
1. Goal in one sentence, plus the section of this document it implements.
2. **Files owned** (create/modify) and **files read-only**. Never edit `core/types.ts`; report contract problems instead.
3. Exact signatures to implement, copied in.
4. Behaviour spec with edge cases, and the test cases to write.
5. Acceptance commands: `npm run typecheck && npx vitest run tests/<module>`.
6. Out of scope, explicitly.

### 21.4 Orchestration rules
- At most 4 Haiku agents in parallel, with disjoint file sets. Contracts are frozen for the duration of a wave.
- After each task: I run typecheck + tests, read the diff, and fix or bounce. A second Haiku does a spec-compliance review on larger tasks. A wave ends with an inline integration commit, and all tests stay green.
- **Fit check:** the core layer is about 35 small modules (15 core files, 8 ops, 13 generator files) with crisp inputs and outputs. That is the work Haiku does reliably. The risky parts (math, rendering, interaction feel) never leave inline.

---

## 22. Risks

| risk | effect | mitigation |
|---|---|---|
| Socket data late or partial | positions approximate | graph editing and export exact regardless; `approx` frames flagged; pipeline ready from M0 |
| Pose conventions wrong | parts face the wrong way in preview | calibration suite + probe pack; conventions are data, not code |
| Role data wrong (34% conflicts today) | wrong socket colors and defaults; a wrong simulator | §5.4 fixes applied in M0; your confirmation before M2 |
| 16K-part performance | lag | instancing, no per-frame transactions, memoised graph, virtualised lists; measured at M1 |
| IndexedDB eviction or quota | lost library | `persist()`, autosave, bundle export, quota toasts |
| Haiku drift from spec | rework | frozen contracts, small tasks, tests first, inline review gate |
| Unknown loader rules | "Build inválida" in-game | strict validation, plus your in-game spot checks per milestone |
| three.js API churn | breakage | exact version pinned at scaffold time |

---

## 23. Needs you (none of these blocks M0–M1)
1. Confirm or correct the §5.4 role fixes. M0 applies them as proposed; your answer is needed before M2, when socket colors and smart defaults depend on them.
2. Capture sockets with the Socket Workbench once M1b ships: about 1–2 minutes per part, starting with the most used.
3. Run the calibration probe pack (M4, ~15 min) and report what you see.
4. Create the empty `GrambyEdit` repo on github.com, public or private (§20), or OK installing the GitHub CLI.
5. Spot-check exported codes in-game at M2 and M3.

---

## 24. Adjacent problems found in the existing bundle (fixed in M0 unless noted)
1. **Transposed socket bases.** `tools/build_catalog.py:259` reads Godot's `Transform(...)` as basis columns, but Godot 3 serialises the basis row by row. Read row-major, all five cup sockets (2–6) of `Part` have local **+Y** pointing out of their face and the ball socket (1) has +Y pointing into the part. The Workshop mates by making the frames identical (`GrambyObject.SetTransform`). The column reading gives no consistent outward axis: sockets 4, 5 and 6 fail. Spec §10 and `captures/README.md` say "+Z", which is wrong for this data; the Attachment marker cube sits at local +Y (`Attachment.tscn`, `(0, 0.25, 0)`).
2. **Socket roles** conflict with 558 of 1,621 corpus logic joints (§5.4).
3. **Stale counts.** The README and spec still say 133 parts and 121 meshes. Since `_textures` moved to `meshes/textures/` and the catalog was regenerated (15:55 today), it is 132 parts and 120 meshes.
4. **Stale comment** at `tools/build_catalog.py:90`: "One joint per piece, ever." contradicts corrected spec §3.1.
5. **90 parts have `category: null`** (§5.2 curation fixes this).
6. **Format spec Appendix A misnumbers a part.** "Reading it" calls the `Gate-AND` entry 1-based 11; it is entry 10. Parts #2, #3, #7, #10 and #12 of that example also form a pose cycle, which makes it a good cycle-handling fixture (plan Task 14).

---

## Appendix A — Keymaps (`state/keymap.ts` holds these as data)

| action | Blender scheme | Studio scheme |
|---|---|---|
| Tools: Select / Move / Rotate | 1 / 2 / 3 | Ctrl+1 / Ctrl+2 / Ctrl+4 |
| Tools: Connect / Point / Paint | 4 / 5 / 6 | 4 / 5 / 6 |
| Toggle Part / Part + attached | Tab | Tab |
| Modal move / rotate | G / R (X/Y/Z constrain, type numbers, Enter/Esc) | — |
| Rotate 90° about Y / about X (native) | Ctrl+R / Ctrl+T | Ctrl+R / Ctrl+T |
| Select all / none / invert | A / Alt+A / Ctrl+I | Ctrl+A / Esc / Ctrl+I |
| Box select | drag on empty / B | drag on empty |
| Select attached branch / joint-connected | L / Ctrl+L | L / Ctrl+L |
| Select similar | Shift+G | Shift+G |
| Delete | X or Delete | Delete |
| Duplicate | Shift+D | Ctrl+D |
| Copy / Paste | Ctrl+C / Ctrl+V | Ctrl+C / Ctrl+V |
| Hide / unhide all / isolate | H / Alt+H / Shift+H | H / Alt+H / Shift+H |
| Undo / Redo | Ctrl+Z / Ctrl+Shift+Z | Ctrl+Z / Ctrl+Y |
| Frame selected / all | Numpad . / Home | F / Home |
| Views front / right / top, ortho | Numpad 1 / 3 / 7, 5 | — (nav gizmo) |
| X-ray | Alt+Z | Alt+Z |
| Eyedropper (Paint) | Alt+click | Alt+click |
| Save / Import / Export | Ctrl+S / Ctrl+O / Ctrl+E | same |
| Command palette | F3 or Ctrl+Shift+P | Ctrl+Shift+P |
| Shortcuts overlay | ? | ? |
| Camera | MMB orbit, Shift+MMB pan, wheel zoom | RMB look, WASD + QE, Shift slow, wheel |

Esc always cancels the active operation first (modal transform, armed part, open popover). Only with nothing active does it clear the selection (Studio scheme).

## Appendix B — Socket geometry file (written by the Socket Workbench)

`data/socket_geometry.json`:
```json
{
  "format": "grambyedit-sockets",
  "version": 1,
  "captured": "2026-10-xx",
  "method": "socket-workbench",
  "units": "studs",
  "cframeFormat": "roblox-components",
  "frameConvention": "outward-y",
  "relativeTo": "mesh-origin",
  "parts": {
    "Gate-AND": {
      "sockets": {
        "1": { "cframe": [ ...12 ] },
        "4": { "cframe": [ ...12 ] }
      },
      "subParts": { "Output": [ ...12 ] }
    }
  }
}
```

1. `cframe` uses Roblox `CFrame:GetComponents()` order (x, y, z, then rotation row-major), in the part's **mesh space**. The exported mesh origin is the part's pivot: the `Part` mesh and its Workshop sockets agree at ±0.5. The workbench captures directly in that space.
2. Frames are **outward**: local +Y points out of the part, for child and parent sockets alike. The workbench writes this convention, and hand-made files must follow it.
3. `subParts` is optional: frames of named sub-parts in the same space. They are needed only for ephemeral points whose `partName` is a sub-part (`Roof` → `"Glass"`, `Trunk` → `"Door"` in the corpus). Without it, sub-part frames default to the mesh group's bbox centre and stay `approx`.
4. Partial files are fine: missing sockets stay `approx`. The importer also accepts the old `captures/README.md` format (position + basis, read row-major), converting each frame to outward.

## Appendix C — Self-review log

Both rounds were done inline. Per your instruction, no subagents were used.

**Post-approval changes (2026-10-22, your requests):**
- Socket Workbench (D15, §12.7, milestone M1b) replaces external socket extraction.
- Every frame is now stored outward, with default mating `Rx(180°)` (§10.3). This is equivalent to the Workshop's mating.
- Logic/live simulation and tier 2 are out of scope (D16).
- Repo `GrambyEdit`, Mumble Games credit, private-use visibility note (D17, §20).
- Appendix B now describes the workbench's file.

### Round 1 — hostile review ("what is wrong, overclaimed or contradictory?")

| # | finding | fix |
|---|---|---|
| 1 | Part and mesh counts were stale. The catalog was regenerated at 15:55 (`_textures` moved to `meshes/textures/`), so it is now 132 parts, 120 meshes, 90 uncategorised | corrected in §2, §5, §21, §24 |
| 2 | The new-point frame formula (§9.3) dropped `Re⁻¹` and used `M` instead of `Me`. Moved parts would have jumped | rewritten as §10.2's ephemeral equation solved for `CF(u)` |
| 3 | `deleteParts` could create pose cycles by promoting a secondary joint, while invariant I5 claimed ops never do | promote the first joint that does not cycle; I5 states the real guarantee |
| 4 | "Raycast < 2 ms at 16K" was unfounded: three.js `InstancedMesh.raycast` visits every instance | instance-level BVH (§11.2) |
| 5 | §0 said placement enters codes only via `cframe`s; `Orientation` props carry rotation too | reworded |
| 6 | "No existing tool edits codes in 3D" overclaimed | scoped to the bundled tools; preview limitation stated exactly |
| 7 | Unlabelled inferences: D10, the mesh-pivot reading, `Kd` as linear RGB | labelled inferred/guess |
| 8 | Empty-space drops meant "new root" in §12.6 but "cancel" in §9.3 | split: new parts → root, existing parts → cancel |
| 9 | `ui` must mount the canvas, contradicting "never imports viewport" | one bridge, `viewport/index.ts` |
| 10 | Auto-color inside `addPart` made a pure op read settings | moved to tools, scope defined (§12.5) |
| 11 | Quick fix "move a conflicting joint to a free socket" is non-trivial and could rewire logic | dropped |
| 12 | Looper evidence contradicted "conductor": 54 corpus joints put `Looper.self1` on gate inputs | Looper 1 → output (inferred) |
| 13 | The Switch evidence cited the wrong place | exact citations (spec §5 + build-log round 2) |
| 14 | Bbox contact is only a heuristic for calibration, so it cannot gate CI blindly | report-only until approved, then a regression baseline |
| 15 | §23 said nothing blocks M0, yet M0 applies role fixes | applied as proposed; your confirmation is due before M2 |
| 16 | Small inconsistencies: history cap 300 vs 500, u16 rationale, `posParent` typo, `GenParams.size: ...`, `Base` positional role words, Esc in the Studio keymap, no click-click wiring | each fixed in place |

### Round 2 — builder check ("could an implementer build each piece without asking you?")

| # | gap | resolution |
|---|---|---|
| 1 | Export padding unstated | standard base64 with `=` padding (§6.3) |
| 2 | How int/str socket ids normalise; where `EphemeralAttachments` is written | F3, F6 |
| 3 | No policy for malformed entries | F10: abort only for unrepresentable entries; import and flag the rest |
| 4 | `canBeParent` for unknown types unspecified | any id |
| 5 | `Orientation` composition ambiguous | `Rx·Ry·Rz` = three.js `'XYZ'` (still a guess, settled by probes) |
| 6 | No rule for the `partName` of new points | material-name rule (§5.2), verified against all 3 corpus hosts |
| 7 | Points on uncaptured sub-parts would have looked exact | flagged approximate (§10.5) |
| 8 | Dashed outlines for approximate parts are costly in the outline pass | 30% desaturation + status-bar count |
| 9 | Part-picker eligibility undefined | child sockets / `defaultMount` (§12.2) |
| 10 | Library dedupe hash unspecified | SHA-256 of the code |
| 11 | "Host capability" undefined | any part type (spec §7) |
| 12 | Size cache ambiguous for `raw` triples | counted verbatim |
| 13 | `extractSubDoc` and duplicate semantics undefined | defined in §9.2 |
| 14 | The store API was not listed as an M0 contract | added to M0 |
| 15 | Asset URLs under the Pages subpath | `import.meta.env.BASE_URL` |
| 16 | The socket-marker cap did not cover large selections | cap applies everywhere |
| 17 | Brush paint implied a per-frame ID render | sampled BVH rays; the ID pass runs only on box mouse-up |
| 18 | `makeFreeMovable` availability checks would see the joint being replaced | checks run with it removed |
| 19 | No quick way to confirm every requirement is covered | §0.1 traceability table |
| 20 | Final full read: four leftover inconsistencies (role-fix deadline in §22, calibration gating in §19.2, the draw-call bound, the module count) and a wireframe whose symbols misalign in many fonts | fixed; the wireframe is regenerated in plain ASCII with verified equal line widths |
