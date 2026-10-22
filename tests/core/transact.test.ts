import { transact, applyPatch } from '../../src/core/ops/transact';
import { docOf, part } from '../helpers/doc';
import { EMPTY_DOC } from '../../src/core/types';

test('records a patch; untouched parts keep identity; undo/redo are exact', () => {
  const d0 = docOf(part(1, 'Part'), part(2, 'Part'));
  const { doc: d1, patch } = transact(d0, 'paint', (d) =>
    d.set({ ...d.get(1)!, props: { RGB: [1, 2, 3] } }),
  );
  expect(d1.parts.get(2)).toBe(d0.parts.get(2));
  expect(patch!.parts).toHaveLength(1);
  expect(applyPatch(d1, patch!, 'undo')).toEqual(d0);
  expect(applyPatch(d0, patch!, 'redo')).toEqual(d1);
});
test('no-op transactions return a null patch', () =>
  expect(transact(EMPTY_DOC, 'x', () => {}).patch).toBeNull());
test('add and delete keep order, layout and nextId consistent', () => {
  const { doc, patch } = transact(docOf(part(1, 'Part')), 'swap', (d) => {
    const id = d.allocId();
    d.add(part(id, 'Part'));
    d.setLayout(id, [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    d.delete(1);
  });
  expect(doc.order).toEqual([2]);
  expect(doc.nextId).toBe(3);
  expect([...doc.layout.keys()]).toEqual([2]);
  expect(applyPatch(doc, patch!, 'undo').order).toEqual([1]);
});
test('a failing transaction leaves the base untouched and misuse throws', () => {
  const d0 = docOf(part(1, 'Part'));
  expect(() =>
    transact(d0, 'bad', (d) => {
      d.set({ ...d.get(1)!, props: { RGB: [9, 9, 9] } });
      d.add(part(1, 'Part'));
    }),
  ).toThrow();
  expect(d0.parts.get(1)!.props).toEqual({});
  expect(() => transact(d0, 'bad', (d) => d.set(part(7, 'Part')))).toThrow();
  expect(() => transact(d0, 'bad', (d) => d.setOrder([1, 1]))).toThrow();
});
test('writing a value back to its original records nothing', () => {
  const d0 = docOf(part(1, 'Part'));
  const original = d0.parts.get(1)!;
  const r = transact(d0, 'noop', (d) => {
    d.set({ ...original, props: { RGB: [1, 1, 1] } });
    d.set(original);
  });
  expect(r.patch).toBeNull();
  expect(r.doc).toBe(d0);
});
