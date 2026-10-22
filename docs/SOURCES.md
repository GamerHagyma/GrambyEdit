# Sources and provenance

Everything in this folder comes from one of five places. Nothing here was
reverse-engineered from Roblox's process memory; the format facts come from
the file format itself and from 185 real creations.

---

## 1. This user's own work — the authoritative source

`docs/RTG_BLUEPRINT_FORMAT.md` (the spec), `docs/RTG-ai-FORMAT-buildlog.md`
(the build log) and everything in `tools/` that was already in
`RTG-ai/`. Written 2026-10-22 from the wiki corpus, the user's own saves
and ~20 in-game probes.

* Corpus: `data/corpus/wiki_codes.txt` — 185 parseable sharecodes scraped
  from the RTG wiki's `Creations` page (`tools/scrape_wiki2.py` re-scrapes
  them; the plain wiki URL returns HTTP 403 to scripted requests, so the
  scraper uses the fandom `api.php` endpoint).
* `data/corpus/corpus_codes.txt` — the raw scrape including unparseable codes.
* `data/corpus/corpus_ok.json` — the small hand-verified sample.

## 2. Community reverse engineering — `JuanCrakYT/RtG-Format`

<https://github.com/JuanCrakYT/RtG-Format> — MIT licensed.

The most substantial independent dataset on this format. Vendored under
`docs/community/RtG-Format/`:

| path | what |
|---|---|
| `SPECIFICATION.md` | the format specification (v0.406) |
| `format/` | `identifiers.md`, `indexing.md`, `json-structure.md`, `properties.md`, `unknown-fields.md` |
| `research/` | `discoveries.md`, `methodology.md`, `unknowns.md` (20 open items) |
| `compression/encoding.md` | the encoding pipeline |
| `old-files/obj_ids-spanish.md` | socket-id → semantic name catalogue |
| `old-files/RtG_Save_Format_Specification-spanish.md` | earlier spec revision |
| `old-files/rtg-ai-tokens.md` | the token/identifier analysis behind `tokens.json` |
| `blocks/parts/` | per-category part and socket-id tables |
| `blocks/reference/` | 128 per-part reference pages |

**`docs/community/rtg-ai-tokens.json`** — the community's per-part socket
tables (`LocalType` = child-side sockets, `LocalIDs` = parent-side sockets),
copied from <https://github.com/JuanCrakYT/RtG-AI/blob/main/dev/tokens.json>.
Used by `tools/build_catalog.py`; **partial** — for 11 parts the corpus has
sockets it omits (see the spec's §4 and `tools/verify_catalog.py` output).

Caveat carried throughout: the community's `LocalType` naming differs from
this project's "child socket", but the *values* are identical — the
community's `Switch` → `["1","3"]` is exactly the corpus child sockets for
`Switch`.

## 3. Community meshes — `JuanCrakYT/RtG-Format` + `jirrob/GrambysWorkshop`

Two independent exports of the game's part geometry:

| path | source | notes |
|---|---|---|
| `meshes/rtg-format/<Part>/` | `RtG-Format/assets/models/model/` | 121 parts, `.obj` + `.json` (render scale, tooltip, `LocalPoints`), 2 textures |
| `meshes/workshop/<Part>/` | `GrambysWorkshop/Gramby's Exports/` | 120 parts, `.obj` + `.mtl` + 43 `.png` textures |

<https://github.com/jirrob/GrambysWorkshop> — MIT licensed. Also vendored
under `vendor/grambys-workshop/` (the Godot editor itself) because its
`Scripts/GrambyObjects/Part/Part.tscn` holds **real socket transforms** for
the generic `Part` — the only confirmed socket geometry in this bundle.

**Units: 1 = 1 Roblox stud.** Verified: the generic `Part` mesh is exactly
1 × 1 × 1 and its socket transforms sit on the six faces at ±0.5.

## 4. Community reference implementations — vendored, not modified

| path | source | why it is here |
|---|---|---|
| `vendor/rtg-preview/` | `RtG-Format/RtG-Preview/` | a working three.js 3D preview of these exact meshes (`preview.js` 88 KB, `model-registry.js`, `commands.js`) — the closest thing to an existing renderer for this content |
| `vendor/grambys-workshop/` | `jirrob/GrambysWorkshop` | a Godot 4 editor for this game; `Scripts/Serialization/RTGFile.cs` is a reference serializer that names the connection fields `RootAttachment` / `ParentAttachment` — i.e. the child-side and parent-side sockets, matching this project's model |
| `docs/community/RtG-Format/old-files/` | `JuanCrakYT/RtG-Image` | the same spec and socket catalogue in their earlier revision |

`vendor/` is kept byte-identical to upstream so it can be diffed or replaced.

## 5. The RTG wiki

<https://road-to-grambys.fandom.com/wiki/Road_to_Gramby's_%F0%9F%91%B5_Wiki>
— the `Creations` page is the corpus source; the per-part pages (e.g.
`Chassis`) document appearance, mass and colours. Part names on the wiki
are the same identifiers the format uses.

---

## Licensing

* Everything in `docs/community/` and `vendor/` is MIT-licensed upstream work
  by JuanCrakYT and jirrob; the upstream licence files are included.
* The part meshes are the game's own art, exported by the community from the
  game. They are included here for the same personal, non-commercial reverse
  engineering the rest of this project is.
* `data/corpus/` contains sharecodes published on the wiki's public
  `Creations` page.
* This project's own analysis, catalogue and tooling are the user's work.

## What is *not* in here, and why

* **No game memory dumps.** Nothing was read out of the running client. The
  format facts come from the file format, the corpus and the community's
  published reverse engineering.
* **No captures of socket geometry yet** — `captures/` holds the schema and
  procedure, and `data/part_catalog.json` has the three parts whose geometry
  is known. `docs/SOCKET_GEOMETRY.md` explains the gap and the options.
