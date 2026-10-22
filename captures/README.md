# Socket geometry captures

This folder holds **captured socket transforms** — the position and orientation
of every connection circle on every part, in the part's own local space.

This is the **only** piece of the format that cannot be derived from the file
itself or from the 185-code corpus: the blueprint format stores *which* socket
mates *which* socket, never *where* the sockets are. A 3D editor needs the
geometry to place parts and to draw snap targets.

## Current state

| source | parts | transforms | confidence |
|---|---|---|---|
| `vendor/grambys-workshop` `Part.tscn` | `Part` | 6 | editor-scene (geometrically consistent: they land exactly on the 1x1x1 mesh faces) |
| community model JSON `LocalPoints` | `Switch`, `AltitudeSensor` | 2 | community — **the `AltitudeSensor` value `[0,2,0]` is a placeholder** (its mesh is 0.6 x 0.48 x 0.6 studs, so the point is 2 studs above it) |
| in-game capture | — | 0 | — |

Run `python tools/merge_geometry.py --show` for the live list.

## Units and axes

* **1 unit = 1 Roblox stud.** Confirmed: the generic `Part` mesh is exactly
  1 x 1 x 1 and the Workshop's socket transforms sit on its six faces at
  +/-0.5. All exported `.obj` files use the same space.
* Positions are **part-local**, relative to the part's origin (the centre of
  its mesh, as exported).
* Rotation is either `basis` (three column vectors, matching Godot's
  `Transform(xx,xy,xz, yx,yy,yz, zx,zy,zz, ...)`) or `rotation_deg`
  (XYZ euler in degrees). Prefer `basis`; it is unambiguous.
* The mating direction of a circle is the **local +Z axis** of its
  attachment frame (the Workshop's Attachment scene puts its marker mesh at
  local +Z). For the generic `Part`, socket 2 sits on the +X face with its
  +Z pointing along +X — i.e. +Z points *out* of the part.

## Capture file format

```json
{
  "captured": "2026-10-22",
  "method": "in-game measurement",
  "units": "studs",
  "parts": {
    "Gate-AND": {
      "4": {
        "position": [0.0, -0.16, 0.0],
        "rotation_deg": [0.0, 0.0, 0.0],
        "basis": {"x": [1,0,0], "y": [0,1,0], "z": [0,0,1]},
        "confidence": "verified",
        "note": "mount face; measured top-down against the 4x0.5x4 Base"
      }
    }
  }
}
```

`confidence` values: `verified` (measured and cross-checked in game),
`measured` (single observation), `placeholder` (guessed, do not trust).

Merge with:

```
python tools/merge_geometry.py captures/my-capture.json
```

## How to capture

### Option A — in-game measurement (no tooling, no account risk)

The socket circles are rendered on every part in the game, coloured per role.

1. Spawn a build containing exactly one instance of the part, mounted on a
   `Base` by an ephemeral attachment, so it is pinned and cannot drift.
2. Use the `Base` as the scale reference: the `Base` mesh is exactly
   4 x 0.5 x 4 studs and its exported `.obj` is in the same units, so
   measuring the Base's width in pixels gives the pixels-per-stud factor.
3. Screenshot from a straight-on camera (avoid perspective distortion: use
   the orthographic-style top-down view or a wall you can align to).
4. Measure each circle's centre in pixels relative to the part's origin
   (the centre of its bounding box), then convert with the factor above.
5. The circle's outward direction gives the orientation.

### Option B — instance dump from the running client (exact, higher risk)

The game's runtime model contains one `Attachment` per socket with its exact
`CFrame`. Dumping the instance tree of a build that contains one of each part
gives every transform directly, with no measurement error.

This needs a Lua-level client tool, which is a trust and account-risk
decision, not a technical one — see `docs/SOCKET_GEOMETRY.md` for the
trade-offs and for why Cheat Engine is the wrong tool for this.

### Option C — derive from the game's own editor scenes

`vendor/grambys-workshop` is a Godot editor for this game. Its
`Scripts/GrambyObjects/Part/Part.tscn` contains real attachment nodes with
transforms. Extending that project to cover all parts would be exact and
risk-free, but only its generic `Part` has been authored so far.

## What to do with the captures

* Merge into `data/part_catalog.json` (via `tools/merge_geometry.py`).
* Re-run `python tools/verify_catalog.py` — the geometry check compares every
  transform against the part's mesh bounding box and flags anything that
  floats outside its own mesh.
* Do **not** bake the geometry into the sharecode. The format has no room for
  it; geometry lives only in the editor, and the emitted sharecode stays a
  pure graph of sockets and joints.
