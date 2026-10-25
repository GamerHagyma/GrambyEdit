# Servo simulation implementation plan — DEFERRED

> **Execution gate:** the user explicitly requires verifying the property/wire tweaks first.
> This document is planning only. Do not implement simulation until that verification and approval.

**Goal:** mock servo rotation in the editor, including attached children, with red/blue activation
buttons and a Sustain checkbox, and a Rotation field that displays the exact live angle.
**Architecture:** an editor simulation session supplies one current-angle value per servo. The
Rotation property display and output-subtree render transform read the same value. Keep the saved
document as the base pose; do not accumulate transforms or create an undo entry per frame.
**Tech stack:** existing Preact signals, Three.js transforms and requestAnimationFrame.
**Spec:** the user's 2026-10-25 requests plus the real Servo property extract in the implementation plan.

## Global constraints

- Only Servo and Servo_Physics receive a distinct **Simulate** row/section in Properties.
- Provide red and blue activation buttons corresponding to captured sockets 3 (Side_Red)
  and 4 (Side_Blue). Momentary mode activates while held; capture/release must work even
  when the pointer leaves the button. Keyboard Space/Enter presses must work too.
- Sustain changes the buttons into toggles. Stop activation on focus loss or when the
  session ends; never leave a hidden button accidentally driving a servo.
- Speed controls degrees per second. LimitEnabled gates LimitAngle. Rest returns to the
  default position after release; without Rest, hold the last angle (Rotation).
- **Rotation live-updates throughout simulation** from the same current-angle state used
  to draw the servo and its attached output, not a separately rounded or delayed estimate.
  Preserve the actual stored property keys: Rotation, Speed, Rest, LimitEnabled, LimitAngle.
- Rotate the output around the captured socket-2 axis, carrying the attached bodies and
  their children. The servo housing, its inputs, and independently anchored pieces stay put.
- Recompute preview transforms from base poses and absolute angle every frame; no drift.
- No physics, signal-graph simulation, collisions or full electrical network in this phase.

## Resolve before execution

These facts are not established by a static screenshot or the supplied property sample:

1. Confirm red/blue positive and negative directions, and simultaneous activation behavior.
2. Confirm whether LimitAngle is a symmetric ± bound, a total sweep, or a one-sided limit;
   how angles beyond 360 and a changed limit while moving behave.
3. Confirm the default rest angle and return speed; retain Rotation when Rest is off.
4. Confirm numeric defaults when properties are absent. The sample values are examples,
   not evidence of defaults.
5. Confirm whether a final simulated angle should persist in the blueprint. Recommended:
   transient mock state until explicitly accepted, with at most one undoable saved change.
   This does not block live Rotation display; only the save policy needs confirmation.

## Review focus

- Secondary bodies of multipart parts may follow the servo while another body is anchored elsewhere.
- Nested servo outputs must compose without rotating the outer housing twice.
- Cycles/shared anchors must be refused or explained rather than breaking an independent attachment.
- Pointer cancellation, tab/selection change, window blur and Sustain transitions must stop safely.
- Displayed Rotation, rendered angle and any eventual saved angle must agree at fractional values.

## Tasks after approval

1. **Pure stepping model** (`src/core/servo-simulation.ts`, unit tests): define state
   `{ angle, activation, sustain }` and `stepServo(state, settings, dtSeconds)`. Once the
   questions above are settled, pin exact direction, speed, limit, Rest and multi-turn
   examples in failing tests; handle zero/large elapsed times deterministically.
2. **Body-aware output traversal** (new focused helper and pose tests): take a servo id,
   socket-2 frame and absolute angle, return body/part preview matrices. Test output-only
   traversal, descendants, nested servos, independent ends and cycle rejection.
3. **Editor session** (`src/state/servo-simulation.ts`): own current angles, base document
   identity and activation lifecycle. Cancel/rebase on real edits, undo/import/deletion;
   apply the agreed final-angle persistence policy without per-frame history edits.
4. **Simulate row and live Rotation** (Properties plus focused widget): red/blue controls,
   Sustain, accessible pressed state, pointer capture and keyboard handling. Feed the
   live Rotation value from the session while active and from saved props otherwise.
5. **Viewport animation**: schedule rendering only while motion/return is active; apply
   absolute matrices to bodies, descendants and internal wires. Ensure markers and picking
   use consistent preview poses or disable editing during active simulation explicitly.
6. **Verification**: deterministic model tests, nested/independent attachment tests and a
   real browser hold/release/toggle walkthrough. Compare displayed fractional Rotation with
   measured rendered angle. Confirm export/undo behavior according to the accepted policy.
