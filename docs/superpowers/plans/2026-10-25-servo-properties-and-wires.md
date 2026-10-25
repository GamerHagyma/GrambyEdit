# Servo properties and internal wires implementation plan

**Goal:** show the requested servo controls and draw/validate internal wires on multipart logic parts.
**Architecture:** filter property presentation without deleting imported data. Share one pure wire-segment
model between committed validation and a separate instanced-cylinder viewport layer.
**Tech stack:** existing TypeScript, Preact/signals, Three.js, Vitest and Playwright; no dependencies.

## Requirements and decisions

- Both Servo and Servo_Physics show Speed, Rest, LimitEnabled, LimitAngle, then Rotation
  (the user added Rotation after the original four-property request). Existing runtime keys
  and unknown imported properties survive export. Other property types keep their current UI.
- Speed is degrees/second; LimitAngle and Rotation are degrees. Speed/LimitAngle allow
  values above 360; nonnegative values, with no artificial upper bound. Do not invent
  defaults from the user's sample `Rotation:0, LimitAngle:36.9, Speed:47.2, Rest:true,
  LimitEnabled:true`; test that exact sample instead.
- Use star connections from body 0 to every other body for Splitter variants, and the
  one pair for Wire, Switch, Button/RemoteButton, PressurePlate and TripWire. Rope and
  RubberBand are outside this request. Captured body pivots supply world endpoints.
- Thin instanced cylinders are preferred over 1-pixel lines: stable 3D thickness and
  existing instancing patterns. Radius 0.0125 studs; black at <=10 studs, orange at >10.
- PressurePlate needs separate plate/output bodies (captured Handle and Output origins).
- Render wires in a separate scene group so picking and outline/ID passes keep selecting
  actual pieces. Hidden parts and Sockets workbench hide their wires. Transform/drag
  previews update endpoints and color; Issues validates committed positions.
- One warning per overstretched part, with measured longest distance and 10-stud limit.
  Warnings do not enforce a maximum, change connections, or alter share codes.

## Tasks and proving checks

- [x] Add property-view/UI regressions for exact row order on both servo types, the real
  code sample, editing >360 values, checkbox writes, hidden-property fidelity and mixed selections.
  Update `src/core/propview.ts` and `data/curation/prop-meta.json` only as needed.
- [x] Add PressurePlate curation and regenerate assets; verify independent body/socket
  membership and captured frames in the asset pipeline regression.
- [x] Add `src/core/wires.ts`: wire type membership, body-to-body segments, shared 10-stud
  threshold and overstretch issues. Test every family, rotated/independent bodies, exact
  boundary, self-stacks and export identity. Integrate `validate` with optional precomputed
  poses and pass existing `posesSig` from the derived state.
- [x] Add `src/viewport/wires-layer.ts`; test endpoints, colors, hidden state, capacity
  growth, body/whole previews and cancellation. Integrate lifecycle with PartsLayer and
  the scene alongside existing spring/label layers.
- [x] Browser-check servo fields and checkbox persistence, thin wires, orange threshold,
  warning selection, dragging/cancel/undo and hidden/workbench state. Run assets,
  typecheck, formatting, full suite and production build; independent review before publishing.

## Verification record

- All tasks above implemented. Full verification: 125 test files / 890 tests passed;
  assets (450 captured sockets, no approximate sockets), typecheck, Prettier, whitespace
  check and production build passed.
- Real browser checks covered both servo types, canonical sample values, >360 edits,
  checkboxes, wire thickness/colors and Issues selection; live G/X transforms, commit,
  Undo, Escape, hidden state and socket-workbench visibility. No page errors.
- Independent review found quadratic redraw work for multi-piece multi-selection. Added
  `tests/perf/wires.test.ts`, observed 365.6 ms failure before fixing and passing after;
  reviewer benchmark improved from 369.8 ms to 4.53 ms for 1,000 wire body updates.
  Final review found no remaining P1/P2 issues in scope.
- Existing non-failing diagnostics: jsdom canvas notices and Vite bundle-size advisory.
- Simulation code/UI remains absent, as requested. Its deferred plan includes live Rotation.

## Separate deferred work

Servo simulation is a plan only in `2026-10-25-servo-simulation.md`. Do not implement its
UI or behavior until the user verifies these tweaks. Rotation must live-update during
that future simulation from the same current-angle state driving the preview.
