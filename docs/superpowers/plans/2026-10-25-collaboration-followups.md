# Collaborative editing and catalog follow-ups

User authorizes implementation inline; subagents may verify only. Preserve the completed mirror features.

Decisions:
- Keep applying remote document edits during G/R. Rebase the local transform and reapply its preview after document rendering, then commit against current poses. Reject only deleted/invalid targets. Locking the build or postponing all remote edits would interrupt collaboration or show stale state.
- Generalize the existing drag reattach to ordinary parts, selection groups and the Move gizmo center. Use a primary dragged part for the new socket and move the other topmost selected items by the same rigid delta; descendants follow once. Preserve whole-vs-piece selection and refuse invalid group moves atomically.
- Shift while carrying/dragging means native compatible sockets only; suppress surface/ground fallback. Enlarge only usable markers and their pick radius by a setting (default +100%, range 0–400%). Reset on key release/blur and tool changes; ordinary Shift selection remains available outside a drag.
- Add the reported parts to an Unavailable category, keeping them searchable/inspectable. Preserve Splitter_1/2/3/4 categories. The original runtime capture and the user’s exported Connector/Spoiler stack confirm that both attachment sides use native ID 2. Preserve captured parent/child frames under one ID, with independent occupancy, rendering and import/export. The importer merges same-body Ball/Cup shared IDs; ambiguous duplicate sockets remain blocked.
- Distinguish mechanical MountType sockets with orange/red marker styles. Retain role colors for ordinary sockets, and selection/consumed overlays. Make Join the primary action at the top when an invitation is supplied.

Checks:
- Regression tests first for mirror reused-socket occupancy/cross-sector dedup (fixed), catalog inventory/categories, marker colors, Shift settings and compatibility/surface suppression, single/group Select/Move center drag, G/R rebase and deleted targets.
- Verify with real two-browser WebRTC sessions while a modal transform is active, plus actual pointer dragging and Shift marker behavior. Independent agents verify only; implementation stays inline.
- Full assets/types/format/tests/build; update README/help; commit and deploy the combined release, then production smoke test.

Final local verification: 1,008 tests in 144 files pass; assets, type checking, formatting and production build pass. Shift's actual pick radius expands with its rendered size; real browser marker scaling is exactly 2x at the default setting. Original native capture + the user’s export confirm Spoiler ID 2 on both sides; no approximate socket data was retained.

Rulings and verification: the initially considered approximate inventory was discarded after finding the original runtime capture. Both Spoiler frames are captured, not estimated. The user’s exact in-game export is a regression test. Independent read-only reviews found and verified fixes for mirror cross-sector dedup and occupied reused joints, selected-target/ancestor deletion, point-transform rebasing, and mixed body/part dragging. Actual two-browser public WebRTC tests pass for G/R persistence, latest-pose deltas, cancel and deletion, plus local mirror isolation and leased-ID copies. Actual pointer tests confirm 2x Shift markers, ground refusal/release, Move XYZ-center group attachment and 22 unavailable templates.
