# Outliner selection and GasCap alignment

Scope: the user's 2026-10-24 request and paired game/editor screenshots.
Preserve existing uncommitted work; do not commit or push.

The Outliner and placement results below stand. The initial GasCap point-origin
hypothesis is superseded by the later game-confirmed correction in
`2026-10-24-gascap-z-calibration.md`.

## Decisions

- Shift-add alone already exists but cannot select a range. Use Shift-click for
  the range in the current displayed row order, Ctrl/Cmd-click to toggle, and
  Ctrl/Cmd+Shift-click to add a range. Skip headings and collapsed children.
- Reuse the existing context menu and commands. A separate visibility command
  retains the selection, showing all selected parts if any are hidden, otherwise
  hiding them. Existing viewport Hide behavior remains unchanged.
- Diagnose the GasCap's local socket/pivot math before changing it. Prefer a
  frame correction shared by pose computation and inverse placement over a
  surface-only or world-axis offset. Do not infer an exact distance from pixels.

## Checks and tasks

- [x] Write failing Outliner tests for forward/reverse ranges, Ctrl toggling,
  filtered/grouped/collapsed rows, missing anchor, and right-click selection.
- [x] Add `view.toggleVisibility` (no inputs; changes editor hidden IDs only;
  disabled with no selected parts) and test mixed/hidden/visible selections,
  preserving unrelated hidden IDs and keeping the selection.
- [x] Add Outliner row menu using the existing `contextMenuSig` and visibility command;
  preserve a multi-selection when right-clicking one of its rows. Verify hide
  then show from hidden Outliner rows with the real menu.
- [x] Read the pictured build export, trace GasCap socket transforms and
  quantization, compare concrete candidate rules against the reported X/Z-only
  displacement, and add a non-tautological regression if the cause is established.
- [x] Additional user request: a plain viewport right-click during placement
  cancels the armed part/shape and chooses Select, without opening a context menu;
  preserve right-drag camera navigation and existing Esc behavior.
- [x] Run the full test suite, typecheck, formatting and build; inspect the diff;
  verify selection/visibility in the browser and preserve the user's build.

Review focus: virtualized ranges beyond the mounted rows; grouping headings;
collapsed children; a selection containing visible and hidden parts; right-click
on an unselected row; frame consistency between export, preview, and re-import.

## Results

- Final `npm test`: 783 passed across 113 files. Typecheck, format check,
  production build and `git diff --check` passed. Existing canvas notices and
  the build's >500 kB chunk warning remain.
- Browser verification from a cold page load: Shift-click selected GasCaps 2–5;
  right-click Hide selected retained all four selected hidden rows; right-click
  Show selected restored all four without losing the selection. A source hot
  reload temporarily retained stale component state; final checks used a full
  reload and re-import of the preserved six-part user export.
- Browser placement check, starting from Move: arm Part, right-click in the
  viewport, Select is active, no menu opens, and the document remains six parts.
- Independent review found an outward-and-return camera drag could cancel
  placement because the viewport checked only the gesture's endpoints. Fixed by
  consulting StudioControls' sticky drag classification; regression tests ran
  RED then GREEN before the final full suite. The browser's simple right-click
  was verified; the outward-and-return gesture is covered by the controls test.
- Ruling: the Outliner menu contains only the requested visibility action.
  Reusing the viewport's whole part menu would expose pointer-based commands
  such as Select linked that still refer to the viewport pointer.
- The user's exact six-part export is preserved as
  `tests/fixtures/gascap_point_alignment.txt`. Calculating with the current
  native GasCap socket reveals the old centre-turn-only rule added
  `[+0.322, 0, +0.05]` to every point-mounted cap in that build. The point-origin
  interpretation removes precisely this translation, reproducing the reported
  direction and exposed positive-X cube rim without changing height.
- Ruling: apply point-origin seating only to GasCaps on points. Retain the
  quarter-turn rotation; ordinary socket placement and other hinged parts keep
  their prior rules. This is shared by computePoses and childSocketMatrix so
  previews, generators and inverse placement agree.
- **Game limitation:** the point-origin interpretation and exact displacement
  remain inferred from the paired photos, not measured through game scripts.
  Fresh in-game confirmation is still required.
- A new `gascap-centred-alignment-probe.txt` is in this chat's visualization
  directory. It has a Part, four caps, and the SteeringGyro; the cap bounds are
  X/Z ±0.6446 and Y 0.5–0.6, so the expected overhang is equal on all four sides.
- No commits, pushes, dependency changes, or Studio modifications. The original
  six-part user build is restored in the browser with all parts visible.
