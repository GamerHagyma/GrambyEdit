import { decode, encode, utf8Length } from '../../src/core/codec';
import {
  SMALLEST_CODE,
  SMALLEST_JSON,
  APPENDIX_A_CODE,
  APPENDIX_A_JSON,
} from '../fixtures/spec-codes';

test('decodes spec Appendix A', () =>
  expect(decode(APPENDIX_A_CODE)).toEqual({ ok: true, value: APPENDIX_A_JSON }));
test('decode tolerates wrapped, unpadded and URL-safe codes', () => {
  const wrapped = SMALLEST_CODE.replace(/=+$/, '').replace(/(.{20})/g, '$1\r\n  ');
  expect(decode(wrapped)).toEqual({ ok: true, value: SMALLEST_JSON });
  expect(decode(SMALLEST_CODE.replace(/\+/g, '-').replace(/\//g, '_'))).toEqual({
    ok: true,
    value: SMALLEST_JSON,
  });
});
test('accepts a raw JSON paste', () =>
  expect(decode('  [["Part",[],[]]] ')).toEqual({ ok: true, value: [['Part', [], []]] }));
test('reports typed errors', () => {
  expect(decode('W1si*')).toEqual({ ok: false, error: { kind: 'bad-base64', offset: 4 } });
  expect(decode('W1siQ')).toEqual({ ok: false, error: { kind: 'bad-base64', offset: 4 } });
  expect(decode(btoa('{"a":1}'))).toEqual({ ok: false, error: { kind: 'not-an-array' } });
  const r = decode(btoa('[1,'));
  expect(r.ok === false && r.error.kind).toBe('bad-json');
  expect(decode(btoa(String.fromCharCode(0xff, 0xfe)))).toEqual({
    ok: false,
    error: { kind: 'bad-utf8' },
  });
});
test('encode writes compact, padded, standard base64 that round-trips UTF-8', () => {
  expect(encode([['Part', [], []]])).toBe(btoa('[["Part",[],[]]]'));
  const entries = [['Note', [], { Text: 'héllo ✓' }]];
  const code = encode(entries);
  expect(code).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  expect(code.length % 4).toBe(0);
  expect(decode(code)).toEqual({ ok: true, value: entries });
});
test('encodes an 8M-char code in under 1.5 s', () => {
  const big = Array.from({ length: 160_000 }, (_, i) => [
    'Part',
    [['1', '6', i + 1]],
    { RGB: [1, 2, 3] },
  ]);
  const t = performance.now();
  const code = encode(big);
  expect(performance.now() - t).toBeLessThan(1500);
  expect(code.length).toBeGreaterThan(8_000_000);
});
test('utf8Length', () => expect(utf8Length('é✓a')).toBe(6));
