# Runtime asset import status

Work is on `codex/import-runtime-assets`, based on `1ee8db9`. Committed locally
on 2026-10-24 without the whole-diff review listed below. The existing three
untracked probe notes were left untouched.

Implemented:

- `tools/import_runtime_assets.py` copies the reviewed extraction into
  `meshes/runtime` and generates `data/runtime_parts.json` (requires Pillow).
- The asset build overlays 162 complete templates onto the community metadata:
  all 132 previous parts and 30 additional templates. Five known non-spawnable
  partial templates are excluded.
- Native meshes, 450 unambiguous socket frames, full subpart transforms, and
  native body origins are paired in PrimaryPart-local space. Duplicate GoKart
  socket 1 and Spoiler socket 2 are omitted from snap targets.
- UVs, diffuse textures, material opacity, cutouts and soft image alpha flow
  through the binary pack, viewport, thumbnails and socket workbench.
- Legacy Socket Workbench captures stay in their original IndexedDB key;
  new-coordinate captures use a separate key. Old frames cannot override the
  new geometry. No creations or autosaves were cleared.

Final checks: **694 tests passed across 100 test files**; typecheck, formatting,
whitespace checks and the production build passed. The asset build reports
450 captured sockets, zero approximate frames, and 162 meshes. Existing test
warnings about canvas support and undefined material sides remain unchanged
from the baseline.

Remaining review work:

1. Visually inspect representative textured parts, transparency, painting, and
   socket mating in the actual editor. A headless Edge smoke test loaded the
   162-part browser successfully; the attempted scripted gallery inspection
   failed because the test's dynamically imported store was not the app's live
   store. This does not verify the placed-part viewport shaders.
2. Finish a whole-diff review. No push or deployment was performed.
3. Extraction limits remain: two unavailable HulaDoll maps, unsupported decal
   placement/PBR channels, and inferred union matching/transforms for BallSocket
   and PolaroidCamera. New templates lack independently catalogued gameplay
   properties; existing property and wiring metadata is retained.

Rebuild with `npm run assets`; then `npm test`, `npm run typecheck`, and
`npm run build`. Runtime files under `public/assets/` are generated and ignored
by Git. The original research/catalogue source files remain available.
