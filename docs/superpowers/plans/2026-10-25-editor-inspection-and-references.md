# Editor inspection and reference controls implementation plan

> **For agentic workers:** Use executing-plans for implementation and dispatching-parallel-agents for the independent reference and placement tasks.

**Goal:** Let the user inspect a build during sustained servo motion, start empty builds by double-clicking a part, and navigate reference images comfortably.
**Architecture:** Keep the existing single active servo preview; move per-servo Sustain preferences into editor state and distinguish selection from editing. Add a synchronous empty-workspace placement action. Keep image view state independent of blueprint state and extend the existing floating bounds logic.
**Tech Stack:** Preact signals, TypeScript, Three.js, Vitest, Playwright; no new dependencies.
**Spec:** User request on 2026-10-25: implement the three editor improvements; only assess mirror and collaborative editing.

## Decisions and scope

- Sustain stays checked per servo across deselection/remount and keeps its active direction; momentary input still releases on deselection. One servo runs at a time, matching the current simulator.
- Selection and camera navigation may continue during sustained motion. A real edit/undo/import retains the existing stale-preview cancellation policy. New/replacement clears transient Sustain state; Stop, Escape, blur and turning Sustain off release activation.
- Double-clicking a Parts part card when the document is empty creates exactly one root at world origin, selects it, exits placement and frames it. Nonempty documents keep existing behavior; favourites and recents use the same part-card behavior. Default props/auto-color and undo work normally.
- Reference images support bounded wheel/button zoom, pointer drag panning and Fit/reset. Transform state must not leak into blueprint data. Collapse hides input/help/thumbnail controls while retaining an image and reachable expand control. Floating windows resize at four corners, preserve the opposite corner and remain within the viewport.
- Mirror and collaborative editing receive a design note only, with no product code, dependency installation or backend setup.

## Tasks

### 1. Sustained servo inspection
Files: state/servo-preview.ts, state/servo-simulation.ts, ui/widgets/ServoControls.tsx, viewport/index.ts, focused state/UI tests.
- [ ] Add failing tests for sustained selection/tab changes, reselecting checkbox/button state, momentary release, workspace replacement cleanup and explicit Stop.
- [ ] Persist Sustain per part in editor state; keep preview direction active across selection and UI unmount. Make viewport selection avoid finishing a sustained run while actual edits still finish/cancel safely.
- [ ] Verify existing stepping/export/undo tests and real canvas selection while angle advances.

### 2. Empty-workspace double-click
Files: ui/widgets/PartCard.tsx, ui/panels/PartBrowser.tsx, state/place.ts (or focused sibling), focused tests.
- [ ] Add failing tests for one centered part/default props/selection/camera event/undo, no extra insertion in nonempty workspace and double-click event interactions.
- [ ] Add a guarded synchronous action and connect double-click only for Parts cards, preserving single-click placement.
- [ ] Verify in real browser that two click events plus double-click create only one part and leave no placement ghost.

### 3. Reference navigation and window controls
Files: ui/panels/ReferencePanel.tsx, ui/tokens.css reference rules, optional focused helper/widget, reference tests.
- [ ] Add failing tests for zoom/reset/pan, collapse accessibility and all-corner resizing with pointer cancellation/bounds.
- [ ] Implement transform and controls using existing DOM image and pointer capture; avoid intercepting blueprint shortcuts outside reference UI.
- [ ] Verify docked/floating interactions, corners and control collapse in a real browser; image loading failures still work.

### 4. Deferred feature assessment
- [ ] Read existing reflection/transforms/graph code for mirror scope; describe plane, hierarchy, handedness and undo considerations.
- [ ] Verify official GitHub Pages and WebRTC documentation; explain static hosting versus signaling, STUN/TURN and host-authoritative editing/permissions. Write a future-feature design note; build nothing.

### 5. Integrate and publish
- [ ] Review independent diffs; run types, formatting, full suite and build.
- [ ] Review and browser-test combined behavior, then commit and verify CI/Pages/live bundle.

## Verification before publication

- 950 tests passed across 130 files; typecheck, formatting and production build passed.
- Browser: actual canvas selection and inspector changes preserve sustained motion; reselect restores checkbox/pressed direction; Stop and Escape (including Reference focus) release it.
- Browser: slow double-click keeps the intended card stationary, creates one identity-layout root, selects/frames it, leaves no ghost, and supports undo/redo. Empty-workspace recents update on successful placement to avoid moving the target between clicks.
- Browser: docked/floating zoom, wheel/pan/Fit, collapse, remount persistence, four opposite-corner anchors, viewport constraints, input isolation and load errors passed with no page errors.
- Focused review found no outstanding issues. Mirror/collaboration are assessed in the accompanying specs note only.
