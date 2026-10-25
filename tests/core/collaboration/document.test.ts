import {
  deltaBetween,
  applyDelta,
  digest,
  encodeDoc,
  decodeDoc,
  conditionalInverse,
} from '../../../src/core/collaboration/document';
import { docOf, part, sock, pt } from '../../helpers/doc';
import { transact } from '../../../src/core/ops/transact';

test('document codec preserves IDs, points, layouts and unknown props; rejects invalid input', () => {
  const doc = docOf(
    part(10, 'Part', [], { Unknown: { z: 2, a: 1 } }, [pt('{u}')]),
    part(20, 'Wire', [sock('1', 10, '6')]),
  );
  expect(decodeDoc(encodeDoc(doc))).toEqual(doc);
  expect(() => decodeDoc({ ...encodeDoc(doc), nextId: 0 })).toThrow();
  expect(() => decodeDoc({ ...encodeDoc(doc), parts: [[10, {}]] })).toThrow();
});
test('deltas send changed fields only; concurrent disjoint properties and additions merge', () => {
  const doc = docOf(part(1, 'Servo', [], { Speed: 45, Rest: false }));
  const a = transact(doc, 'speed', (d) =>
    d.set({ ...d.get(1)!, props: { Speed: 90, Rest: false } }),
  ).doc;
  const b = transact(doc, 'rest', (d) =>
    d.set({ ...d.get(1)!, props: { Speed: 45, Rest: true } }),
  ).doc;
  const delta = deltaBetween(doc, a);
  expect(JSON.stringify(delta)).not.toContain('Rest');
  expect(applyDelta(applyDelta(doc, delta), deltaBetween(doc, b)).parts.get(1)!.props).toEqual({
    Speed: 90,
    Rest: true,
  });
  expect(deltaBetween(doc, doc)).toEqual([]);
});
test('digest ignores JSON key/Map insertion order but includes layout/export order and remembered angles', () => {
  const a = docOf(part(1, 'Servo', [], { Speed: 45, Rest: false }));
  const b = docOf(part(1, 'Servo', [], { Rest: false, Speed: 45 }));
  expect(digest(a)).toBe(digest(b));
  expect(digest({ ...b, layout: new Map([[1, [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]]]) })).not.toBe(
    digest(a),
  );
});
test('conditional undo restores your field without overwriting a newer remote edit', () => {
  const base = docOf(part(1, 'Servo', [], { Speed: 45, Rest: false }));
  const mine = transact(base, 'mine', (d) =>
    d.set({ ...d.get(1)!, props: { Speed: 90, Rest: true } }),
  ).doc;
  const remote = transact(mine, 'remote', (d) =>
    d.set({ ...d.get(1)!, props: { Speed: 100, Rest: true } }),
  ).doc;
  const inverse = conditionalInverse(base, mine);
  const undone = applyDelta(remote, inverse.ops, inverse.guards);
  expect(undone.parts.get(1)!.props).toEqual({ Speed: 100, Rest: false });
});

test('simultaneously adding the first attachment points merges both UUIDs and undo removes only your point', () => {
  const base = docOf(part(1, 'Part'));
  const a = docOf(part(1, 'Part', [], {}, [pt('{a}')]));
  const b = docOf(part(1, 'Part', [], {}, [pt('{b}')]));
  const combined = applyDelta(applyDelta(base, deltaBetween(base, a)), deltaBetween(base, b));
  expect([...combined.parts.get(1)!.points!.keys()].sort()).toEqual(['{a}', '{b}']);
  const undo = conditionalInverse(base, a),
    restored = applyDelta(combined, undo.ops, undo.guards);
  expect([...restored.parts.get(1)!.points!.keys()]).toEqual(['{b}']);
});
