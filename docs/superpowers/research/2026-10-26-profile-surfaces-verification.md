# Profile surfaces — final verification

Verified on 2026-10-26 in `codex/profile-surfaces`, including the unchanged-gesture history fix in `10bfbad`.

## Delivered

- Original four-corner workflow, with optional Bézier edges.
- Profiles and matching anchor columns, exact shape-preserving insertion, tangent editing, Smooth/Crease joins, numeric coordinates and group transforms.
- Separate draft undo/redo, retained mode drafts, and confirmation before replacing edited profiles.
- Cancellable background GasCap generation, current-result previews and counts, diagnostics, and guarded Create.
- Ordinary generated parts through existing blueprint history, export, mirroring and collaboration. Draft controls and guides remain local.
- README and Help & controls usage instructions.

## Automated checks

All checks ran after the final code change, using the package scripts' underlying executables with the bundled Node runtime.

| Check | Result |
| --- | --- |
| `npm test` (`vitest run`) | **153 files, 1,094 tests passed** |
| `npm run typecheck` (`tsc --noEmit`) | Passed |
| `npm run build` (`vite build`) | Passed |
| `npm run format:check` | Passed |
| `git diff --check` | Passed |

The test environment reports its existing jsdom canvas `getContext()` notices. The build reports the existing main-bundle size warning; the surface worker is a separate 96.29 kB bundle. Neither is a failed check.

Coverage includes exact subdivision and derivatives, intersecting continuity constraints, native solid coverage, precision and cap budgets, cancellation and stale jobs, workspace replacement, worker errors, local-only state, readonly permissions, Create/Undo, automatic mirror copies, dynamic handles and existing transform/reference tools.

A final read-only branch review ran 77 targeted tests and identified one history defect: accepting unchanged/rejected drags consumed undo entries and cleared redo. Two regression cases first failed, then passed with the fix. They cover 50 no-op gestures in each mode plus preservation of an existing redo step. The final targeted run passed 21 tests before the full suite above.

## Browser checks

Headless Chromium exercised the actual UI, WebGL viewport and module Web Worker against a fresh local Vite graph:

- Curved Quad and Profiles controls, profile insertion and numeric group editing.
- A 120-cap preview created exactly 120 GasCaps; blueprint Undo removed them and restored the preview.
- Perspective and orthographic screenshots inspected; no control-panel horizontal overflow or runtime errors.
- Legacy uncurved Quad produced its 70-cap test preview.
- A larger Profiles draft accepted 12 rapid edits and produced a 2,961-cap preview.
- Collapsing that guide to a degenerate surface produced an error and disabled Create. Draft Undo recovered the valid preview and enabled Create.

Deterministically delayed replies, cancellation, malformed worker output and workspace changes are covered by automated queue/state tests. The browser checks used real worker scheduling rather than an artificial delay.

Two isolated browser contexts then used the shipped PeerJS client and real WebRTC data channels. A temporary loopback-only signaling server and empty ICE-server list kept this test local:

- Host profile edits did not change the guest blueprint or create a guest draft.
- Create synchronized 96 GasCaps; serialized blueprints matched.
- While the host was in a profile `G` gesture, guest part addition, parent-color editing and generated-cap deletion each preserved the gesture.
- After canceling the gesture, serialized blueprints still matched. Both contexts reported zero runtime errors.

This verifies local two-client synchronization, not public signaling availability or connectivity across arbitrary NAT/firewall configurations.

## Native game evidence and limits

The user tested crown and cylinder fixtures in Road to Gramby's, then confirmed the corrected v4 right-angle crease “works perfectly.” A fresh measurement of 144 spawned GasCaps matched predicted parent-relative poses within **0.00004857 studs** per position component and **0.00004980** per rotation-matrix component. See [native calibration evidence](2026-10-26-gascap-native-calibration.md).

The legacy quad tiler/layout is unchanged. A shared GasCap point-mount correction intentionally changes exported attachment coordinates to agree with measured game poses.

Fixed-size GasCaps approximate the guide with overlapping flat plates. The supported range and conservative coverage/deviation bounds are recorded in the [feasibility report](2026-10-26-curved-gascap-feasibility.md). Faceting, small overlaps and skew-edge overhang remain possible; folded or excessively tight guides are rejected. No general hinge/physics behavior, arbitrary surface topology or universal perfect silhouette is claimed.

## Delivery state

Implementation and verification are complete. The local branch/worktree and fixture gallery are preserved. Nothing was pushed, merged or published as part of this implementation.
