# Socket geometry — the one dataset we do not have

## The problem

The blueprint format tells you **which** socket mates **which** socket. It
never says **where** the sockets are. A 3D editor has to know that, say,
`Gate-AND` circle 2 sits on the gate's left face and points along −X, because
that is what makes two parts snap together visually.

Everything else is solved:

| need | status |
|---|---|
| which parts exist | 133 (`data/part_catalog.json`) |
| which socket ids each part has (child + parent side) | done for all 133 |
| what each socket *means* (input / output / mount) | done for the logic parts, in-game verified |
| which sockets are the two faces of one piece | done for the splitters and wires |
| prop schema | 36 keys, types and per-part usage |
| part meshes, in studs | 121 parts |
| **where each socket is** | **3 parts** |

## Why the obvious sources do not have it

* **The corpus cannot.** 185 real sharecodes, 37,115 joints — and not one
  carries a coordinate. The format has no field for one. (`§7.3` of the spec:
  "no absolute 3D coordinates for standard blocks".)
* **The community's model JSON does not.** Each part's `<Part>.json` has a
  `LocalPoints` map, but only 2 of 120 parts actually populate it (`Switch`
  and `AltitudeSensor`), and the `AltitudeSensor` value is a placeholder
  (`[0, 2, 0]` for a mesh that is 0.6 × 0.48 × 0.6 studs).
* **The community's per-part reference docs do not.** They are generated from
  the JSON above, so they inherit the same emptiness — `Gate-AND.md` says
  *"No predefined connection points"*, which is wrong: it has four.
* **The exported meshes do not.** Each `.obj` is a single named object with
  no socket markers; the circles are separate runtime attachments.
* **The existing 3D preview does not.** `vendor/rtg-preview/preview.js`
  places parts using `LocalPoints`, so it can only position the two parts
  that have them — everything else falls back to "place them in a line to the
  side" (`preview.js:1440`).

## The one confirmed dataset

`vendor/grambys-workshop/Scripts/GrambyObjects/Part/Part.tscn` contains real
Godot attachment nodes for the generic `Part`:

| socket | position | outward direction |
|---|---|---|
| 1 | (0, −0.5, 0) | −Y |
| 2 | (+0.5, 0, 0) | +X |
| 3 | (−0.5, 0, 0) | −X |
| 4 | (0, 0, −0.5) | −Z |
| 5 | (0, 0, +0.5) | +Z |
| 6 | (0, +0.5, 0) | +Y |

The generic `Part`'s mesh is exactly 1 × 1 × 1, so these transforms land on
the six faces — which is why they can be trusted even though they come from
an editor scene rather than the game. They also fix the **frame convention**:
a socket's mating direction is its attachment's local **+Z**.

## Three ways to capture the rest

### A — In-game measurement (no tooling, no account risk)

The socket circles are rendered on every part in the game.

1. Build a code with exactly one instance of the part, mounted on a `Base`
   by an ephemeral attachment so it cannot drift.
2. Use the `Base` as the scale ruler: its mesh is exactly 4 × 0.5 × 4 studs,
   so pixels-per-stud = measured Base width / 4.
3. Screenshot head-on (avoid perspective; use the top-down camera).
4. Measure each circle's centre relative to the part's origin (the centre of
   its mesh bounding box, which `data/part_catalog.json` already stores).
5. Read the outward direction off the circle's colour/shape.

Cost: roughly 5 minutes per part, and only needed for the parts you
actually support. The wiring subset an editor cares about first is ~20
parts.

### B — Instance dump from the running client (exact)

The game's runtime model holds one `Attachment` per socket with its exact
`CFrame`. Dumping the instance tree of a build containing one of each part
yields every transform at once, with no measurement error.

**This is the one place where a live-inspection tool genuinely helps**, and
it is worth being blunt about the trade-offs:

| route | what you get | what it costs |
|---|---|---|
| **Cheat Engine** on `RobloxPlayerBeta.exe` | the decoded JSON string (you already have that) and scattered float blobs | Roblox runs Luau, whose GC heap is not the vanilla-Lua layout Cheat Engine understands; the client is rebuilt weekly, so any offset knowledge dies with the update. It cannot give you the instance tree. **Wrong tool.** |
| **A Lua-level client tool** that dumps the instance tree | the exact `Attachment` transforms, plus how the loader maps props onto runtime objects | requires trusting a third-party binary with an account attached. Roblox's anti-cheat is the classic ban vector for this class of tool. A real, but entirely personal, risk decision. |
| **Roblox Studio** | nothing from this game — the place is not yours | — |

The honest summary: memory inspection buys you the *runtime* view, not the
*file* view. The file view is already complete. So the only question is
whether the socket transforms are worth the risk and effort — and for a first
editor, option A is cheaper and safer.

### C — Extend the Godot editor

`vendor/grambys-workshop` is a Godot 4 editor for this game with the correct
serializer (`Scripts/Serialization/RTGFile.cs`) and the real part meshes. Its
`Attachment.tscn` + `Part.tscn` show exactly how the sockets are represented.
Authoring the attachment nodes for the remaining parts in that project would
give exact transforms with no account risk at all — but it is manual work per
part, the same as option A, with a better payoff (the editor renders them).

## Recording a capture

Write a JSON file in the format described in `captures/README.md`, then:

```
python tools/merge_geometry.py captures/my-capture.json
python tools/verify_catalog.py    # re-checks the transforms against the meshes
```

`verify_catalog.py` flags any transform that falls outside its own part's
mesh bounding box — that is how the `AltitudeSensor` placeholder was caught.

## What geometry must NOT do

The geometry lives **only** in the editor. It never enters the sharecode: the
format has no field for it, and the game reconstructs every position from the
socket graph. A build emitted by this editor must still be a pure graph of
`[name, connections, props]`.
