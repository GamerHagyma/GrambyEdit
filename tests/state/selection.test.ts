import { loadDoc, resetStoreForTests } from '../../src/state/store';
import {
  sanitizeSelection,
  select,
  selectModeSig,
  selectPiece,
  selectPoints,
  selectionSig,
} from '../../src/state/selection';
import { docOf, part, sock } from '../helpers/doc';

beforeEach(resetStoreForTests);

test('a piece pick selects that body only; toggles add, remove and make pieces whole', () => {
  selectPiece(4, 1, 'replace');
  expect([...selectionSig.value.parts]).toEqual([4]);
  expect([...selectionSig.value.pieces]).toEqual([[4, 1]]);
  expect(selectionSig.value.active).toBe(4);

  selectPiece(7, 0, 'toggle');
  expect([...selectionSig.value.pieces]).toEqual([
    [4, 1],
    [7, 0],
  ]);

  selectPiece(4, 0, 'toggle');
  expect(selectionSig.value.pieces.has(4)).toBe(false);
  expect(selectionSig.value.parts.has(4)).toBe(true);

  selectPiece(7, 0, 'toggle');
  expect(selectionSig.value.parts.has(7)).toBe(false);
  expect(selectionSig.value.pieces.has(7)).toBe(false);
});

test('add keeps a whole part whole and makes a part picked by another body whole', () => {
  select([4], 'replace');
  selectPiece(4, 1, 'add');
  expect(selectionSig.value.pieces.has(4)).toBe(false);

  selectPiece(7, 1, 'replace');
  selectPiece(7, 0, 'add');
  expect(selectionSig.value.parts.has(7)).toBe(true);
  expect(selectionSig.value.pieces.has(7)).toBe(false);
});

test('select with add makes a piece whole', () => {
  selectPiece(4, 1, 'replace');
  select([4], 'add');
  expect(selectionSig.value.parts.has(4)).toBe(true);
  expect(selectionSig.value.pieces.has(4)).toBe(false);
});

test('a point pick replace clears the piece selection', () => {
  selectPiece(4, 1, 'replace');
  selectPoints(['4:u'], 'replace');
  expect(selectionSig.value.pieces.size).toBe(0);
  expect(selectionSig.value.parts.size).toBe(0);
});

test('sanitizeSelection drops the piece of a part the doc no longer has', () => {
  selectPiece(4, 1, 'replace');
  selectPiece(7, 0, 'toggle');
  sanitizeSelection(docOf(part(7, 'Part')));
  expect([...selectionSig.value.parts]).toEqual([7]);
  expect([...selectionSig.value.pieces]).toEqual([[7, 0]]);
});

test('attached mode selects a part and its posed children whole', () => {
  loadDoc(docOf(part(4, 'Part'), part(5, 'Part', [sock('1', 4, '6')])));
  selectModeSig.value = 'attached';
  selectPiece(4, 1, 'replace');
  expect([...selectionSig.value.parts].sort()).toEqual([4, 5]);
  expect(selectionSig.value.pieces.size).toBe(0);
});
