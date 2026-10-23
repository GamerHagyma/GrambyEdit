import { chainDoc } from '../helpers/doc';
import { computePoses } from '../../src/core/pose';
import { validate } from '../../src/core/rules';
import { buildStats } from '../../src/core/stats';
import { codeSize } from '../../src/core/size';
import { realCatalog } from '../helpers/real-catalog';
import { DEFAULT_LIMITS } from '../../src/core/types';
import { parseShareText, toShareCode } from '../../src/core/share';

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

test('decode + model of an 8K-part code under 500 ms', () => {
  const code = toShareCode(chainDoc(8_000));
  // Best of three, as above.
  let best = Infinity;
  for (let run = 0; run < 3; run++) {
    const t = performance.now();
    const r = parseShareText(code);
    best = Math.min(best, performance.now() - t);
    expect(r.ok).toBe(true);
  }
  expect(best).toBeLessThan(500);
}, 30_000);
