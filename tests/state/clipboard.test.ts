// @vitest-environment jsdom
import { copyPayload, pasteText, rememberCopy } from '../../src/state/clipboard';
import { select } from '../../src/state/selection';
import { baseCatalogSig, docSig, loadDoc, resetStoreForTests } from '../../src/state/store';
import { toastsSig } from '../../src/state/toasts';
import { MINI } from '../helpers/catalog';
import { docOf, part, sock } from '../helpers/doc';

beforeEach(() => {
  resetStoreForTests();
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')])));
});

test('a copied selection pastes back with its joints, as new selected parts', () => {
  select([1, 2], 'replace');
  const payload = copyPayload()!;
  rememberCopy(payload);
  pasteText(payload.code);
  const doc = docSig.value;
  expect(doc.order).toEqual([1, 2, 3, 4]);
  expect(doc.parts.get(4)!.conns).toEqual([sock('1', 3, '6')]);
});

test('text that is not a build is refused, even with a copy kept', () => {
  select([1], 'replace');
  rememberCopy(copyPayload()!);
  pasteText('hello there');
  expect(docSig.value.order).toEqual([1, 2]);
  expect(toastsSig.value.at(-1)!.message).toMatch(/^The clipboard does not hold a build/);
});

test('an unreadable clipboard pastes the kept copy', () => {
  select([1], 'replace');
  rememberCopy(copyPayload()!);
  pasteText(null);
  expect(docSig.value.order).toEqual([1, 2, 3]);
});
