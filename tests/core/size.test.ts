import { expect, test } from 'vitest';
import { codeSize, formatPercent } from '../../src/core/size';
import { encode } from '../../src/core/codec';
import { toEntries } from '../../src/core/doc';
import { EMPTY_DOC } from '../../src/core/types';
import { chainDoc } from '../helpers/doc';
import { importCode } from '../helpers/import';
import { corpusCodes } from '../fixtures/corpus';

test.each(
  corpusCodes()
    .slice(0, 40)
    .map((c, i) => [i, c] as const),
)('matches a full encode (corpus %i)', (_i, code) => {
  const d = importCode(code);
  expect(codeSize(d).base64Chars).toBe(encode(toEntries(d)).length);
});
test('empty doc is "[]"', () =>
  expect(codeSize(EMPTY_DOC)).toEqual({ jsonBytes: 2, base64Chars: 4 }));
test('deleting a part re-counts index digits exactly', () => {
  const d = chainDoc(11);
  const after = {
    ...d,
    order: d.order.slice(1),
    parts: new Map([...d.parts].filter(([id]) => id !== 1)),
  };
  const parts = new Map(after.parts);
  parts.set(2, { ...parts.get(2)!, conns: [] });
  const fixed = { ...after, parts };
  expect(codeSize(fixed).base64Chars).toBe(encode(toEntries(fixed)).length);
});
test('16K synthetic meter stays under budget', () => {
  const d = chainDoc(16_000);
  const t = performance.now();
  codeSize(d);
  const parts = new Map(d.parts);
  parts.set(5, { ...parts.get(5)!, props: { RGB: [1, 2, 3] } });
  codeSize({ ...d, parts });
  expect(performance.now() - t).toBeLessThan(300);
});
test('formatPercent', () => {
  expect(formatPercent(640_800, 8_000_000)).toBe('8.01');
  expect(formatPercent(0, 8_000_000)).toBe('0.00');
  expect(formatPercent(5, 0)).toBe('0.00');
});
test('a self-joint counts the digits of its rewritten index', () => {
  const raw = Array.from({ length: 10 }, (_, i) => ['Part', i === 9 ? [['1', '6', 10]] : [], []]);
  const d = importCode(JSON.stringify(raw));
  const after = {
    ...d,
    order: d.order.slice(1),
    parts: new Map([...d.parts].filter(([id]) => id !== 1)),
  };
  expect(codeSize(after).base64Chars).toBe(encode(toEntries(after)).length);
});
