# Servo simulation implementation plan

Execution is approved: the user verified the property/wire tweaks and confirmed the defaults.
The prerequisites were committed separately as `5107fea`.

- Red = negative, blue = positive. Most recently pressed direction wins; releasing an older button cannot release a newer one.
- Speed defaults to 45 degrees/s; LimitAngle defaults to a symmetric ±45 degrees; Rotation/rest position is 0 degrees.
- Missing Rest and LimitEnabled use true, matching the supplied example. Explicit false/zero values must survive.
- Return to zero at configured Speed when Rest is enabled; otherwise retain Rotation. No wrapping at 360.
- One selected servo at a time receives a Simulate section with momentary red/blue buttons and Sustain toggles. Stop on blur, cancellation, selection/tab change, or real document replacement/edit.
- Keep a transient angle during animation, render and display it from the same preview document, then record one undoable Rotation edit when the run ends. A normal edit cancels the transient run rather than overwriting the edit.
- Include servo Rotation in export by default; an export checkbox omits it from code and JSON without changing the workspace.

Implementation options: a second descendant graph; a viewport-only subtree transform; or extend the existing body-aware pose solver. Use the solver: it already handles independently anchored bodies, nested attachments, points and cycles, and keeps picking and displayed geometry consistent.

1. Pin defaults, symmetric limits, fractional speed, rest/hold and multi-turn behavior with pure tests; add default props on spawn.
2. Apply Rotation about socket 2 local +Y in pose solving and socketWorld; test children, nested servos, independent multipart ends and unchanged input/housing poses. Spinner-hosted points follow the output.
3. Add a single-servo preview/session with deterministic stepping and one commit per run; cancel stale sessions on edits/undo/import. Do not accumulate matrices.
4. Add Simulate controls, pointer capture, keyboard hold/toggle, lifecycle cleanup and exact live Rotation. Disable editing property fields during a run; use live poses for viewport consumers.
5. Add export inclusion control and verify code/JSON match with no document mutation.
6. Run focused/full tests, types, formatting, build and a real browser walkthrough; request review, fix findings, commit separately and verify deployment.

Verification notes:
- Full solver establishes which bodies follow the active output once per document/catalog/servo. Animation then rotates their absolute base matrices; committed validation stays cached and only wire stretch warnings update live.
- Inputs already outside newly enabled limits move inward at configured speed; outward activation holds position, without teleporting across turns.
- Unrelated modifier/camera navigation does not finish a run. Escape releases input and allows the Rest return. Typing a field then pointer-holding commits the field before starting the run.
- The Kamaz neutral hinge assertion now clears only saved servo angles in its local test document, because those nonzero captured angles are rendered rather than ignored.
- Missing booleans remain the stated assumption (Rest=true, LimitEnabled=true), matching the supplied real property sample.
