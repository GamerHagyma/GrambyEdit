import {
  emptySocketGeometry,
  parseSocketGeometry,
  applySocketGeometry,
} from '../../src/core/socket-geometry';
import { MINI } from '../helpers/catalog';

test('rejects other frame conventions', () =>
  expect(parseSocketGeometry({ ...emptySocketGeometry(), frameConvention: 'raw' })).toEqual({
    ok: false,
    error: 'frameConvention must be "outward-y"',
  }));
test('apply overrides frames, marks them captured and leaves others untouched', () => {
  const f = emptySocketGeometry();
  f.parts.Connector = { sockets: { '5': { cframe: [0, -0.2, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1] } } };
  const c = applySocketGeometry(MINI, f);
  expect(c.parts.Connector.sockets['5']).toMatchObject({
    frame: [0, -0.2, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1],
    frameSource: 'captured',
  });
  expect(c.parts.Connector.sockets['1']).toBe(MINI.parts.Connector.sockets['1']);
  expect(c.parts.Part).toBe(MINI.parts.Part);
});
test('the format error comes first, then the frame convention', () => {
  expect(parseSocketGeometry({ frameConvention: 'raw' })).toEqual({
    ok: false,
    error: 'format must be "grambyedit-sockets"',
  });
  expect(parseSocketGeometry(null)).toMatchObject({ ok: false });
});
test('malformed frames are rejected with their path; partial files are fine', () => {
  const bad = {
    ...emptySocketGeometry(),
    parts: { Part: { sockets: { '6': { cframe: [0, 1] } } } },
  };
  expect(parseSocketGeometry(bad)).toEqual({
    ok: false,
    error: 'parts.Part.sockets.6.cframe must be 12 finite numbers',
  });
  const good = {
    ...emptySocketGeometry(),
    parts: {
      Roof: {
        sockets: {},
        subParts: { Glass: [0, 2, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] },
      },
    },
  };
  const r = parseSocketGeometry(JSON.parse(JSON.stringify(good)));
  expect(r.ok).toBe(true);
  const c = applySocketGeometry(MINI, r.ok ? r.file : emptySocketGeometry());
  expect(c.parts.Roof.subParts.Glass).toEqual({
    cframe: [0, 2, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    approx: false,
  });
  expect(c.parts.Roof.sockets['1']).toBe(MINI.parts.Roof.sockets['1']);
});
test('captures for unknown types or sockets are ignored', () => {
  const f = emptySocketGeometry();
  f.parts.Mystery = { sockets: { '1': { cframe: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] } } };
  f.parts.Part = { sockets: { '99': { cframe: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] } } };
  expect(applySocketGeometry(MINI, f)).toBe(MINI);
});
