# Road to Gramby's blueprint/sharecode format

> The authoritative **format spec** (for building a blueprint editor) lives in
> `RTG_BLUEPRINT_FORMAT.md`. This file is the chronological build log and
> spawn reports; its socket counts come from an older corpus scrape.

Reverse-engineered 2026-10 from three sources: the user's own saves (cube,
AND/NOT/splitter examples), 184 real sharecodes scraped from the wiki's
Creations page, and the wiki's Sharecodes article.

## Pipeline

```
sharecode = base64( compact JSON )      # standard alphabet (+/), padded, single line
JSON      = [ entry, entry, ... ]       # array of part entries
entry     = [ name, connections, props ]
```

- Encoding: UTF-8, compact separators (`,` `:`), no spaces. See `blueprint.py`.
- Base64: standard alphabet with `=` padding; 64/199 observed real codes carry
  padding, so the game accepts it.
- Round-trip is byte-exact on 122/184 real codes; the rest differ only in
  numeric spelling (Lua writes `90.7658672332763671875` / `1e22`, Python writes
  `90.76586723327637` / `1e+22` — identical values after JSON parsing).

## Entry fields

| field | type | notes |
|---|---|---|
| name | string | part id, e.g. `"Gate-AND"`, `"Splitter_2"` |
| connections | array | triples; `[]` for detached parts |
| props | object or `[]` | the game writes `[]` (empty array!) when a part has no props |

Observed props: `{"Activated": bool}` (Light, BrakeLight, Gyro...),
`{"RGB":[r,g,b]}`, `{"OrientationX/Y/Z": float}`, `{"Delay": float}` (Looper),
`{"ActivationKey":"LeftShift"}` (InputSensor), servo fields, etc.
Switch state is NOT saved (switches always have empty props).

## Connection triple

```
[ self_socket, parent_socket, parent_index ]
```

- `self_socket`: attach point on the part that stores the entry (the *child*).
- `parent_socket`: attach point on the part being attached to.
- `parent_index`: **1-based index into the top-level entry array**.

Evidence for 1-based index (verified):
- User's cube: N=20, root Connector at index 9 is referenced as `C=10` by
  exactly its 3 children; all 19 refs ∈ 1..18; leaves are never referenced.
- Gate examples: gate at index 1 referenced as `C=2`; gate at index 3 → `C=4`.
- 184 wiki codes: all 37,108 integer refs ∈ 1..N, connection count ≈ N − roots.

Single-sided: only the child stores the joint ("the data is inside the attached
part" — wiki). Parents do not list children. Entries with `[]` are roots; real
codes have 1–3 roots (detached parts spawn fine).

Socket values may be ints or strings in real saves (`["1",10,32]` occurs); the
loader coerces. We emit sockets as strings, index as int, matching the user's
own saves.

Non-integer third element (`{uuid}`): rare external reference (part attached to
something outside the save, 7/37,108 observed). Not used by the generator.

## Ephemeral attachments (user-discovered mechanic)

The game supports attaching a child to **any point on a host part**, not just
its socket circles: the host's `props.EphemeralAttachments` declares named
connection points with editable coordinates:

```json
"EphemeralAttachments": {
  "{<uuid>}": {"partName": "<host part name>",
               "cframe": [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22]}}
```

A child then docks with the uuid in the `parent_socket` slot:
`[self_socket, "{<uuid>}", host_1based_idx]`.

- `cframe` order = Roblox `CFrame:GetComponents()`: position first, then the
  rotation matrix **row-major** (verified: the user's example is a proper
  det=+1 rotation). The generator uses identity `[1,0,0,0,1,0,0,0,1]`.
- Mount sockets: gates use self4, switches self3 (their normal mount points).
- Joint ordering matters: the **first connection entry sets pose** (v1
  evidence), so the structure joint (self→uuid) is emitted before signal joints.

## Signal semantics

The same triple carries both physical joints and logic wiring. Direction of a
signal is determined by the roles of the two sockets involved (output circle →
input circle), NOT by which side stores the entry:

- Light (sink) as child of gate: `light.self1 → gate.sock1` with gate as parent,
  while signal flows gate → light.
- Splitter as child of both switch (signal in) and gate (signal out).
- Wire parts relay: they appear with 2–4 connections, both as child and parent.

Verified socket roles (from the user's working examples + consistent patterns
in wiki codes):

| part | self sockets (as child) | receive sockets (as parent) |
|---|---|---|
| Gate-AND / Gate-OR | 4 (mount) | 1 = **output**, 2/3 = **inputs** |
| Gate-NOT | 4 (mount) | 1 = **output**, 2 = **input** |
| Switch | 1, 3 | 2 |
| Light | 1 (input) | (never observed as parent) |
| Splitter_1 | 3, 5 | 4, 6 |
| Splitter_2 | 3 (in), 5/9 (out) | 4, 6, 10 |
| Splitter_3 | 3 (in), 5/7/9 (out) | 4, 6, 8, 10 |
| Splitter_4 | 1 (in), 3/5/7/9 (out) | 2, 4, 6, 8, 10 |
| Connector | 5 (mount) | 1, 2, 3, 4, 6 |
| ShortStick / Stick | 2 | 1 |
| Wire | 1, 3 | 2, 4 |

Caveat (open question): whether a signal link *requires* the correct
output→input socket pairing or the game infers direction from part types is not
fully confirmed — splitter/switch interactions in real codes are ambiguous
(e.g. real wires attach `self1` to gate socket 1 in one build and gate socket 2
in another). Functional in-game tests resolve this (see README/round 2).

## In-game verification (round 1, 4/4 spawned)

- Control (AND example re-encoded): spawned exactly as described — switch
  output circles landed on gate inputs (sockets 2/3), light on the output
  square (socket 1). Confirms switch `self1` is its output circle and gate
  socket roles visually.
- Index probe (gate last, forward references): spawned fine → children may
  precede parents in the array; index resolution is not spawn-order-dependent.
- Structure probe (connector→stick→connector): correct dumbbell, same joints
  as the real cube.
- Control 2 (splitter/OR): multi-connection entries and RGB props accepted.
- Switch states are NOT persisted in sharecodes (user-confirmed) — toggles
  reset on spawn; `Light.Activated` prop does persist as spawn state.

## In-game verification (round 2, all functional tests passed)

Signal flow verified end-to-end (user toggle checklist, 6/6):

| link | wiring | status |
|---|---|---|
| switch → gate input | `switch.self1 → gate.sock{2,3}` | works |
| gate → light | `light.self1 → gate.sock1` | works |
| NOT behavior | light on at spawn (`Activated:true`), flips with switch | works |
| gate → splitter → gate chain | `splitter.self3 → gate.sock1`, `splitter.self5/9 → gate.sock{2,3}` | works (`(A∧B)∧C` confirmed) |
| switch → splitter | `splitter.self3 → switch.sock2` | works (control 2) |

Why splitters sit between gates: a gate's only self socket is its mount (4) —
gates expose no output circle of their own to attach *from*, so tapping a gate
output requires a wire/splitter whose input docks onto gate socket 1. The
splitter then re-emits on its own output circles (5/9, etc.). This doubles as
fanout (2–4 outputs per splitter), the network's basic distribution primitive.

**Spawn-state propagation quirk (user-discovered):** at spawn, a gate renders
its own activated state, but does NOT push that state to downstream parts until
its inputs change once. Example: NOT gate (output on) → BrakeLight: brake light
stays off after spawn despite the gate showing activated; first toggle updates
everything. Mitigation for generated builds: set each output `Light.Activated`
prop to the network's expected spawn-state prediction (all switches off), and
note that the first switch flip self-corrects the whole network.

Splitters only exist as `Splitter_1`..`Splitter_4`.

## The compiler (`compile_model.py`)

Compiles the exp4-winning tree (k=9, t=0.2, md=8, min_leaf=2; val 0.7578,
test 0.7626) into `digit_net.sharecode` + `model.json`. One joint per circle on
both sides is enforced (same invariant that held across 37,361 real
connections).

Fabric rules used (each verified in-game or in real saves):

| link | joint | origin |
|---|---|---|
| switch → gate input (f=1) | `sw.self1 → gate.sock{2,3}` | round 2 |
| switch → light (f=1) | `light.self1 → sw.sock2` | real data (8×) |
| switch fanout (f≥2) | root `S1.self3 → sw.sock2`, then tree | round 2 + real |
| gate → light (f=1) | `light.self1 → gate.sock1` | round 1/2 (T1) |
| gate tap (else) | `S1.self3 → gate.sock1` | round 2 (T6) |
| splitter chain | `S_{i+1}.self3 → S_i.sock6` | real data (verified pattern) |
| splitter → gate | `S.self5/9 → gate.sock{2,3}` | round 2 |
| splitter → light | `light.self1 → S.sock{6,10}` | real data (4×) |
| NOT input | `sw.self1 → NOT.sock2` | round 2 |
| 1-on-1 relay (gate f=1) | `wire.self1 → src.sock1` + `wire.self3 → cons.sock{2,3}` | real data: 17 wires do gate→wire→gate on the same wire |
| gate/switch mount | `self4`/`self3 → Base "{uuid}"` | ephemeral attachment (user's format) |

- Digit merge: L leaves → L−1 `Gate-OR` chain → light. Fanout placement uses
  each splitter circle at most once: chain occupies circle5 (parent side 6),
  consumers take circle9 (or circle5/9 on the last splitter).
- Fanout source rules: switch f=1 = direct joint (0 extra parts); gate f=1
  (non-light) = **Wire relay** (wires are 4-socket common nodes: self1/self3/
  parent2/parent4; verified relay: real builds chain gate→wire→gate 17×, and
  the user confirmed wires replace splitters for 1-on-1 links — Splitter_2 is
  1 body + 2 relay circles and was the main lag source at ~500 idle relays);
  f≥2 = Splitter_2 tree (proper 2-terminal use).
- Dead pixels: MNIST border pixels binarize (9×9, t=0.2) to all-zero columns,
  so the tree never tests them — 45/81 switches had no signal joint at all.
  Compiler omits switches on dead pixels: 36 live switches.
- Structure (v3): one `Base` root (entry 0) + `EphemeralAttachments`. Layout:
  36-switch raster panel at `(2·col, −2·row, 0)`; the 10 digit-display gates
  (the sources feeding lights) in a row at `y=+4`; the remaining ~780 gates in
  a 40-col grid starting `(−20, −24)`; splitters/wires/lights keep their
  signal-joint placements. 826 uuid attachments, all deterministic
  (`uuid5(ns, tag)`).
- Offline proving test: the emitted network is simulated (topological
  evaluation of every joint, Wire modeled as pass-through) and compared against
  `tree_predict` on 500 real test images — 500/500 match, exactly one light lit
  per input. Also validates strict + double-joint invariants + exact test
  accuracy (0.7626).
- Result (v3): 2060 parts (1 Base, 36 Switch, 10 Light, 508 AND, 246 OR,
  36 NOT, 728 Splitter_2, 495 Wire — no connectors/sticks, roots=1);
  270,136-char sharecode; spawn prediction = digit 7 (`Light.Activated`).

Spawn report (v1, 3 screenshots):

- Everything functions but lags: 495 of the 1223 Splitter_2 were 1-on-1 relay
  taps → replaced by Wires in v2.
- Lattice rendered as an upward spiral, not a grid: the v1 stick pattern mated
  `conn.self5` onto a horizontal stick end, forcing a 90° reorientation per
  link that accumulated. v3 removes the lattice entirely: every part is hung
  on the Base via uuid points (flat, all z=0).
- v2 lattice (direct `connB.self5 → connA.sockX` chains, the pattern real
  builds use 8511×) was never spawned — superseded by the Base design.
- `gen_probe.py` (socket-direction probe) is obsolete now that the lattice is
  gone.

## Spawn reports (v3/v4 + probes)

- v3 (Base-mounted gates/switches, free-floating splitter/wire relays): gates
  and switches held; splitter chains spiraled/stacked and long free-floating
  spans bugged out.
- v4 (all 1544 relays Base-mounted via `[S.self9 → Base uuid]`, mount FIRST;
  no Wire parts; relay grid over gate grid at z=+4): still moved — but as one
  rigid piece, logic intact.
- Relay probe (7 parts, exact v4 joint pattern, short spans): pinned, logic
  correct after toggle. Span probe (same, ~13u spans): holds, logic correct.
  Conclusion: output-ball uuid mounts pin correctly and even long spans hold
  at small scale; v4's failure mode is whole-creation rigid motion (tipping),
  not joints breaking.
- Anchor probe: `Anchor` spawns OFF by default and does nothing; with
  `props {"Activated": true}` (user-supplied code confirms the prop) it
  anchors the creation. v5 = v4 topology + 4 Activated anchors at the
  footprint corners (2385 parts, 607,108 chars).
- v5 failure dissected (user photos): Splitter_2 = three pieces P34/P56/P910
  (child/parent face pairs (3,4),(5,6),(9,10)). v5 put joints on BOTH faces
  of one piece (child5→far gate + parent6→next relay; child9 mount + light
  on parent10) -> pieces tore off: grid of frozen pinned outputs + detached
  blob + dead switches. Hard rule: ONE joint per piece. Probes passed only
  because single relays never double-mate.
- v6: reverted to v3 emission (each consumer occupies one circle index, so
  no piece is ever double-mated; verified 0 violations over 1223 relays) +
  gates/switches Base-mounted + 4 Activated anchors. No relay mounts, no
  relay grid. 2064 parts, 271,124 chars.

## Known limits / unknowns

- Max blueprint size/length: exists, unmeasured. v3's sharecode is 270,136
  chars (2060 parts + 826 attachments), ~2.7× the largest observed real save
  (98,352 chars) — untested; if the game rejects it, shrink attachment payload
  (fewer/shorter cfacts) or split into staged loads.
- Part list is not exhaustively catalogued here; `blueprint.py` socket tables
  cover logic + structural parts relevant to this project. Unknown parts still
  encode fine — validation just warns instead of confirming.
- The wiki's only published sample code (`W1siUlBHLixbXSxbXV0s...`) is corrupt
  (does not parse).

## Sources

- `analyze.py` / `analyze2.py`: statistics over scraped wiki codes (source file
  path inside; re-scrape if needed from
  https://road-to-grambys.fandom.com/wiki/Creations).
- User-provided: cube save, AND/NOT/splitter examples, gate screenshot.
