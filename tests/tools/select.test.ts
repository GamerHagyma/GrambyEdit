import { clickOp } from '../../src/tools/select';

test('click semantics', () => {
  expect(clickOp(5, { shift: false, ctrl: false })).toEqual({ ids: [5], op: 'replace' });
  expect(clickOp(5, { shift: true, ctrl: false })).toEqual({ ids: [5], op: 'toggle' });
  expect(clickOp(5, { shift: false, ctrl: true })).toEqual({ ids: [5], op: 'remove' });
  expect(clickOp(null, { shift: false, ctrl: false })).toEqual({ ids: [], op: 'replace' });
  expect(clickOp(null, { shift: true, ctrl: false })).toEqual({ ids: [], op: 'add' });
});
