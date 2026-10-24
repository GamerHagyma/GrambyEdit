# Runtime asset import implementation plan

> **For agentic workers:** use test-first changes and verify the integrated editor before completion.

**Goal:** Import the extracted native geometry, socket frames, and recovered diffuse textures into the existing editor.

**Architecture:** Keep the community catalogue as historical metadata and overlay a compact, versioned native capture during the asset build. Ship matched PrimaryPart-local geometry and frames together. Extend the current binary mesh pack and existing Three.js materials with UVs, texture references, and opacity.

**Tech stack:** Existing TypeScript, Three.js, Vitest, Vite; stdlib Python for copying the extraction. No new dependencies.

**Spec:** User's import request and `GrambyConnect/captures/runtime-2026-10-24/README.md`.

## Decisions and constraints

- Importing only socket JSON would misalign the old mesh origins. Replace geometry and sockets together.
- Average texture colors lose the requested images. Preserve UVs and load diffuse textures through the existing renderer.
- Include 162 complete templates: all 132 original types plus 30 additional types. Exclude the five user-confirmed non-spawnable partial templates.
- Preserve existing properties, wiring roles, frequency, conventions, and codec behavior. Derive socket sides and IDs from native attributes.
- Remove ambiguous GoKart ID 1 and Spoiler ID 2 from snap targets; preserve diagnostics.
- Preserve complete native subpart transforms and unique leaf-name aliases for blueprint points. Rebase curated body anchors and pivots to native subparts.
- Separate persisted socket captures by coordinate space; retain legacy data without applying it to new meshes.
- Keep the two inferred union sources/transforms and unsupported decal/PBR placement documented. Do not fabricate unavailable maps.
- Work in the current checkout on `codex/import-runtime-assets`; preserve the three existing untracked probe notes. Do not push or publish.

## Review focus

1. Saved old socket overrides must not overwrite the native frames after reload.
2. A rotated subpart's blueprint points must use rotation as well as translation.
3. Wires and splitters must keep independent bodies and native rotation pivots.
4. Texture groups must survive instancing, body splitting, capacity growth, thumbnails, and workbench rendering.
5. Asset versioning must change when material/texture metadata changes; production files must be self-contained.

## Tasks

- [ ] **1. Native catalogue overlay and local assets (main).** Add failing real-build tests for new types, native sockets, mesh groups, and body frames. Add `tools/import_runtime_assets.py` to copy selected OBJ/MTL/PNG files and emit `data/runtime_parts.json`. Integrate the overlay in `scripts/build-assets.ts`, with explicit errors for malformed capture data.
  - Interface: each runtime record provides OBJ/MTL paths, material→native subpart names, sockets with native sides and frames, native subpart frames, primary name, and blocked IDs.
  - Check: runtime catalogue has 162 meshes, all imported socket definitions use captured frames, excluded types are absent, Wire body pivots use native parent origins, rotated Gate frames match source.
- [ ] **2. Textures and opacity (mesh decoder agent).** Write failing parser/packer/runtime tests, then retain UVs, optional material texture/opacity fields, and runtime texture loading/material groups. Preserve paint-mask alpha and existing non-textured fixtures.
  - Interface: optional `ObjMesh.uvs`, `PackGroup.texture/opacity`, `Manifest.sections.uvs`, `Assets.textures`; `parseMtlOpacities(text)` handles `d`/`Tr`.
  - Check: UV seams remain split, groups have correct texture and opacity in whole/body meshes, shader painting still works, cached textures dispose correctly.
- [ ] **3. Coordinate-aware overrides (main).** Add failing tests for legacy override rejection and tagged capture persistence. Add optional catalogue/file coordinate-space IDs; store new overrides under a separate IndexedDB key and reject incompatible manual imports. Old saved records remain untouched.
  - Check: old frames cannot displace native sockets; new workbench edits persist, reload, and export with the matching tag.
- [ ] **4. Integrated verification and review.** Run `npm run assets`, the full tests, typecheck, format check, and production build. Inspect a running editor with representative textured parts and socket/workbench displays. Review the diff and address material findings. Record the baseline and rollback instructions in import documentation.

## Progress

Baseline commit: `1ee8db9`. Before changes, only `docs/connector_test.txt`, `docs/part_test.txt`, and `docs/wheel.txt` were untracked.

Wrap-up: tasks 1–3 implemented. Task 4 automated checks passed (694 tests,
typecheck, format/whitespace checks, production build). Whole-diff review and
placed-part visual verification remain; see `docs/RUNTIME_IMPORT.md`. Changes
are uncommitted at the user's request to wrap up promptly.

The request already specifies importing the reviewed extraction into this editor. Routine implementation choices above are handled within that authorization.
