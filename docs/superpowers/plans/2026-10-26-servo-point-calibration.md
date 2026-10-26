# Native point-mount and rotation correction

> Execute inline using systematic debugging and test-driven development. The user requested an independent investigation of the supplied rotation diagnosis.

**Goal:** Make point mounts and fixed socket controls agree with native geometry across multiple part types, preserving independently positioned Splitter bodies.

**Evidence:** The supplied blueprint and saved capture confirm a 0.212-stud / 120-degree servo error, while all five Splitter bodies already match. The user then requested a broader probe, spawned the generated 171-part creation, and explicitly authorized read-only live geometry measurement. Its 130 samples cover 10 types, nine point configurations per type, ordinary sockets, physical door hinges and spinning outputs. See the [investigation report](../research/2026-10-26-point-mount-rotation.md).

**Decision:** The original servo-only evidence was insufficient for a generic change; the expanded probe establishes a common point-frame correction for all 90 measured point cases. Use captured child frame `S * Rx(90) * Ry(-90)`, retaining translation. The proposed position-only/fixed-frame rule fails for seven of the ten types. Physical door sockets ignore Orientation for hinged children; ordinary sockets and point mounts retain it. Leave `poseConn`, per-body connection selection and catalog data unchanged. Free physical output angles are outside this correction.

**Interface:** Preserve `childSocketMatrix(cat, type, socket, onto)` and its error/approximation behavior. `computePoses` consumes that same function; `point` and `door` turns distinguish cache tails. Placement, movement, clipboard, generators and symmetry already use it for forward/inverse point frames. Add optional child socket context to `ignoresOrientation` for the hinged-door exception, passing it through every production caller in pose, placement, transform, movement and symmetry code.

## Steps and proving checks

- [x] Preserve original servo and five-body Splitter observations. Observe the servo regression fail and the Splitter regression pass.
- [x] Generate, validate and browser-check the multi-type probe; capture only named Workspace geometry after the user's authorization. Preserve all 130 direct observations without substituting predictions.
- [x] Observe 85 regression failures: 81 non-GasCap point cases, two mixed door cases and two tail-cache orders. Fix the common point frame first; verify that only the two door cases remain, then fix their Orientation context.
- [x] Verify placement/inverse moves/copies, rotation commands, unknown child context, native GasCaps, all ordinary socket controls and independently positioned Splitter bodies.
- [x] Independently review raw-fixture correspondence and integration. Run full tests, typecheck, build, formatting and browser G/R/native-frame checks. Record the results and preserve the local worktree; publishing remains separate.

**Review focus:** Mixed target kinds in either traversal order; placement-to-commit continuity; free moves preserving world pose; descendant transforms; Splitter outputs staying independently placed; no mutation of cached catalog frames; existing GasCap native measurements.
