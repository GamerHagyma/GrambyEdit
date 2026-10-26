# Measured GasCap point mounting

This supersedes the screenshot-based GasCap point rule from 2026-10-24. Physical door sockets and other hinged parts are unchanged.

## Evidence

The user tested curved fixtures in Road to Gramby's. Crown and cylinder panels looked good, but a 90° crease had tabs which became worse after a thickness-only miter adjustment. Identical re-exported attachment frames were initially mistaken for native pose evidence. That comparison was circular: it reconstructed both codes through the same editor rule.

With the user's explicit permission, a local read-only Windows capture measured spawned GasCap BasePart world CFrames and sizes, plus the two supporting Part world CFrames. No game writes, injection, hooks or template changes were used. Captured dimensions agree with the shipped box: 0.1 × 0.644599974 × 0.644599974 studs. Missing visual scaling was ruled out.

Each independently rotated host had 144 uniquely matched caps, with both ±45° slopes. The effective child socket recovered from

`inverse(nativeChildWorld) * nativeHostWorld * hostSubpart * savedPoint * mating`

had a consistent transform across all 288 observations, with maximum component spread below 0.000066:

- Translation: the original captured socket position, approximately **[-0.05, 0, -0.322]**.
- Rotation: **capturedSocketRotation * Rx(90°) * Ry(-90°)**.

The old rule put the native cap center half its thickness behind the predicted center and used different in-plane axes. Flat square screenshots could not resolve those axes or the 0.05-stud height difference. The old green comparison's horizontal centering remains valid, but its inferred height and orientation were not native measurements.

Twenty-four direct observations, including both slopes and both hosts, are preserved in `tests/fixtures/gascap-native-pitched.json`. The new native-world-frame test failed against the old rule and passes with the measured rule. It checks direct measured frames rather than comparing two outputs of the pose engine.

## Implementation and independent retest

`turnHinge` changes only the GasCap-on-point case. It keeps captured translation and right-multiplies rotation by `Rx(90°) * Ry(-90°)`. Existing inverse placement and both surface builders reuse `childSocketMatrix`, so new exports receive the same correction automatically. The legacy tiler's geometry is unchanged; its old exported point coordinates change to match native placement.

After regeneration, the user reported the v4 crease **“works perfectly.”** A fresh read-only capture of that 144-cap build provided an independent retest:

- Maximum parent-relative position component error: **0.00004857 studs**.
- Maximum rotation-matrix component error: **0.00004980**.

The remaining error is consistent with live float32 transforms and serialized pose precision. Both the actual CFrames and visible native result now agree with the editor, rather than relying on an offset inferred from a screenshot.

The right-angle layout retains a 0.005-stud inward end-plane recess to avoid coincident, differently colored end faces. Other crease angles use the original conservative overlap. GasCaps are not cut into exact miters. Uncolored exports omit RGB; the user confirmed the game assigns random GasCap colors in that case.
