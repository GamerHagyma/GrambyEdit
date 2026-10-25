import { Matrix4 } from 'three';
import { computePoses } from '../../src/core/pose';
import { WiresLayer } from '../../src/viewport/wires-layer';
import { docOf, part } from '../helpers/doc';
import { realCatalog } from '../helpers/real-catalog';

test('1,000 independent body previews update their incident wires in under 100 ms', async () => {
  const cat = await realCatalog();
  const doc = docOf(...Array.from({ length: 1000 }, (_, i) => part(i + 1, 'Wire')));
  const layer = new WiresLayer();
  layer.sync(doc, computePoses(doc, cat, cat.conventions), new Set(), cat);
  const matrix = new Matrix4();
  let best = Infinity;
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    for (const id of doc.order) layer.setBodyPreview(id, 1, matrix);
    best = Math.min(best, performance.now() - start);
  }
  layer.dispose();
  expect(best).toBeLessThan(100);
});
