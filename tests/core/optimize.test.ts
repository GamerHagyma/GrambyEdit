import { optimizeDoc } from '../../src/core/optimize';
import { transact } from '../../src/core/ops/transact';
import { docOf, mount, part, pt } from '../helpers/doc';

const OPTS = { posDecimals: 4, rotDecimals: 5, dropUnusedPoints: true, dropEmptyAttachments: true };

test('rounds point frames, drops unused points and empty attachment lists, keeps joints', () => {
  const d0 = docOf(
    part(1, 'Base', [], {}, [pt('{a}', [1.234567, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), pt('{b}')]),
    part(2, 'Part', [mount('1', 1, '{a}')]),
    part(3, 'Base', [], {}, []),
  );
  let res: unknown;
  const { doc } = transact(d0, 'opt', (d) => {
    res = optimizeDoc(d, OPTS);
  });
  expect(res).toEqual({ pointsRemoved: 1, numbersRounded: 1, emptiedRemoved: 1 });
  expect(doc.parts.get(1)!.points!.get('{a}')!.cframe[0]).toBe(1.2346);
  expect(doc.parts.get(3)!.points).toBeNull();
  expect(doc.parts.get(2)!.conns).toEqual(d0.parts.get(2)!.conns);
});

test('a second pass changes nothing and records no patch', () => {
  const d0 = docOf(
    part(1, 'Base', [], {}, [pt('{a}', [1.234567, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])]),
    part(2, 'Part', [mount('1', 1, '{a}')]),
  );
  const once = transact(d0, 'opt', (d) => {
    optimizeDoc(d, OPTS);
  });
  let res: unknown;
  const twice = transact(once.doc, 'opt', (d) => {
    res = optimizeDoc(d, OPTS);
  });
  expect(res).toEqual({ pointsRemoved: 0, numbersRounded: 0, emptiedRemoved: 0 });
  expect(twice.patch).toBeNull();
  expect(twice.doc).toBe(once.doc);
});

test('a part whose only points are unused loses its attachment list', () => {
  const d0 = docOf(part(1, 'Base', [], {}, [pt('{b}')]));
  let res: unknown;
  const { doc } = transact(d0, 'opt', (d) => {
    res = optimizeDoc(d, OPTS);
  });
  expect(res).toEqual({ pointsRemoved: 1, numbersRounded: 0, emptiedRemoved: 1 });
  expect(doc.parts.get(1)!.points).toBeNull();
});
test('a point named by an unresolved raw joint is kept', () => {
  const d0 = docOf(
    part(1, 'Base', [], {}, [pt('{a}')]),
    part(2, 'Part', [{ self: '1', target: { kind: 'raw', triple: ['1', '{a}', 99] } }]),
  );
  const { doc } = transact(d0, 'opt', (d) => {
    optimizeDoc(d, {
      posDecimals: 4,
      rotDecimals: 5,
      dropUnusedPoints: true,
      dropEmptyAttachments: true,
    });
  });
  expect(doc.parts.get(1)!.points!.has('{a}')).toBe(true);
});
