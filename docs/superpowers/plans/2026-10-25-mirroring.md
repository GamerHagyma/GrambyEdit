# Mirroring Implementation Plan

> Inline execution requested; no subagents. Use executing-plans and test-driven-development.

**Goal:** Local anchored planar/radial guides, automatic placement copies and selection Apply, with synced results and usage documentation.
**Architecture:** Pure symmetry transforms and atomic draft copy operations; local signals drive the inspector and a separate viewport guide/preview. Explicit placement paths invoke copying inside their existing transaction, so received collaboration changes never trigger symmetry.
**Tech stack:** Existing TypeScript, Preact signals and Three.js; no new dependencies.
**Spec:** docs/superpowers/specs/2026-10-25-mirroring-design.md

## Constraints and review focus
- Native rotation-only export; asymmetric meshes retain native shapes. Avoid silent wiring damage or root-layout-only copies.
- Anchors can move/disappear during collaboration; settings/preview never enter Doc or network messages.
- Reflect each independent body; never double-include descendants or the anchor. Atomic failure.
- Viewer permissions, real ID leases, fresh point UUIDs and one undo for original plus automatic copies.
- Preview must not allocate real IDs, commit, or produce extra network traffic.

## Tasks
- [x] Core transforms in src/core/symmetry.ts: configuration, frame/transform matrices, proper per-body reflected frames and socket mapping. Tests in tests/core/symmetry.test.ts first.
- [x] Atomic copy operation in src/core/ops/symmetry.ts: clone/remap, preserve radial joints, repair planar mounts, verify desired poses, export roundtrip, bounds and rollback. Tests in tests/core/ops/symmetry.test.ts first.
- [x] Local controller src/state/symmetry.ts: anchor selection, lifecycle, dry-run preview, Apply and addPlacementSymmetry(Draft, ids). State tests first.
- [x] MirrorPanel.tsx, App/Shell and viewport/symmetry-guide.ts: controls, local guide and selection preview; placement ghost instances. UI tests and screenshots.
- [x] Explicit placement integration: tools/place.ts, tools/connect.ts, state/generators.ts and state/surfaces.ts call copying in the existing commit. No generic store mutation hook. Verify auto-placement and one-step undo.
- [x] README, ShortcutsDialog usage, docs/SYMMETRY.md, assessment status; full checks, inline diff review, commit/deploy and production verification.

Verification before the follow-up fixes: 987 tests / 140 files pass; types, formatting and production build pass. Real browser checks cover planar Apply, six-sector radial Apply, auto-placement, atomic undo, native wire ends and export roundtrip. Two real WebRTC browser contexts verified local guide/settings changes send zero application bytes, no repeated mirroring of incoming edits, leased-ID guest radial placement convergence and shared atomic undo. Help panel checked in browser. Publishing remains part of the final combined release after follow-up fixes.
