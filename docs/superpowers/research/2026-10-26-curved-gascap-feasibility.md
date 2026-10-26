# Native GasCap curved-surface feasibility

Date: 2026-10-26. Automated geometry gate passed for the fixtures below. In-game rendering/physics remains unverified; test share codes have been prepared for the user.

## Reproduce

`node --import tsx scripts/curved-surface-fixtures.ts`

This writes a gallery, captured-mesh SVGs, importable share codes and numerical metrics into the ignored `.claude/profile-surface-fixtures/` directory. Nothing from the experiment is deployed or added to a blueprint automatically.

The generator uses the real catalog, GasCap mount, export precision (3 position / 5 rotation decimals), normal coloring stagger, share-code encoder/decoder and pose reconstruction. The captured GasCap OBJ is a closed rectangular plate with bounds approximately 0.6446 × 0.6446 × 0.1 studs. The fixture script verifies its vertices remain box corners before using box-solid coverage checks.

## Observed results

Each variant was checked at 4,941 independent guide samples after share-code roundtrip. All had **zero uncovered native-solid samples**. Conservative control-hull bounds also certify each assigned guide region is inside its native plate's solid volume; the samples are an independent regression check, not the mathematical certificate.

| Guide, 6 × 4 stud footprint | Caps | Max assigned deviation: native / colored | Max whole-footprint deviation: native / colored |
| --- | ---: | ---: | ---: |
| Flat | 96 | 0 / 0.01500 | 0 / 0.01500 |
| Crown, 0.5 stud rise | 104 | 0.00333 / 0.01823 | 0.02636 / 0.03967 |
| Circular-arc approximation, radius 6 studs / 60° sweep | 112 | 0.00470 / 0.01957 | 0.05314 / 0.06733 |
| S curve | 112 | 0.00665 / 0.02040 | 0.06417 / 0.07329 |
| Saddle | 96 | 0.00312 / 0.01806 | 0.01490 / 0.02924 |
| Crease, approximately 53° change in normal | 120 | 0.00045 / 0.01565 | 0.00045 / 0.01566 |
| Crease, 90° change in normal | 144 | 0 / 0.01556 | 0 / 0.01556 |

Distances are studs. Full-plate bounds are conservative and include plate thickness in the projected neighborhood. At Creases they apply independently to the two domains; native overlap at the ridge still needs visual judgment.

## Supported range and chosen limits

- Require a strongly monotone projection into the initial corner plane. Derivative control hulls and bounded subdivision certify this, which also rules out distant self-intersections of the guide. Non-overhanging roofs/hoods are supported; looping, folded and near-singular surfaces return a clear unsupported result.
- Assigned guide deviation must stay below 45% of native thickness: **0.045 studs** for this mesh. This leaves margin inside the 0.05-stud half-thickness, including coloring and export rounding.
- Whole-footprint deviation is capped at one thickness: **0.1 studs**. This admits the useful fixtures above but rejects a narrow, highly bent patch even when its assigned cells are tiny.
- Lay out at 80% of native plate spacing, with bounded local refinement. Physical plates retain their native size. The 20,000-cap ceiling covers the entire generated surface.
- Reduce edge/ridge overhang by shifting edge plates within their certified coverage interval. Reserve up to **0.005 studs** of overlap at boundaries for export rounding. A regression test reproduced a 0.0003-stud hole from an exactly flush boundary before this reserve was added.
- Keep smooth joins on one global layout. Adding a smooth profile does not insert a second seam strip.

These are acceptance bounds, not a promise to generate every curve or a universal minimum bend radius. A tight curve returns a resolution-limit diagnostic; subdividing its guide does not make rigid GasCaps bend.

## Remaining visual limits

The guide lies within the union of accepted native plate solids; that does not make their outer faces mathematically smooth. Faceting, small overlap, native thickness at ridges, boundary overhang on skew/curved edges, and color staggering remain visible at close range. The gallery uses reconstructed native meshes, but SVG painter ordering is illustrative rather than a depth-buffer rendering guarantee. No claims about in-game hinge behavior, physics or flicker have been verified yet.

Proceed with the editor for this certified range. The user's optional in-game check can refine visual limits without changing the shared control-net representation or the old four-corner path.
