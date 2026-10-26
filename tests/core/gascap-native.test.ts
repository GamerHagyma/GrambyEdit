import observations from '../fixtures/gascap-native-pitched.json';
import { computePoses } from '../../src/core/pose';
import { cfToMatrix4, isCFrame12 } from '../../src/core/cframe';
import { docOf, part, mount } from '../helpers/doc';
import { realCatalog } from '../helpers/real-catalog';

test('GasCaps on points match measured native world frames for both slopes on two rotated hosts', async () => {
  const cat = await realCatalog();
  for (const observation of observations.observations) {
    if (
      !isCFrame12(observation.point) ||
      !isCFrame12(observation.parentWorld) ||
      !isCFrame12(observation.nativeWorld)
    )
      throw new Error('Invalid native capture fixture.');
    const host = part(1, 'Part');
    const doc = docOf(
      {
        ...host,
        points: new Map([
          ['probe', { uuid: 'probe', partName: 'Part', cframe: observation.point }],
        ]),
      },
      part(2, 'GasCap', [mount('1', 1, 'probe')]),
    );
    const placed = { ...doc, layout: new Map([[1, observation.parentWorld]]) };
    const actual = computePoses(placed, cat, cat.conventions).world.get(2)!;
    const native = cfToMatrix4(observation.nativeWorld);
    const maxError = Math.max(...actual.elements.map((n, i) => Math.abs(n - native.elements[i])));
    expect(
      maxError,
      `host ${observation.rootIndex}, source cap ${observation.sourcePart}`,
    ).toBeLessThan(0.001);
  }
});
