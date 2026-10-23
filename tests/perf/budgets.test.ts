import { chainDoc } from '../helpers/doc';
import { computePoses } from '../../src/core/pose';
import { validate } from '../../src/core/rules';
import { buildStats } from '../../src/core/stats';
import { codeSize } from '../../src/core/size';
import { realCatalog } from '../helpers/real-catalog';
import { DEFAULT_LIMITS } from '../../src/core/types';

test('one 16K edit cycle (poses + issues + stats + size) under 400 ms', async () => {
  const cat = await realCatalog();
  const d = chainDoc(16_000);
  // Best of three, so a busy machine (parallel test files) does not fail a budget the code meets.
  let best = Infinity;
  for (let run = 0; run < 3; run++) {
    const t = performance.now();
    computePoses(d, cat, cat.conventions);
    validate(d, cat, DEFAULT_LIMITS, codeSize(d).base64Chars);
    buildStats(d);
    best = Math.min(best, performance.now() - t);
  }
  expect(best).toBeLessThan(400);
}, 30_000);
