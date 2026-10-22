# GrambyEdit

A 3D blueprint editor for [Road to Gramby's](https://www.roblox.com/games/5796917097/Road-to-Grambys)
share codes, built as a static site for GitHub Pages. Paste a code, edit it in 3D, export a new code.

```
npm install
npm run assets
npm run dev
npm test
```

The editor's design is `docs/EDITOR_DESIGN.md`; the build plan is
`docs/superpowers/plans/2026-10-22-grambyedit-v1.md`.

---

## Research and assets

This folder also holds the research and assets the editor is built from.

Start with **`docs/RTG_BLUEPRINT_FORMAT.md`**. It is the authoritative spec
of the sharecode format, the game's physical rules and what an editor must
respect.

---

## What is here

```
docs/
  RTG_BLUEPRINT_FORMAT.md     the spec  <- read this first
  SOCKET_GEOMETRY.md          the one missing dataset + how to capture it
  SOURCES.md                  where every file came from, and licences
  RTG-ai-FORMAT-buildlog.md   the original chronological build log
  community/                  upstream community research, vendored verbatim
data/
  part_catalog.json           133 parts: sockets, roles, pieces, props, mesh, geometry
  socket_table.json           just the socket inventory (what a 3D editor snaps against)
  props_schema.json           36 prop keys, their JSON type and the parts that use them
  corpus_stats.json           corpus counters + the 60 most common joint pairs
  corpus/                     the 185 real sharecodes everything derives from
meshes/
  rtg-format/<Part>/          121 part meshes (.obj) + model metadata + textures
  workshop/<Part>/            the same parts from a second exporter, with .mtl + .png
vendor/
  rtg-preview/                an existing three.js 3D preview of these meshes
  grambys-workshop/           a Godot editor for this game (reference implementation)
captures/                     where captured socket geometry goes (schema + procedure)
tools/                        the codec, the corpus analysers, the catalogue builder
```

## The short version of what we know

| | |
|---|---|
| **Format** | `sharecode = base64(compact JSON array of [name, connections, props])` — complete and verified in game |
| **Joint** | `[child_socket, parent_socket, parent_index_1based]` — only the child stores it |
| **Parts** | 133 known, 121 with meshes, all socket ids mapped |
| **Physics rules** | one mate per circle; an ephemeral mount consumes its whole piece; unmounted parts dangle; big creations need `Anchor`s |
| **Meshes** | 121 parts in Roblox studs, ready to render 1:1 |
| **Missing** | **socket geometry** — where each socket sits on its part. Known for 3 of 133 parts |

## The one correction in this bundle

The previous spec claimed a hard rule of "one joint per piece" with "0
violations across 37,115 real joints". That was never measured — the check
had a type bug and never fired. Re-run correctly:

* **69.2%** of real creations use both faces of one physical piece (a wire
  that receives and sends on the same end). This is normal.
* What *is* forbidden in 185/185 builds: one mate per circle, and **an
  ephemeral mount consuming its whole piece** (mounting on one face and
  jointing the partner face is what tore the v5 build apart).

Details: spec §3.1 and §14. The fixed tooling is in `tools/`.

## Verify it yourself

```
cd tools
python verify_spec.py         # 120 checks of every number in the spec
python verify_doc_samples.py  # decodes every sharecode quoted in the spec
python build_catalog.py       # regenerates ../data/*.json
python verify_catalog.py      # cross-checks the catalogue + the invariants
python test_blueprint.py      # 14 encoder/validator regression tests
```

All of these pass as shipped.

## Where to start if you are building the editor

1. `data/socket_table.json` — the snap targets. Per part: child sockets,
   parent sockets, the role of each, the semantic name, and the piece
   grouping for splitters and wires.
2. `data/part_catalog.json` — everything else, including the mesh path and
   bounding box per part.
3. `meshes/rtg-format/<Part>/<Part>.obj` — the geometry, in studs.
4. `tools/blueprint.py` — a working codec to build on.
5. `tools/compile_model.py` — contains `build_eval` / `eval_lights`, the
   topological graph simulator that reproduces the tree model 500/500. Use it
   for live preview of switch states.
6. `vendor/rtg-preview/preview.js` — an existing three.js renderer for these
   meshes; useful as a starting point for the viewport.

## Known gaps

* **Socket geometry for 130 of 133 parts.** See `docs/SOCKET_GEOMETRY.md`.
  Without it the editor can be a graph/tree editor but not a spatial one.
* The `Switch` circle 1 vs circle 2 role (input vs output) is ambiguous
  between the corpus and the community; one in-game test settles it
  (spec §12, item 12).
* Maximum entries / code length / children per part are unknown.
* The exact set of loader validation rules is unknown; the community's
  `research/unknowns.md` lists 20 open items.

## Credits

Road to Gramby's and all part meshes © Mumble Games. Mesh exports: JuanCrakYT/RtG-Format and jirrob/GrambysWorkshop (MIT).
