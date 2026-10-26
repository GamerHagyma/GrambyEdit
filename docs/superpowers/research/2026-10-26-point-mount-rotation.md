# Native point-mount rotation investigation

## Verdict

The supplied diagnosis correctly identifies the original Servo_Physics mount error and its inherited child transforms. Its proposed general rule and Splitter connection-priority fix are not supported by the broader measurements.

The native point frame is the captured child socket frame **right-multiplied by `Rx(90°) * Ry(-90°)`**, retaining its translation. This was previously implemented only for GasCaps. It matches all 90 newly measured point cases across ten types. Replacing every child's rotation with a fixed 180-degree frame fits the servo/Bearing family, but fails for the other seven tested types.

The existing Orientation order/signs are correct in the tested point and ordinary-socket cases. A separate exception was missing: hinged children on physical Door sockets ignore Orientation. Point-mounted hinges still take Orientation.

## Original saved build

The original source is `Downloads/GrambyEdit-2026-10-26.txt`, with existing read-only geometry in `%TEMP%/opencode/live-parts.json`. The minimal direct observations and source hash are retained in `tests/fixtures/servo-point-native.json`.

An independent registration from Connector #198's measured native frame found 272 unique matching part-level frames before correction. The servo and its ten children were displaced; the remaining part-level mismatch was the multi-body Splitter representation.

- Servo #274 has a 0.212-stud center displacement and 120-degree base rotation error. The proposed servo transform agrees with its measured host-relative frame within 0.000075 per matrix component.
- Splitter #234 already renders all five pieces correctly. Its Handle and four output centers agree within 0.00028 studs. Catalog subpart frames identify B→Handle, A→Output4, C→Output1, D→Output3 and E→Output2.
- `poses.world` for a multi-body part is its lead body's frame; it is not necessarily the Handle's frame. Comparing that value to the native Handle falsely diagnosed a pose-connection error. Changing first-connection priority would also change graph/tool semantics without fixing a misplaced rendered body. No such change was made.

## Expanded probe and capture

At the user's request, `scripts/rotation-probe.ts` generated one creation with **171 parts and 130 samples**:

- Part, Connector, ShortStick, InputSensor, Bearing, Servo, Servo_Physics, DoorA, GasCap and Spoiler.
- Nine point cases per type: neutral, X/Y/mixed point frames, individual X/Y/Z Orientation turns, combined Orientation, and combined point-frame plus Orientation turns.
- Three ordinary-socket controls per type: neutral, combined Orientation, and a side socket on a rotated host.
- DoorA/GasCap on physical Roof door sockets, and InputSensor on Bearing/Servo/Servo_Physics outputs, each neutral and with combined Orientation.

The generator uses explicit input CFrames, not inverse placement, so a wrong editor inverse cannot manufacture a passing native result. A single SteeringGyro root and separated grid slots identify the build. Parent and child types differ within each socket-control cell. Export/import validation reported no issues; the gallery's Copy button was verified to copy the full 41,844-character code.

After spawning it, the user said: **“I loaded it in, you can probe it now.”** A read-only capture found exactly 171 models and one root candidate. It used query/read process rights only and wrote CFrames/sizes for the explicit probe types near the root; no process writes, injection, hooks or game modifications were used.

Samples were matched uniquely by type and separated location. Physical door children extend beyond their cell center, so their unique assignments also used the measured parent socket location; candidate residuals were bounded and reused model assignments were rejected. Their raw CFrames, not predicted transforms, became the expected test values. An independent reviewer confirmed exact correspondence between all 130 fixture frames and the raw capture, and between fixture inputs and the probe manifest.

Direct observations are retained in `tests/fixtures/rotation-probe-native.json`. The capture timestamp and source-code SHA256 bind them to the probe. Reproduce the creation with:

```text
node --import tsx scripts/rotation-probe.ts [output-directory]
```

## Results and correction

| Group | Native result |
| --- | --- |
| 90 point mounts | Common correction matches all ten types; maximum center error 0.000271 studs and rotation difference 0.0081° |
| 30 ordinary socket controls | Existing socket frames and Orientation behavior match; no catalog edits required |
| 4 physical door controls | Neutral frames match; mixed Orientation is ignored by the native hinge |
| 2 non-physics Servo output controls | Existing Orientation behavior matches |
| 4 Bearing/physics-servo output controls | Centers and axes match; angle about the free axis is physical state, not a fixed-pose discrepancy |

The frame rule is now shared through `childSocketMatrix`, and `computePoses` uses that same helper. Cache keys distinguish point, physical door and ordinary socket tails. Existing point inverses for free moves, clipboard, generators and symmetry receive the corrected frame automatically. Door Orientation context is also supplied consistently to posing, placement previews, rotation commands, transform and symmetry code.

No Orientation order/sign change, catalog frame replacement, stored-blueprint rewrite or Splitter priority change is needed. Existing point-mounted builds may display differently because their computed preview now follows the measured game rule. GasCap point poses retain their previously verified correction.

The common point convention is measured across these ten types, not every template in the catalog. Arbitrary live physics angles, suspension settling and signal-driven states are not simulated or inferred from a fixed snapshot.

## Verification

- The original native servo test first failed with a 1.26647 matrix-component error; the five-body Splitter regression passed before any production change.
- Expanded tests first produced 85 failures: 81 previously uncorrected point mounts, two mixed door mounts, and two mixed point/socket cache-order cases. Applying the common frame correction left only the two door cases failing; adding the measured hinge Orientation exception resolved those.
- Regression coverage also checks free-move continuity, arbitrary world moves, placement forward frames, duplicates, both cache orders, native rotation commands, transform refusal and unknown child context. Two old synthetic point-placement expectations were updated to the native convention.
- Independent read-only review: no actionable correctness findings; 188 relevant tests passed before the final boundary and command checks.
- Final suite: **154 files / 1,240 tests passed**. Typecheck, production build, formatting and diff whitespace checks passed. Existing jsdom canvas notices and the main-bundle size warning remain.
- Chromium loaded the exact probe code into the real editor and matched all **126 fixed native frames**, with maximum normalized matrix-component error **0.000235**. Actual `R Z 90` changed orientation by 90 degrees with zero position shift; `G X 2` moved exactly two studs. No runtime errors.
- The existing curved-surface browser check also passed: 120 previewed caps created 120 parts, Undo restored the preview, both camera projections rendered, and no panel overflow or runtime errors occurred.

Work is local on `codex/profile-surfaces`; nothing was pushed or published.
