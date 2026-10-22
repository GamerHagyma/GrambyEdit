import { fromEntries, toEntries, normalizeEntries } from '../../src/core/doc';
import { decode, encode } from '../../src/core/codec';
import { corpusCodes } from '../fixtures/corpus';
import { APPENDIX_B_JSON } from '../fixtures/spec-codes';
import type { Json } from '../../src/core/types';

const imp = (raw: Json[]) => {
  const r = fromEntries(raw);
  if (!r.ok) throw new Error(r.error.reason);
  return r.doc;
};
const dec = (code: string) => {
  const r = decode(code);
  if (!r.ok) throw new Error(r.error.kind);
  return r.value;
};

test.each(corpusCodes().map((c, i) => [i, c] as const))(
  'F9: corpus code %i round-trips',
  (_i, code) => {
    const raw = dec(code);
    expect(normalizeEntries(dec(encode(toEntries(imp(raw)))))).toEqual(normalizeEntries(raw));
  },
);
test('Appendix B: points and mounts', () => {
  const d = imp(APPENDIX_B_JSON as Json[]);
  expect([...d.parts.get(1)!.points!.keys()]).toEqual(['{uuid1}', '{uuid2}']);
  expect(d.parts.get(2)!.conns[0]).toEqual({
    self: '3',
    target: { kind: 'point', part: 1, uuid: '{uuid1}' },
  });
  expect(d.parts.get(4)!.conns[0]).toEqual({
    self: '1',
    target: { kind: 'socket', part: 3, socket: '2' },
  });
});
test('int sockets become strings and {} props export as []', () =>
  expect(
    toEntries(
      imp([
        ['Part', [], {}],
        ['Part', [[1, 6, 1]], []],
      ]),
    ),
  ).toEqual([
    ['Part', [], []],
    ['Part', [['1', '6', 1]], []],
  ]));
test('unknown types and props survive verbatim', () => {
  const raw: Json[] = [
    ['FuturePart', [['9', '77', 2]], { Weird: { a: [1, 2] }, RGB: [1, 2, 3] }],
    ['Part', [], []],
  ];
  expect(toEntries(imp(raw))).toEqual(raw);
});
test('bad indices and self-references stay raw and export verbatim', () => {
  const raw: Json[] = [
    ['Part', [['1', '6', 9]], []],
    ['Part', [['1', '6', 2]], []],
  ];
  const d = imp(raw);
  expect(d.parts.get(1)!.conns[0].target).toEqual({ kind: 'raw', triple: ['1', '6', 9] });
  expect(d.parts.get(2)!.conns[0].target.kind).toBe('raw');
  expect(toEntries(d)).toEqual(raw);
});
test('EphemeralAttachments [] survives and absent stays absent', () => {
  const raw: Json[] = [
    ['Base', [], { EphemeralAttachments: [] }],
    ['Base', [], []],
  ];
  expect(toEntries(imp(raw))).toEqual(raw);
});
test('F10 aborts unrepresentable entries with the entry index', () => {
  expect(
    fromEntries([
      ['Part', [], []],
      [42, [], []],
    ]),
  ).toEqual({ ok: false, error: { entry: 1, reason: 'name is not a string' } });
  expect(fromEntries([['Part', [['1', '6']], []]])).toEqual({
    ok: false,
    error: { entry: 0, reason: 'connection 0 is not a 3-element array' },
  });
});
test('export indices follow the current order', () => {
  const d = imp([
    ['Part', [], []],
    ['Part', [], []],
    ['Part', [['1', '6', 2]], []],
  ]);
  const without1 = { ...d, order: [2, 3], parts: new Map([...d.parts].filter(([id]) => id !== 1)) };
  expect(toEntries(without1)).toEqual([
    ['Part', [], []],
    ['Part', [['1', '6', 1]], []],
  ]);
});
