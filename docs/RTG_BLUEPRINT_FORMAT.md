# Road to Gramby's — blueprint / sharecode format spec (for a blueprint editor)

Written 2026-10-22 from: the RTG wiki `Creations` page (185 parseable real
sharecodes, 34,511 part entries, 37,115 joints), the user's own saved builds
and in-game screenshots, and ~20 purpose-built in-game probes.

Revised 2026-10-22 (this copy, in `GrambyEdit/`): merged the community
reverse-engineering datasets (a 133-part catalogue, per-part meshes, the
loader's validation model) and **corrected §3.1**, which was wrong. See
"§13 What changed in this revision".

**Confidence legend used throughout**

| tag | meaning |
|---|---|
| `VERIFIED` | reproduced in-game by the user (spawned, toggled, screenshotted) |
| `CORPUS` | holds in every real sharecode analysed (n = 185) but not yet tested in-game |
| `INFERRED` | consistent with corpus + probes, but with a plausible alternative explanation |
| `HYPOTHESIS` | plausible, untested, could be wrong |
| `OPEN` | explicitly unknown; listed with a suggested experiment |

Everything marked `CORPUS` is re-derivable: run `analyze_format.py`,
`analyze_ephemeral.py`, `analyze_logic.py`, `analyze_eph_list.py` in
`tools/` (they read `data/corpus/wiki_codes.txt`). Re-scrape the corpus with
`tools/scrape_wiki2.py` (uses the fandom `api.php` endpoint; the plain wiki URL
returns HTTP 403 to scripted requests).

> `docs/RTG-ai-FORMAT-buildlog.md` is the chronological build log. Its numbers
> come from an older 184-code scrape and differ slightly from the figures here;
> **this document is the authoritative spec**, and `tools/verify_spec.py`
> checks every number in it against the current corpus.

---

## 0. What is in this folder

| path | what it is |
|---|---|
| `docs/RTG_BLUEPRINT_FORMAT.md` | this spec — the format, the physics rules, the editor requirements |
| `docs/SOCKET_GEOMETRY.md` | the one missing dataset (where each socket sits on its part) and how to capture it |
| `docs/SOURCES.md` | provenance and licences for every dataset here |
| `data/part_catalog.json` | 133 parts: sockets, roles, pieces, props, mesh, geometry |
| `data/socket_table.json` | just the socket inventory (what a 3D editor snaps against) |
| `data/props_schema.json` | every prop key, its JSON type and the parts that use it |
| `data/corpus/` | the 185 real sharecodes the facts are derived from |
| `meshes/rtg-format/` | 121 part meshes (`.obj`) + model metadata + 2 textures |
| `meshes/workshop/` | the same parts from a second exporter, with `.mtl` + `.png` textures |
| `vendor/rtg-preview/` | an existing JS 3D preview of these exact meshes (three.js) |
| `vendor/grambys-workshop/` | a Godot editor for this game (C#) — reference implementation |
| `captures/` | where captured socket geometry goes (see `captures/README.md`) |
| `tools/` | the codec, the corpus analysers, and the catalogue builder |

---

## 1. Encoding pipeline

```
sharecode  = base64( JSON )
JSON       = [ entry, entry, ... ]        # flat array, no wrapper object
entry      = [ name, connections, props ]
connection = [ self_socket, parent_socket, parent_index ]
```

* `VERIFIED` Base64, **standard alphabet** (`A–Z a–z 0–9 + /`), single line,
  no whitespace anywhere in the encoded text.
* `VERIFIED` `=` padding is optional for the game: 110/203 scraped codes carry
  it, 93 do not. Decoders must tolerate both (add `=` to a multiple of 4).
* `CORPUS` The literal prefix `W1si` is **not** a format marker — it is just
  base64 of the first bytes `[["C` (the first entries in most creations are
  `Connector`; base64(`[["C`) starts `W1siQ`). A creation whose first part is
  not `C*` will have a different prefix. All 203 scraped codes happen to
  start `W1si`.
* `VERIFIED` JSON is compact: separators `,` and `:` with no spaces.
* `VERIFIED` UTF-8.
* `CORPUS` Game-written numbers are float32-quantized (`-1.35113525390625`,
  `-5.6624412536621094e-05`). Re-serializing with Python floats keeps the
  *value* but changes the *text* — so byte-exact round-trip is impossible for
  those codes; compare parsed JSON instead.
* `CORPUS` Size observed in the wild: 1–2150 entries per code, JSON payload
  49 – 73,762 chars. Our own generated build with **2,385 entries / 607,108
  chars spawned successfully** (`VERIFIED`), so both the entry-count and
  code-length ceilings are at least that high. Their true limits are `OPEN`.

## 2. Entry schema

```json
["Gate-AND",[["4","6",12]],[]]
```

(a real entry from the corpus: the gate is mounted by its socket 4 onto a
`Connector`'s socket 6)

| field | type | notes |
|---|---|---|
| `name` | string | part id, e.g. `"Gate-AND"`, `"Splitter_2"`, `"Base"`, `"Part"` |
| `connections` | array of triples | `[]` = part is a **root** (nothing attached it) |
| `props` | object **or** `[]` | the game writes `[]` when a part has no props (`CORPUS`: 27,142 of 34,511 entries) |

* `CORPUS` Parts may appear in any order; **19,235 of 37,115 joints point
  forward** (to a later entry). Resolution is by index, not spawn order.
  `VERIFIED` in-game: a build with forward references spawned correctly.
* `CORPUS` Roots per code: 1 (145 codes), 2 (34), 3 (2), 6 (2), and **0 roots**
  in 2 codes (every part is a child → the creation contains a joint cycle).
  Detached/root parts spawn fine (`VERIFIED`).
* `CORPUS` `Base` is the entry-0 part in only 3 of 185 real codes, so
  "Base first" is a convention of *our* generator, not of the game.

## 3. Connection triple

```
[ self_socket, parent_socket, parent_index ]
```

* `VERIFIED` **Only the child stores the joint.** Parents never list their
  children; the child's entry holds the reference.
* `VERIFIED` `parent_index` is **1-based** into the top-level entry array.
  (`CORPUS`: all 37,115 refs are within `1..N`; a parent's own index never
  appears as its own parent; 0 out-of-range.)
* `VERIFIED` `self_socket` / `parent_socket` may be **string or int** —
  the corpus mixes them freely (`self` str 20,092 / int 17,023;
  `parent` str 20,086 / int 17,029). `parent_index` is always an int.
  Editors should emit one convention consistently; the game accepts both.
  (Our generator emits socket numbers as **strings** and the index as an int.)
* `VERIFIED` `parent_socket` may be a **uuid string** instead of a socket
  number, when the parent declares an ephemeral attachment (§7).
* `CORPUS` A non-integer *third* element (`{uuid}` in `parent_index`) does
  not occur in the current corpus; it was seen 7× in an older scrape and
  means "attached to something outside this save". Treat as read-only.

### 3.1 Pieces: what is actually forbidden

> **CORRECTED 2026-10-22.** The previous version of this section stated
> "one joint per piece" as a hard rule with "0 violations across 37,115 real
> joints". That was **not measured**: the check that produced the number
> compared the *child's* face table against the *parent's* socket number, and
> its table used int keys while the corpus stores socket numbers as strings,
> so it never fired. Re-run correctly, the corpus says the opposite. Details
> in §13.

A **piece** is one physical attach point of a part. Some parts number their
circles in pairs — the two *faces* of the same piece:

| part | faces (child side / parent side) | pieces |
|---|---|---|
| `Splitter_1` | 3/4, 5/6 | 2 |
| `Splitter_2` | 3/4, 5/6, 9/10 | 3 |
| `Splitter_3` | 3/4, 5/6, 7/8, 9/10 | 4 |
| `Splitter_4` | 1/2, 3/4, 5/6, 7/8, 9/10 | 5 |
| `Wire` | 1/2, 3/4 | 2 |

The odd number of a pair is the face used when the part is the **child**, the
even number the face used when a child is **attached** to it.

**Using both faces of one piece with ordinary joints is NORMAL.**
`CORPUS` 128 of the 185 real creations (69.2%) do it — 2,010 part instances
in total. A `Wire` that receives on one end and sends on the same end is the
commonest case: it is a child on its face 1 and a parent on its face 2. Every
one of the 2,010 cases is the child/parent combination; **none** of them
involves an ephemeral mount.

What the corpus *does* forbid, in 185/185 builds:

| forbidden | corpus count | why |
|---|---|---|
| the same socket number used by two joints on one part | 0 | one circle, one mate |
| a parent circle carrying two children | 0 | one circle, one mate |
| an ephemeral mount and a joint on the **same** socket number | 0 | a mount consumes the circle |
| an ephemeral mount on one face and a joint on the **partner** face | 0 | a mount consumes the whole piece |

**`VERIFIED` The last one is the tearing failure.** It is what broke the v5
build: the splitter was pinned by an ephemeral mount on `self9` (an *output*
face) while a light was attached at `parent10` — the partner face of the same
piece. In-game it rendered as a grid of frozen output halves plus a detached
blob of parts, and the logic went dead. `VERIFIED` An ordinary joint on both
faces of a piece does **not** tear; only mixing a **mount** with the partner
face does.

**Editor rules, in order:**

1. Never let one socket number take two joints (child side or parent side).
2. Never let a parent circle take two children.
3. An ephemeral mount consumes the whole piece: the mounted socket **and** its
   partner face become unavailable. Disable both in the UI.
4. Do **not** reject a joint merely because the partner face of the same
   piece is already in use by an ordinary joint — 69% of real creations do
   exactly that.

## 4. Socket inventory

Observed sockets per part, from the corpus (`CORPUS`). "child" = socket
numbers seen in the `self_socket` slot; "parent" = socket numbers seen in the
`parent_socket` slot.

**The full inventory is machine-readable: `data/socket_table.json`** (133
parts). It is the union of

* the corpus (106 parts — the authoritative source),
* the community `tokens.json` (110 parts — useful where the corpus has no
  example, but **partial**: for 11 parts the corpus has sockets the community
  table omits, e.g. `Chassis` has 32 parent sockets in the corpus vs 27
  listed by the community, `Roof` has 9 vs 1, `ShoppingCart` 12 vs 7),
* the community's per-part semantic names (`Output`, `InputA`, `MountPoint`,
  …) from `docs/community/RtG-Format/old-files/obj_ids-spanish.md`.

`tools/verify_catalog.py` prints the disagreements and asserts that the
merged catalogue covers every socket the corpus uses.

### Logic & signal parts

| part | child sockets | parent sockets | meaning (see §5) |
|---|---|---|---|
| `Gate-AND` | 4 | 1, 2, 3 | 4 = mount, 1 = output, 2/3 = inputs |
| `Gate-OR` | 4 | 1, 2, 3 | same |
| `Gate-NOT` | 4 | 1, 2 | 4 = mount, 1 = output, 2 = input |
| `Switch` | 1, 3 | 2 | 1 = output, 3 = mount, 2 = output (parent face) |
| `Light` | 1 | — | 1 = input |
| `BrakeLight` | 1 | — | 1 = input |
| `Splitter_1` | 3, 5 | 4, 6 | 3 = in, 5 = out |
| `Splitter_2` | 3, 5, 9 | 4, 6, 10 | 3 = in, 5/9 = outs |
| `Splitter_3` | 3, 5, 7, 9 | 4, 6, 8, 10 | 3 = in, 5/7/9 = outs |
| `Splitter_4` | 1, 3, 5, 7, 9 | 2, 4, 6, 8, 10 | 3 = in, 1/5/7/9 = outs |
| `Wire` | 1, 3 | 2, 4 | 1 = in, 3 = out (2/4 = the other faces) |
| `Looper` | 1 | 2, 3, 4 | signal repeater |
| `Delayer` | 2 | 1 | 2 = in, 1 = out |
| `TripWire` | 1, 3 | 2 | trigger |
| `Button` / `RemoteButton` | 1, 3 | 2 | 3 = mount (`INFERRED`) |

`VERIFIED` (user): **a 2-way splitter has one input and two output pieces**
— matches `Splitter_2` = 3 pieces (in / out / out).

### Structural parts (mounting, decoration)

| part | child sockets | parent sockets |
|---|---|---|
| `Base` | 3 | 1, 2, 4, 5, 6 (+ uuid keys) |
| `Anchor` | 1 | 2, 3, 4, 5 |
| `Connector` | 5 | 1, 2, 3, 4, 6 |
| `ConnectorBall` | 6 | 1 – 18 |
| `HalfConnectorBall` | 6 | 2, 3, 4, 5, 7, 10, 11, 13, 14, 15, 16, 17, 18 |
| `Part` | 1 | 2, 3, 4, 5, 6 |
| `Stick` / `ShortStick` / `LongStick` | 2 | 1 |
| `GlassBase` | 3 | 1, 2, 4, 5 |
| `Bumper` | 1 | 2 |
| `FuelTank` | 2 | 1 |
| `Canister` | 1 | 1, 2, 3, 4, 6 |
| `InputSensor` | 2 | 1 |
| `VelocitySensor` | 2 | 1 |
| `Seat`, `Wing`, `Wheel`, `Thruster`, `MountedGun`, `Gun`, `Grenade`, `Servo`, `Servo_Physics`, `Gyro`, `SteeringGyro`, `Mag`, `Piston`, `Propeller`, `Radio`, `SpringJuice`, `Leafblower`, `FishBowl`, `Camera`, `RPG`, `Uzi`, `Shotgun`, `Tire`, `Roof`, `Hood`, `Trunk`, `DoorA–D` | 1 or 2 | 1 – 4 (varies) |

`CORPUS` Corpus part frequency (top): `Connector` 11,484 · `Bumper` 5,874 ·
`Part` 2,404 · `ShortStick` 1,546 · `FuelTank` 1,432 · `Sledge` 1,314 ·
`InputSensor` 1,009 · `Base` 751 · `Thruster` 646 · `Canister` 474 ·
`Bearing` 448 · `Wire` 358 · `MountedGun` 358 · `RemoteButton` 291 ·
`Splitter_2` 274 · `Splitter_4` 261 · `Grenade` 256 · `Stick` 246 ·
`BrakeLight` 239 · `Gate-AND` 201 · `Switch` 198 · `Light` 119 ·
`Splitter_3` 100 · `Anchor` 73 · `Gate-NOT` 36 · `Gate-OR` 35.

### 4.1 The whole catalogue

`CORPUS` + community: **133 parts** are known, **121** of them have a mesh in
`meshes/rtg-format/`. The parts that exist in the game but never appear in
the corpus are still usable — the community catalogues 10 of them
(`BeachBall`, `BeachChair`, `Carrot`, `Clipboard`, `Cone`, `Googie`,
`PressurePlate`, `Splitter`, `Toilet`, `WoodenChair`).

`CORPUS` The corpus uses 106 distinct part names. The full per-part record
(`data/part_catalog.json`) carries, for each part:

```
name, category, sockets{child{}, parent{}}  # id -> {role, name, corpus_count, sources}
pieces                                     # face-pair table, for splitters/wires
props{}                                    # prop keys seen on this part
mesh{obj, min, max, size, vertices, scale, tooltip}
socket_geometry{}                         # id -> {position, basis, rotation_deg, confidence}
```

`CORPUS` Roles (`input` / `output` / `mount` / `socket`) are the in-game
verified ones from the tables above; `tools/build_catalog.py` holds them.

## 5. Signal direction rules

`VERIFIED` The joint stores *physical mating*; **direction comes from the
socket roles of the pair**, not from which side stores the entry. A light
stored as the child of a gate still *receives* from that gate.

Canonical patterns (all `VERIFIED` in-game unless noted):

| link | joint | notes |
|---|---|---|
| switch → gate input | `sw.self1 → gate.sock{2,3}` | |
| switch → light | `light.self1 → sw.sock2` | |
| gate → light | `light.self1 → gate.sock1` | |
| gate → splitter | `splitter.self3 → gate.sock1` | tap a gate's output |
| splitter → gate | `splitter.self5/9 → gate.sock{2,3}` | `CORPUS` common |
| splitter chain | `S_{i+1}.self3 → S_i.sock6` | `CORPUS` (and `CORPUS` also `S.self5 → S.sock4`) |
| 1-on-1 relay | `wire.self1 → src.sock1` + `wire.self3 → cons.sock{2,3}` | `CORPUS` 33× / 58× |
| NOT input | `sw.self1 → NOT.sock2` | |

`CORPUS` Top logic-to-logic pairs in the wild (count over 185 codes):

```
358  Base.self3      -> Base.sock4        (Base stacked on Base)
 83  Base.self3      -> Base.sock2
 82  Base.self3      -> Base.sock1
 60  Splitter_2.self3-> Switch.sock2      (switch fan-out root)
 44  Splitter_2.self3-> Gate-AND.sock1
 43  Splitter_4.self3-> Gate-AND.sock1
 38  Wire.self3      -> Gate-AND.sock2
 36  Looper.self1    -> Gate-AND.sock3
 33  Wire.self1      -> Gate-AND.sock1
 33  Splitter_2.self5-> Splitter_2.sock4  (splitter → splitter)
 31  Wire.self1      -> Gate-AND.sock2
 29  Wire.self3      -> Gate-AND.sock1
 29  Splitter_2.self9-> Gate-AND.sock3
 29  Splitter_2.self3-> Delayer.sock1
 26  Switch.self3    -> Splitter_2.sock4  (switch mounted on a splitter)
 26  Splitter_4.self3-> Splitter_2.sock10
 25  Splitter_1.self5-> Gate-AND.sock2
 24  Splitter_1.self3-> Gate-NOT.sock1
 23  Switch.self1    -> Gate-AND.sock1
 23  Splitter_2.self5-> Gate-NOT.sock2
 22  Splitter_4.self3-> Switch.sock2
 21  Wire.self1      -> Gate-AND.sock3
 19  Delayer.self2   -> Splitter_2.sock10
 19  Switch.self3    -> Gate-OR.sock1     (switch mounted on a gate)
 18  Switch.self3    -> Switch.sock2
 17  Gate-AND.self4  -> Splitter_2.sock6  (gate mounted on a splitter)
 13  Wire.self1      -> Wire.sock4        (wire → wire)
```

`CORPUS` Note that mounting a part on a *logic* circle is normal in real
builds (`Switch.self3 → Gate-OR.sock1`, `Gate-AND.self4 → Splitter_2.sock6`):
the "mount" circle of one part can sit on a logic circle of another. The
game still evaluates the logic, so **mounting and signal sharing the same
circle is legal** — but it consumes the circle for that part.

`OPEN` Direction for pairs never exercised in-game: `Looper`, `Delayer`
output, `TripWire`, `Button`, `RemoteButton`, and whether
`Switch.self3 → Gate.sock1` means "switch mounted on the gate" (structural)
or a signal edge.

**Caveat on direction:** for the pairs in the table above the direction was
confirmed by toggling in-game. For any *other* pair, the direction is
`INFERRED` from the socket-role pattern (output circle → input circle) and
could be wrong if the game instead infers direction from part types.

### 5.1 How the game evaluates a build (for live preview in an editor)

`VERIFIED`/`INFERRED` per part:

* `Switch` — state = its toggle (not persisted in the file).
* `Gate-AND` / `Gate-OR` / `Gate-NOT` — state = AND / OR / NOT of the
  values arriving on their input circles (gate 2/3, NOT 2).
* `Splitter_n` — duplicates its input value onto every output circle.
* `Wire` — relays its input value to its output circle.
* `Light` / `BrakeLight` — sink, shows the value that arrives.
* `Looper` / `Delayer` — relay with timing (`Delay`, `DelayDeactivation`).

`VERIFIED` The game recomputes a part's state when one of its *inputs*
changes; it does **not** push states downstream at spawn. A live-preview
editor should therefore evaluate the graph topologically from the current
switch states, exactly as `compile_model.py`'s `build_eval`/`eval_lights`
do — that simulator reproduces the tree model 500/500.

### 5.2 The pose model (where a part ends up)

* `VERIFIED` A part's **first** connection entry determines its pose. If that
  first entry is an ephemeral mount (§7), the part is placed by the mount's
  `cframe`. If it is an ordinary joint, the part inherits its pose from the
  parent it is attached to (and the joint's mating geometry).
* `CORPUS` Real creations rarely use ephemeral attachments (7 attachment
  points across the whole 185-code corpus, on 6 parts), so **most real
  builds are "chains"**: a part's position is implied by its parent, and
  long chains accumulate orientation/offset error (see §8.7).
* `INFERRED` An editor that wants explicit, predictable placement should
  mount every part it positions onto a host (`Base`, or any part that can
  host attachment points) with an ephemeral joint as the **first** entry.

## 6. Props catalogue

`CORPUS` Prop keys and their value types across the corpus:

| key | types | typical parts |
|---|---|---|
| `Activated` | bool (785) | `Anchor`, `Gyro`, `Light`, `BrakeLight`, `DoorA/B`, `Leafblower`, `AltitudeSensor` |
| `RGB` | list[3] int (3,763) | almost every part (colour) |
| `OrientationX` / `OrientationY` / `OrientationZ` | int/float | most parts (rotation in degrees) |
| `Delay` | int/float | `Looper`, `Delayer` |
| `DelayDeactivation` | bool | `Delayer` |
| `ActivationKey` | str (1,007) | `InputSensor` (e.g. `"LeftShift"`) |
| `ActivationSpeed` / `ActivationHeight` / `MaxDistance` / `LimitAngle` / `Speed` / `Length` / `Quantity` / `Bullets` / `ImageId` | int/float | sensors, guns, props |
| `Reverse`, `Backwards`, `Forwards`, `Rest`, `LimitEnabled`, `Shooting`, `Visible`, `Volume`, `On`, `Deactivated`, `DisabledInput`, `IgnoreAttached`, `CanTargetAttached` | bool | behaviours |
| `Channel`, `CustomTrack`, `Text` | str/int | radios, text |
| `EphemeralAttachments` | dict (6) or `[]` (46) | see §7 |

`VERIFIED` Switch state is **not** persisted (switches always have empty
props), but `Light.Activated` **is** persisted and is used as the spawn-time
visual state.

`VERIFIED` `Anchor` spawns **off**; it must be written as
`{"Activated": true}` to anchor a creation.

## 7. Ephemeral attachments (the placement mechanism)

The game can attach a child to **any point of a host part**, not just to the
host's socket circles. The host declares named attachment points in its props:

```json
"EphemeralAttachments": {
  "{83dc86a4-3a11-4c20-8b4e-5ecf518b40d0}": {
    "partName": "Base",
    "cframe": [-0.2023468017578125, 0.2500152587890625, 0.22789382934570312,
               0, 0, -1, 1, 0, 0, 0, -1, 0]
  }
}
```

* `VERIFIED` A child docks by putting the **uuid in the `parent_socket`
  slot**: `[self_socket, "{83dc86a4-…}", host_index_1based]`.
* `CORPUS` Value shape is always exactly `{partName, cframe}`; `cframe` is
  always a **12-number array**; keys are always `{uuid}` **with braces**
  (38 characters). 46 corpus parts carry `"EphemeralAttachments": []`
  (empty ⇒ the game serialises "none" as an empty array, like `props`).
* `CORPUS` Hosts that use it in the wild: `Base` (3), `Roof` (2), `Trunk` (1)
  — so any part can host attachment points.
* `CORPUS` `partName` is the name of the **sub-piece of the host** that the
  point belongs to, which is usually the host's own name but not always
  (a `Roof` host declares `"partName": "Glass"`, a `Trunk` host `"Door"`).
* `VERIFIED` `cframe` order = Roblox `CFrame:GetComponents()`: position
  first (x, y, z), then the rotation matrix **row-major**
  (`r00,r01,r02,r10,r11,r12,r20,r21,r22`). All real corpus rotations are
  proper (det = +1).
* `INFERRED` The position is a **host-local offset** (all corpus offsets are
  sub-unit, e.g. ±0.25), not a world coordinate. Our generator used large
  values (−20…+58) and the result rendered as a grid extending away from the
  `Base`, which is consistent with host-local semantics.
* `OPEN` Does the host's own `OrientationX/Y/Z` prop rotate its attachment
  points? Does the child's orientation come from the cframe, or from how the
  child's mating circle meets the point? Experiment: put one gate on a `Base`
  with a 90°-rotated cframe and see which way its sockets face.
* `VERIFIED` **The first connection entry of a part sets its pose.** A part
  whose first joint is an ephemeral mount is placed by that mount; parts
  whose first joint is an ordinary joint inherit their pose from the parent
  chain. Emitters must put the structure/mount joint first.

### 7.1 Which socket may carry an ephemeral mount?

* `VERIFIED` Gates mount with `self4`, switches with `self3` (their real
  mount circles).
* `VERIFIED` A splitter can be pinned by an ephemeral joint on **`self9`**
  (one of its *output* faces) — a probe with the exact pattern
  `[self9 → uuid], [self3 → gate.sock1], [self5 → gate.sock2]` spawned
  pinned, with correct logic. So an ephemeral mount is **not** restricted to
  a dedicated mount circle — but it *does* consume that circle, and both
  faces of that piece must then stay unused (§3.1).

## 8. Physical behaviour that an editor must respect

These are in-game observations (`VERIFIED`) that are not visible in the file
format but decide whether a blueprint works:

1. **Unmounted relays dangle and drift.** A `Splitter_2`/`Wire` that is only
   signal-jointed hangs off its mate, and the creation's free ends wander.
   In a 2,000-part build the splitter chains visibly floated away.
2. **Parts with an ephemeral mount stay put.** Mounting every gate/switch
   (and, where the piece budget allows, every relay) to a host part pins
   them.
3. **A creation is a rigid body.** Even fully mounted, a big creation can
   tip/translate as one piece. `Anchor` parts (with `Activated: true`)
   freeze it — 4 anchors at the corners of the layout held a 2,000-part
   wall in place (`VERIFIED`).
4. **Joints behave like cables with a maximum length** for parts that are
   not anchored; long free spans cause parts to be flung around. A 13-unit
   span between two *anchored* parts was stable in a small probe.
5. **Spawn state does not propagate.** A gate renders its own state at
   spawn but does not push it downstream until an input changes once
   (`VERIFIED`). Set `Light.Activated` to the expected spawn state; the
   first switch flip then corrects the whole network.
6. **Relays cost performance.** A `Splitter_2` used as a 1-on-1 relay is
   heavier than a `Wire`; ~500 idle splitters caused noticeable lag in
   play. Use `Wire` for 1-on-1 taps.
7. **Lattice chains drift/rotate.** Connecting `Connector` parts face to
   face in a chain (`connB.self5 → connA.sockX`; 8,488 such joints in the
   corpus) can accumulate 90° rotations and spiral upward; it is a
   construction pattern, not a placement mechanism.

## 9. Editor implementation notes

**Parsing / serialising**

* Accept sockets as `str` or `int`; normalise on load (keep the original
  type if you want byte-faithful round-trips).
* `parent_index` is 1-based; store 0-based internally and convert on write.
* `props` may be `[]`; treat `[]` and `{}` as "no props" but write back `[]`
  to match the game.
* Keep `EphemeralAttachments` keys as opaque strings; do not reformat the
  uuid (the game writes `{…}` with braces, 38 chars).

**Validation the editor should offer (in priority order)**

1. one mate per circle — a socket number takes at most one joint, on either
   side, and a parent circle takes at most one child;
2. a circle consumed by an **ephemeral mount** is unavailable, and so is the
   **partner face** of that circle's piece (this is the only rule whose
   violation destroys the build — §3.1);
3. `parent_index` in range, never the part itself;
4. `parent_socket` is a known socket number of the parent **or** a uuid
   declared in the parent's `EphemeralAttachments`;
5. every `EphemeralAttachments` uuid referenced by exactly one joint;
6. no cycles in the *structural* graph (signal graph may be a DAG; the
   corpus even contains joint cycles);
7. warn when a part has no mount (it will dangle) and when a build has no
   `Anchor` (it may tip);
8. warn — do not reject — when both faces of one piece carry ordinary joints
   (69% of real creations do).

**Editing operations that need bookkeeping**

* **Reordering entries** ⇒ rewrite every `parent_index` (it is a positional
  1-based index, not a stable id). Keep a stable internal id per part.
* **Deleting a part** ⇒ also delete/redirect the joints that referenced it
  (`parent_index` pointing at it) and the joints it stored.
* **Adding a joint** ⇒ re-check §3.1 *before* writing: one mate per circle,
  and a circle already consumed by an ephemeral mount (or by the partner face
  of a mounted circle) is unavailable.
* **Moving a part** ⇒ change the `cframe` of its mount attachment; do not
  move it by moving its parent (that would move everything below it).
* **Toggling a switch** is *not* a file edit: switch state is not persisted
  (`VERIFIED`). An editor that wants to save a "switch configuration" has
  to encode it some other way (e.g. in the part's props) — the game has no
  such field.

**Suggested internal model**

```
Part {
  id, name, props{}, sockets: {socketNumber -> {piece, face, role, jointId?}}
  children: [jointId], parentJoints: [jointId]
}
Joint { childPartId, childSocket, parentPartId, parentSocketOrUuid }
Host  { partId, attachments: {uuid -> {partName, cframe[12]}} }
```

Keep *pieces* as first-class objects so the editor can (a) mark a circle as
consumed when it takes a joint, (b) mark the **whole piece** as consumed when
an ephemeral mount uses one of its faces, and (c) colour code input/output
faces. A piece is *not* a usage limit: both faces of a piece may carry
ordinary joints (§3.1).

The socket table, roles, pieces and props for every part come from
`data/part_catalog.json` — the editor should read them from there rather than
hard-code them, so the catalogue can be regenerated as new parts are found.

**UI affordances that the format allows**

* Free placement: give every part an ephemeral mount on a host and let the
  user drag it in 3D (cframe = position + optional rotation). This is how a
  "clean grid" is achievable without chains.
* Logical re-parenting: an editor can show the *signal graph* (from socket
  roles) separately from the *physical graph* (from joints) — they are
  different graphs over the same triples.
* Undo/redo is safe if it operates on the entry array + joint list only.

## 10. Part geometry, meshes and units

Everything a 3D editor draws comes from outside the blueprint format.

**Units.** `VERIFIED` 1 unit = 1 Roblox stud. The exported part meshes use
that space directly, and the generic `Part` is exactly 1 × 1 × 1 with its six
socket transforms sitting on the six faces at ±0.5. So a mesh can be rendered
1:1 and its sockets land on it without any scaling fudge.

**Meshes.** `meshes/rtg-format/<Part>/<Part>.obj` — 121 parts, plus
`<Part>.json` with the render scale and tooltip. `meshes/workshop/<Part>/`
holds the same parts from a second exporter, with `.mtl` material files and 43
`.png` textures (the RtG-Format export ships only 2 textures). Each `.obj` is
a single named object with no socket markers, so the socket circles are *not*
in the geometry.

**Socket geometry is the missing dataset.** The format never stores where a
socket is; only which socket mates which. `CORPUS` + community gives the
socket *ids* for 133 parts, but transforms exist for just **3**:

| part | sockets | source | confidence |
|---|---|---|---|
| `Part` | 1–6 | `vendor/grambys-workshop` `Part.tscn` | editor scene; the transforms land exactly on the mesh faces, so they are real |
| `Switch` | 2 | community model JSON `LocalPoints` | community value, plausible but unverified |
| `AltitudeSensor` | 1 | community model JSON `LocalPoints` | **placeholder** — `[0, 2, 0]` while the mesh is 0.6 × 0.48 × 0.6 |

`OPEN` Everything else. `docs/SOCKET_GEOMETRY.md` has the capture procedures
and the file format for the results; `tools/merge_geometry.py` folds a
capture into `data/part_catalog.json` and `tools/verify_catalog.py` then
checks every transform against its own mesh bounding box.

**Attachment frame convention.** A socket's mating direction is the **local
+Z axis** of its attachment frame (the Workshop's `Attachment.tscn` puts its
marker mesh at local +Z). For the generic `Part`, socket 2 sits on the +X
face with its +Z pointing along +X, i.e. +Z points *out* of the part.

## 11. What the loader does (community measurement)

Independently measured by the community (`JuanCrakYT/RtG-Format`, spec v0.406,
marked "experimentally confirmed") and consistent with everything above. It is
the closest thing we have to the loader's source.

| phase | what happens |
|---|---|
| 1 | structural validation — JSON syntax, tuples, `LocalType` strings |
| 2 | instantiate every object in memory |
| 3 | resolve the index graph (parent → child hierarchy) |
| 4 | bind UUIDs and `EphemeralAttachments` (index them, read the cframes) |
| 5 | apply properties — **unknown keys are ignored** |
| 6 | reconstruct geometry and start the solver |

* `CORPUS`/`community` Unknown **property** keys are ignored silently; the
  part still loads. An editor may therefore write extra keys safely.
* `community` Unknown **structural** references are *not* repaired: an
  out-of-range `parent_index` or a UUID that the parent never declared
  aborts the load or leaves the part disconnected.
* `community` Changing the first field of a connection (`TipoLocal`, i.e. the
  child-side socket) from `"1"` to `"2"` is rejected outright with the alert
  **`"Build inválida"`** and nothing is instantiated. This independently
  confirms that the child-side socket id is a strictly validated contract —
  not decorative.
* `community` The same alert appears for an out-of-range `parent_index`, a
  reordered array, or a dangling UUID reference.

`OPEN` The exact set of loader validation rules is still unknown; the
community's own `research/unknowns.md` lists 20 open items.

> Note on naming: the community calls the first field of a connection
> `TipoLocal` and the second `LocalIDs`/`PuntoPadre`. Their *values* are
> identical to this document's "child socket" and "parent socket" (their
> `LocalType` table for `Switch` is `["1","3"]`, exactly the corpus child
> sockets); only the interpretation differs. Two other projects
> (`Gramby's Workshop`'s serializer, `JuanCrakYT/RtG-Image`) name the fields
> `RootAttachment` / `ParentAttachment`, which matches this document.

## 12. Open questions (ranked by usefulness for an editor)

1. `OPEN` **Coordinate space of `cframe`** — host-local (likely) vs world.
   Test: two hosts at different positions, one attachment each; see whether
   the children move with their hosts.
2. `OPEN` **Does the child's orientation follow the cframe rotation?** and
   does the mating circle's direction matter? Test: one gate, one host, two
   attachments with 90°-rotated cframes; compare socket facing.
3. `OPEN` **Do host `Orientation*` props rotate the host's attachment
   points?** Test: rotate the host's `OrientationZ` and re-check.
4. `OPEN` **Ceilings**: maximum entries, maximum code length, maximum
   children per part, maximum joints per part.
5. `OPEN` **Is `partName` inside an attachment required to match a sub-part
   of the host?** (Corpus: usually yes, but `Roof`→`Glass`.) What happens
   with a wrong name — ignored, or rejected?
6. `OPEN` **Direction semantics** for `Looper`, `Delayer`, `TripWire`,
   `Button`, `RemoteButton`, `Anchor` (does an anchored part still pass
   signals?).
7. `OPEN` Does the game rewrite/reorder entries when it saves a build?
   (Affects diffing and merge strategies in an editor.)
8. `OPEN` Are there part types that reject unknown props, and which props
   are per-part whitelisted?
9. `OPEN` Behaviour of `Splitter_3`/`Splitter_4` as *mounted* relays (probe
   prepared, not yet run in-game).
10. `OPEN` Whether the second and later `Anchor` parts behave identically to
    the first (4 anchors worked in one build; single-anchor probe also
    worked).
11. `OPEN` **Socket geometry for the other 130 parts** — the largest remaining
    gap for a 3D editor (see §10 and `docs/SOCKET_GEOMETRY.md`).
12. `OPEN` Whether the `Switch` circle 1 / circle 2 roles are "output then
    input" or the reverse. The corpus and the community disagree on the
    naming (the community's `obj_ids` calls circle 1 "Output", its own model
    JSON makes circle 2 the output branch). One in-game test settles it:
    wire a light to circle 1 and another to circle 2, toggle, and see which
    one lights.

## 13. Verification helpers in this repo

All under `tools/`.

| file | what it does |
|---|---|
| `blueprint.py` | encoder/decoder + `Blueprint` class, socket tables, `validate()` |
| `analyze_format.py` | corpus-wide structure stats (sockets, props, invariants) |
| `analyze_ephemeral.py` | `EphemeralAttachments` shapes + prop value types |
| `analyze_eph_list.py` | list-vs-dict serialisation of attachments |
| `analyze_logic.py` | logic-to-logic joint frequencies, size distribution |
| `analyze_head.py` | decoded head/tail of codes (structure sanity) |
| `scrape_wiki2.py` | re-scrape the corpus (`data/corpus/wiki_codes.txt`) |
| `verify_spec.py` | **self-check**: re-verifies every number/table in this document against the corpus (120 checks) |
| `verify_doc_samples.py` | **self-check**: decodes every sharecode quoted in this document |
| `build_catalog.py` | **builds** `data/part_catalog.json`, `socket_table.json`, `props_schema.json`, `corpus_stats.json` from the corpus + the community datasets |
| `verify_catalog.py` | **self-check**: cross-checks the catalogue against the corpus, the community table and `blueprint.py`; checks the joint/piece invariants and the geometry against the mesh bboxes |
| `piece_usage_stats.py` | measures how often both faces of one piece are used (the §3.1 evidence) |
| `inspect_piece_violations.py` | prints concrete builds that use both faces of a piece |
| `merge_geometry.py` | folds a captured socket-geometry file into the catalogue; `--show` lists what is known |
| `compile_model.py` | reference generator: MNIST tree → sharecode (2,385-part build) + the graph simulator used for live preview |
| `test_blueprint.py` | 14 regression tests over the encoder/validator |
| `gen_relay_probe.py`, `gen_anchor_probe.py`, `gen_splitter3_probe.py` | in-game probes used to establish §7/§8 |

Run everything:

```
python tools/verify_spec.py        # 120 corpus checks against this document
python tools/verify_doc_samples.py # decode every code quoted here
python tools/build_catalog.py      # regenerate data/*.json
python tools/verify_catalog.py     # cross-check the catalogue
```

## 14. What changed in this revision (2026-10-22)

| change | detail |
|---|---|
| **§3.1 corrected** | "one joint per piece" was never true and was never measured. 69.2% of real creations use both faces of one piece. The rule that *is* supported by 185/185 builds is listed in §3.1: one mate per circle, and **a mount consumes its whole piece**. The tearing failure was reproduced with a *mount* + partner-face joint, not with two ordinary joints. |
| **tooling bug fixed** | the piece check keyed faces with the child's table but looked up the parent's socket, and used int keys against string socket numbers — so it never fired. Fixed in `analyze_format.py` and `verify_spec.py` (now 120 checks, all passing). |
| **§4 + §4.1 added** | the socket inventory is now a machine-readable catalogue of 133 parts (`data/socket_table.json`), merged from the corpus and the community `tokens.json`, with the disagreements between them recorded. |
| **§10 added** | meshes, units (studs), the socket-geometry dataset and its state (3 of 133 parts), plus the attachment-frame convention. |
| **§11 added** | the loader's six-phase model, its permissive property handling and its strict structural validation, as measured by the community — including the `"Build inválida"` alert. |
| **§12 expanded** | the remaining socket-geometry gap and the `Switch` circle-role conflict are now explicit open questions. |
| **new tooling** | `build_catalog.py`, `verify_catalog.py`, `piece_usage_stats.py`, `inspect_piece_violations.py`, `merge_geometry.py`. |

## Appendix A — a complete real sharecode, decoded

Real creation from the wiki corpus (12 entries, 672 chars):

```
W1siQ29ubmVjdG9yIixbWyI1IiwiMSIsMTFdXSxbXV0sWyJDb25uZWN0b3IiLFtbIjUiLCIxIiw3XV0sW11dLFsiV2lyZSIsW1siMyIsIjMiLDEwXSxbIjEiLCIxIiw0XV0sW11dLFsiRGVsYXllciIsW10seyJEZWxheURlYWN0aXZhdGlvbiI6dHJ1ZSwiRGVsYXkiOjAuMSwiUkdCIjpbMjEsOTUsMTYzXX1dLFsiTG9vcGVyIixbWyIxIiwiMiIsMTBdXSx7IkRlbGF5IjowLjE1fV0sWyJTaG90Z3VuIixbWyIyIiwiMiIsOF1dLHsiT3JpZW50YXRpb25aIjozNjAsIk9yaWVudGF0aW9uWSI6MzYwLCJPcmllbnRhdGlvblgiOjQ1MH1dLFsiQ29ubmVjdG9yIixbWyI1IiwiMiIsM11dLFtdXSxbIldpcmUiLFtbIjMiLCIxIiwxMF0sWyIxIiwiNiIsMV1dLFtdXSxbIk1hZyIsW1siMSIsIjEiLDZdXSx7IkJ1bGxldHMiOjFlMjJ9XSxbIkdhdGUtQU5EIixbWyI0IiwiNiIsMTJdXSxbXV0sWyJDb25uZWN0b3IiLFtbIjUiLCIyIiwxMl1dLFtdXSxbIkNvbm5lY3RvciIsW1siNSIsIjMiLDJdXSxbXV1d
```

decodes to:

```json
[["Connector",[["5","1",11]],[]],
 ["Connector",[["5","1",7]],[]],
 ["Wire",[["3","3",10],["1","1",4]],[]],
 ["Delayer",[],{"DelayDeactivation":true,"Delay":0.1,"RGB":[21,95,163]}],
 ["Looper",[["1","2",10]],{"Delay":0.15}],
 ["Shotgun",[["2","2",8]],{"OrientationZ":360,"OrientationY":360,"OrientationX":450}],
 ["Connector",[["5","2",3]],[]],
 ["Wire",[["3","1",10],["1","6",1]],[]],
 ["Mag",[["1","1",6]],{"Bullets":1e+22}],
 ["Gate-AND",[["4","6",12]],[]],
 ["Connector",[["5","2",12]],[]],
 ["Connector",[["5","3",2]],[]]]
```

Reading it:

* entry 0 (1-based 1) is a `Connector` with **no joints** → a root; entry 1
  mounts onto it with socket 5 → socket 1.
* the `Wire` at 1-based 3 uses **two different pieces** (its 3/4 piece and
  its 1/2 piece) — legal; using both faces of one piece would not be.
* `Gate-AND` (1-based 11) has a single joint `["4","6",12]`: it is *mounted*
  (socket 4) onto the `Connector` at 1-based 12, socket 6.
* `"Bullets":1e+22` shows the Lua-style exponent spelling; a Python
  round-trip writes `1e+22` too, but Lua may write `1e22` — same value.

The smallest real code in the corpus is a single part:

```
W1siVHJpcFdpcmUiLFtdLHsiQWN0aXZhdGVkIjpmYWxzZSwiTGVuZ3RoIjozMH1dXQ==
```

→ `[["TripWire",[],{"Activated":false,"Length":30}]]`

## Appendix B — minimal working example (hand-written, `VERIFIED` in-game)

```json
[["Base",[],{"EphemeralAttachments":{
   "{uuid1}":{"partName":"Base","cframe":[0,0,0,1,0,0,0,1,0,0,0,1]},
   "{uuid2}":{"partName":"Base","cframe":[2,0,0,1,0,0,0,1,0,0,0,1]}}}],
 ["Switch",[["3","{uuid1}",1]],[]],
 ["Gate-NOT",[["4","{uuid2}",1]],[]],
 ["Light",[["1","2",3]],{"Activated":true}]]
```

Switch → NOT → Light, both parts pinned to the `Base` by ephemeral mounts,
light on at spawn.
