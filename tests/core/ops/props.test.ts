import { transact } from '../../../src/core/ops/transact';
import { setProp, UNSET } from '../../../src/core/ops/props';
import { paint } from '../../../src/core/ops/paint';
import { docOf, part } from '../../helpers/doc';
import { MINI } from '../../helpers/catalog';

test('Bullets on 2 Mags + 1 ShortStick changes only the mags', () => {
  const d0 = docOf(
    part(1, 'Mag', [], { Bullets: 10 }),
    part(2, 'Mag', [], { Bullets: 20 }),
    part(3, 'ShortStick'),
  );
  let res: unknown;
  const { doc } = transact(d0, 'bullets', (d) => {
    res = setProp(d, MINI, [1, 2, 3], 'Bullets', 30);
  });
  expect(res).toEqual({ applied: [1, 2], skipped: [3] });
  expect(doc.parts.get(2)!.props.Bullets).toBe(30);
  expect(doc.parts.get(3)!.props).toEqual({});
  expect(
    transact(doc, 'reset', (d) => setProp(d, MINI, [1], 'Bullets', UNSET)).doc.parts.get(1)!.props,
  ).toEqual({});
});

test('paint skips types that cannot be painted', () => {
  let res: unknown;
  transact(docOf(part(1, 'Part'), part(2, 'Gate-AND')), 'paint', (d) => {
    res = paint(d, MINI, [1, 2], [1, 2, 3]);
  });
  expect(res).toEqual({ applied: [1], skipped: [2] });
});

test('setProp refuses EphemeralAttachments: point ops own it', () => {
  transact(docOf(part(1, 'Base')), 'x', (d) => {
    expect(() => setProp(d, MINI, [1], 'EphemeralAttachments', 5)).toThrow(
      'use point ops for EphemeralAttachments',
    );
  });
});

test('setProp skips a key the type does not support, unless the part already holds it', () => {
  const d0 = docOf(part(1, 'Mag'), part(2, 'Mag', [], { Activated: true }));
  let res: unknown;
  const { doc } = transact(d0, 'x', (d) => {
    res = setProp(d, MINI, [1, 2], 'Activated', false);
  });
  expect(res).toEqual({ applied: [2], skipped: [1] });
  expect(doc.parts.get(1)!.props).toEqual({});
  expect(doc.parts.get(2)!.props).toEqual({ Activated: false });
});

test('paint writes RGB only on paintable types and leaves other props alone', () => {
  const d0 = docOf(part(1, 'Part', [], { OrientationX: 90 }));
  const { doc } = transact(d0, 'paint', (d) => {
    paint(d, MINI, [1], [9, 8, 7]);
  });
  expect(doc.parts.get(1)!.props).toEqual({ OrientationX: 90, RGB: [9, 8, 7] });
});
