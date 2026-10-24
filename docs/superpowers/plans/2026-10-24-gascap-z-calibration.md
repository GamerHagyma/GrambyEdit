# GasCap residual Z calibration

The user's follow-up game test disproves the previous point-origin hypothesis:
the centred four-cap probe still appears about half a GasCap width towards -Z,
with X and height aligned. Do not treat the previous inferred rule as verified.

## Verified evidence

- The current browser export is byte-for-byte identical to
  `gascap-centred-alignment-probe.txt`; this is not a stale or different code.
- Its four point positions are X/Z ±0.3223, Y 0.55, with identical rotations.
- The captured GasCap mesh is 0.6446 studs wide. Its native socket lies at
  `[-0.05, 0, -0.322]` in the part's coordinates.
- The user reports a residual shift in -Z, approximately half the width. The
  exact displacement and the coordinate frame it follows have not been measured.

## Decision

Several previous in-game fixes failed. Stop changing production pose rules from
one view. Use a single comparison build to discriminate part/point/host frames.
The proposed 0.322-stud compensation comes from the captured hinge distance,
not a world-axis constant or a pixel measurement.

## Comparison probe

`gascap-offset-comparison.txt` in this chat's visualization directory has 37 parts
on one Base: two rows of three colored reference cubes, each carrying a four-cap
plate and SteeringGyro.

- Red: current export, no added compensation.
- Green: add 0.322 along the panel's local +Z, rotated with the point-plane frame.
- Column 1: normal host and points.
- Column 2: host rotated 90 degrees, points unchanged in host space.
- Column 3: host unchanged, point planes rotated 90 degrees.

The source and row metadata are in `gascap-offset-comparison.json`. Invariants,
round-trip import, finite poses, default limits and build validation pass: zero
errors or warnings. The build was loaded and visually checked in a separate
browser tab; the user's centred six-part build remains in the original tab.

The pre-correction editor deliberately showed the green plates offset. If all green
plates are centred in game, the compensation follows the point-plane frame.
Mixed results distinguish that from a host-axis or world-axis offset. Await
that observation before changing the mount frame and its inverse.

## Confirmed result and implementation

The user answered **"All three green blocks are centred"** and supplied a game
screenshot. The compensation follows the point plane in all three tested cases.
The screenshot also shows the nested plates upright, unlike the editor; do not
use this centring result as proof of the nested build's global orientation.

The shared GasCap point socket now keeps the quarter-turn rotation and uses
translation `(0, -nativeSocket.position.z, 0)`. This derives the 0.322 hinge
distance from the capture and works with both computePoses and inverse placement.
It changes only GasCaps on points; door sockets and other types keep their rules.

Regression tests first failed on the 0.322 residual and missing exported
compensation, then passed after the correction. They pin all three green plate
centres and the generated flat-surface point coordinates. The comparison code is
preserved as `tests/fixtures/gascap_offset_comparison.txt`.

## Verification and remaining boundary

- `npm test`: 785 tests passed across 113 files; exit 0.
- Typecheck, format check and production build passed; existing canvas notices
  and the large-bundle build warning remain.
- Independent read-only review found no actionable issue. Its numerical matrix
  check confirmed the correction moves a cap -0.322 along point-local X and that
  the inverse adds the game-tested compensation.
- The corrected six-part centred probe imports and re-exports byte-for-byte
  unchanged in a cold-loaded browser, with no console errors or build issues.
- New output: `gascap-calibrated-centred-probe.txt` in this chat's visualization
  directory. It has point X ±0.3223, Y 0.55, and Z -0.0003/0.6443. Round-tripped
  cap bounds are X/Z approximately ±0.6446 and Y 0.5–0.6.
- The user's original six-part probe is restored in the first browser tab; the
  newly calibrated export is open in the second. Existing codes are not migrated:
  they render with the corrected mounting rule; new generation/inverse placement
  emits compensated points.
- The nested comparison's upright panels remain a separate orientation
  discrepancy. The user's green-row result confirms the local translation in the
  tested cases, not arbitrary global/nested pose accuracy.
- No commits, pushes, dependency changes or Studio modifications.
