import { ServoPosePreview } from '../../src/core/servo-poses';
import { computePoses } from '../../src/core/pose';
import { chainDoc, part, sock } from '../helpers/doc';
import { realCatalog } from '../helpers/real-catalog';

test('8,000-part servo preview reuses the solver and unchanged body matrices between frames', async () => {
  const cat = await realCatalog(),
    original = chainDoc(8000),
    parts = new Map(original.parts);
  parts.set(1, part(1, 'Servo'));
  parts.set(2, part(2, 'Part', [sock('1', 1, '2')]));
  // Most of this blueprint is independent of the servo output.
  parts.set(3, part(3, 'Part'));
  const doc = { ...original, parts },
    base = computePoses(doc, cat, cat.conventions),
    preview = new ServoPosePreview(doc, cat, base, 1);
  const start = performance.now();
  for (let frame = 0; frame < 60; frame++) {
    const pose = preview.at(frame * 0.75);
    expect(pose.world.get(8000)).toBe(base.world.get(8000));
  }
  expect(performance.now() - start).toBeLessThan(1000);
});
