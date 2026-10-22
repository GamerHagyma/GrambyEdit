import { emptyHistory, record, undoStep, redoStep } from '../../src/state/history';
import { transact } from '../../src/core/ops/transact';
import { docOf, part } from '../helpers/doc';

test('cap 500, record clears redo, undo/redo walk the stack', () => {
  let doc = docOf(part(1, 'Part'));
  let h = emptyHistory();
  for (let i = 0; i < 501; i++) {
    const r = transact(doc, `p${i}`, (d) => d.set({ ...d.get(1)!, props: { OrientationY: i } }));
    doc = r.doc;
    h = record(h, r.patch!);
  }
  expect(h.past).toHaveLength(500);
  const u = undoStep(h, doc)!;
  expect(u.doc.parts.get(1)!.props).toEqual({ OrientationY: 499 });
  expect(redoStep(u.h, u.doc)!.doc).toEqual(doc);
  expect(record(u.h, transact(u.doc, 'x', (d) => d.delete(1)).patch!).future).toHaveLength(0);
});
test('undo and redo stop at the ends of the stack', () => {
  expect(undoStep(emptyHistory(), docOf())).toBeNull();
  expect(redoStep(emptyHistory(), docOf())).toBeNull();
});
