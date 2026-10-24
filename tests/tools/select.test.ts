import { clickOp, createClickSelect } from '../../src/tools/select';
import { resetSelectionForTests, selectionSig } from '../../src/state/selection';

beforeEach(() => resetSelectionForTests());

test('click semantics', () => {
  expect(clickOp(5, { shift: false, ctrl: false })).toEqual({ ids: [5], op: 'replace' });
  expect(clickOp(5, { shift: true, ctrl: false })).toEqual({ ids: [5], op: 'toggle' });
  expect(clickOp(5, { shift: false, ctrl: true })).toEqual({ ids: [5], op: 'remove' });
  expect(clickOp(null, { shift: false, ctrl: false })).toEqual({ ids: [], op: 'replace' });
  expect(clickOp(null, { shift: true, ctrl: false })).toEqual({ ids: [], op: 'add' });
});

describe('createClickSelect', () => {
  const plain = { shift: false, ctrl: false, x: 10, y: 10 };
  const shift = { shift: true, ctrl: false, x: 10, y: 10 };

  test('a click on a piece of a multi-piece part selects that piece', () => {
    const click = createClickSelect(() => true);
    click({ part: 3, body: 1 }, plain, 0);
    expect(selectionSig.value.parts).toEqual(new Set([3]));
    expect(selectionSig.value.pieces).toEqual(new Map([[3, 1]]));
  });

  test('a second plain click on the same spot within 400 ms selects the whole part', () => {
    const click = createClickSelect(() => true);
    click({ part: 3, body: 1 }, plain, 0);
    click({ part: 3, body: 1 }, plain, 300);
    expect(selectionSig.value.parts).toEqual(new Set([3]));
    expect(selectionSig.value.pieces).toEqual(new Map());
    // The double-click resets: the next click is a single click on a piece again.
    click({ part: 3, body: 1 }, plain, 600);
    expect(selectionSig.value.pieces).toEqual(new Map([[3, 1]]));
  });

  test('a slow, moved, or interrupted second click is not a double-click', () => {
    const click = createClickSelect(() => true);
    click({ part: 3, body: 1 }, plain, 0);
    click({ part: 3, body: 1 }, plain, 900);
    expect(selectionSig.value.pieces).toEqual(new Map([[3, 1]]));
    click({ part: 3, body: 1 }, { ...plain, x: 30 }, 1000);
    expect(selectionSig.value.pieces).toEqual(new Map([[3, 1]]));
    click(null, plain, 1100);
    click({ part: 3, body: 1 }, plain, 1200);
    expect(selectionSig.value.pieces).toEqual(new Map([[3, 1]]));
  });

  test('a click on another part is not a double-click', () => {
    const click = createClickSelect(() => true);
    click({ part: 3, body: 1 }, plain, 0);
    click({ part: 5, body: 0 }, plain, 100);
    expect(selectionSig.value.parts).toEqual(new Set([5]));
    expect(selectionSig.value.pieces).toEqual(new Map([[5, 0]]));
  });

  test('a part without pieces is selected whole', () => {
    const click = createClickSelect(() => false);
    click({ part: 3, body: 1 }, plain, 0);
    expect(selectionSig.value.parts).toEqual(new Set([3]));
    expect(selectionSig.value.pieces).toEqual(new Map());
  });

  test('Shift+click adds another piece beside the first', () => {
    const click = createClickSelect(() => true);
    click({ part: 3, body: 1 }, plain, 0);
    click({ part: 5, body: 0 }, shift, 1000);
    expect(selectionSig.value.parts).toEqual(new Set([3, 5]));
    expect(selectionSig.value.pieces).toEqual(
      new Map([
        [3, 1],
        [5, 0],
      ]),
    );
  });
});
