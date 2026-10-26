import { Vector3 } from 'three';
import { capSize, type SurfaceColor } from '../../../src/core/surfaces/build';
import { buildCurvedSubDoc, curvedPoseValidator } from '../../../src/core/surfaces/build-curved';
import { tileCurved } from '../../../src/core/surfaces/curved-tiling';
import { quadPatch } from '../../../src/core/surfaces/patches';
import { computePoses } from '../../../src/core/pose';
import { parseShareText, toShareCode } from '../../../src/core/share';
import { realCatalog } from '../../helpers/real-catalog';

test.each([false, true])(
  'native mounting and share-code roundtrip preserve certified solid coverage (color %s)',
  async (colorEnabled) => {
    const cat = await realCatalog(),
      cap = capSize(cat)!;
    const d = quadPatch([
      [0, 2, 0],
      [4, 2, 0],
      [4, 2, -3],
      [0, 2, -3],
    ]);
    const spec = {
      hostType: 'Part',
      colorEnabled,
      color: { mode: 'gradient', from: [255, 0, 0], to: [0, 0, 255], axis: 'u' } as SurfaceColor,
    };
    const opts = { posDecimals: 3, rotDecimals: 5 };
    const validator = curvedPoseValidator(spec, cat, cat.conventions, opts);
    if (!validator.ok) throw new Error(validator.error);
    const tiles = await tileCurved(d, cap, {
      maxElements: 1000,
      poseForValidation: validator.validate,
    });
    if (!tiles.ok) throw new Error(tiles.error);
    const r = buildCurvedSubDoc(tiles, spec, cat, cat.conventions, opts);
    if (!r.ok) throw new Error(r.error);
    const parsed = parseShareText(toShareCode(r.sub));
    if (!parsed.ok) throw new Error(parsed.message);
    const poses = computePoses(parsed.doc, cat, cat.conventions);
    tiles.tiles.forEach((tile, i) => {
      const actual = poses.world.get(i + 2)!;
      const expected = validator.validate(tile.frame.clone(), tile);
      actual.elements.forEach((n, k) => expect(n).toBeCloseTo(expected.elements[k], 8));
      expect(Object.hasOwn(parsed.doc.parts.get(i + 2)!.props, 'RGB')).toBe(colorEnabled);
    });
    const inverse = [...poses.world].filter(([id]) => id !== 1).map(([, f]) => f.clone().invert());
    for (let j = 0; j <= 30; j++)
      for (let i = 0; i <= 40; i++) {
        const p = new Vector3(i / 10, 2, -j / 10);
        expect(
          inverse.some((m) => {
            const q = p.clone().applyMatrix4(m);
            return (
              Math.abs(q.x) <= cap.thickness / 2 + 1e-7 &&
              Math.abs(q.y) <= cap.height / 2 + 1e-7 &&
              Math.abs(q.z) <= cap.width / 2 + 1e-7
            );
          }),
        ).toBe(true);
      }
  },
);

test('invalid catalog mounting is a visible boundary error', async () => {
  const cat = await realCatalog(),
    bad = { ...cat, parts: { ...cat.parts, GasCap: { ...cat.parts.GasCap, defaultMount: null } } };
  const spec = { hostType: 'Part', color: { mode: 'single', rgb: [1, 2, 3] } as SurfaceColor };
  expect(
    curvedPoseValidator(spec, bad, cat.conventions, { posDecimals: 3, rotDecimals: 5 }).ok,
  ).toBe(false);
  expect(
    curvedPoseValidator({ ...spec, hostType: 'Missing' }, cat, cat.conventions, {
      posDecimals: 3,
      rotDecimals: 5,
    }).ok,
  ).toBe(false);
});

test('sub-millistud boundary offsets retain solid coverage after export rounding', async () => {
  const cat = await realCatalog(),
    cap = capSize(cat)!;
  const spec = {
    hostType: 'Part',
    colorEnabled: false,
    color: { mode: 'single', rgb: [128, 128, 128] } as SurfaceColor,
  };
  const validator = curvedPoseValidator(spec, cat, cat.conventions, {
    posDecimals: 3,
    rotDecimals: 5,
  });
  if (!validator.ok) throw new Error(validator.error);
  for (const x of [0.0004, 0.0007, 1.2345]) {
    const d = quadPatch([
      [x, 2, 0],
      [x + 4, 2, 0],
      [x + 4, 2, -3],
      [x, 2, -3],
    ]);
    const r = await tileCurved(d, cap, {
      maxElements: 1000,
      poseForValidation: validator.validate,
    });
    expect(r.ok).toBe(true);
  }
});
