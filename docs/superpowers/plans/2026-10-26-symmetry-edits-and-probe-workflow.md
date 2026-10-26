# Symmetry edits, reference proportions and reusable probing

> Execute inline with test-driven development; subagents are for verification only. The user authorized implementation, committing and deployment.

**Goal:** Mirror deletion and repositioning of existing parts; preserve reference-plane proportions with Ctrl; make the native geometry probe reproducible for later sessions; deploy the finished editor.

**Status:** Implementation and local verification complete. See [verification evidence](../research/2026-10-26-symmetry-edits-verification.md). The deployment step follows the verified commit, with its published revision recorded by GitHub Pages Actions.

**Design decisions:** Use existing plane/radial settings and tight native-frame matching of existing counterparts, independent of paint/Orientation properties. Add an enabled-by-default local `Mirror moves and deletions` toggle. Do not invent missing counterparts or act on ambiguous matches. Explicitly selected parts transform once; the anchor is exempt, and selecting the anchor disables expansion for that action. Preserve IDs and joints where possible, prefer aligned real sockets on reattachment, and use the existing native point inverse otherwise. Preview counterparts locally; commit source and counterpart changes atomically so Undo and collaboration receive one edit. Remote changes rebase the existing transform session.

Ctrl resizing preserves the plane's current width/height ratio, with a single bounded scale factor so either dimension's limits cannot distort it. Support the image-plane gizmo and numeric fields. Normal resizing and Ctrl movement/rotation snapping retain their existing behavior.

The probe guide will explain consent, read-only access, process/executable validation, RTTI/Instance discovery, finite rigid-frame checks, unique sample matching, host-relative comparisons, physical free angles, regression fixtures and failure handling. Preserve runnable capture/comparison tooling outside the browser build, with explicit version/layout validation. No fresh live-game capture is required for this documentation task.

## Plan

- [x] Add failing counterpart matching and edit tests: plane/radial, single/group, both sides selected, missing/ambiguous/centered matches, moving anchors, children and multipart bodies, real socket reattachment, cancel/Undo, and one collaboration change.
- [x] Implement a pure symmetry edit plan and shared state wrappers. Connect deletion commands, G/R/gizmo transforms, drag reattachment and local counterpart previews; document the toggle in README/help.
- [x] Add Ctrl aspect-ratio tests for width, height, scale gizmo, modifier release and extreme dimensions. Implement the shared size constraint and modifier-aware numeric commits.
- [x] Preserve and verify the read-only probe tools, write the reusable runbook, and link it from repo contributor documentation.
- [x] Run targeted and full tests, typecheck, formatting, asset generation/build, actual browser checks and a read-only review. Commit the finished change.
- [ ] Fetch and inspect main/remote state; integrate without overwriting other work, push the authorized deployment branch, monitor the Pages workflow and verify the deployed revision and page.

**Review focus:** Duplicate/asymmetric counterparts; opposite sides selected together; descendants moved twice; exact socket availability versus point fallback; collaborative changes during a gesture; modifiers changing mid-resize; stale Roblox layouts; preserving local changes in the main checkout during deployment.
