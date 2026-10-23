// @vitest-environment jsdom
import { copyPayload, pasteText, rememberCopy } from '../../src/state/clipboard';
import { placeSig } from '../../src/state/place';
import { select } from '../../src/state/selection';
import { baseCatalogSig, docSig, loadDoc, resetStoreForTests } from '../../src/state/store';
import { toastsSig } from '../../src/state/toasts';
import { MINI } from '../helpers/catalog';
import { docOf, part, sock } from '../helpers/doc';

beforeEach(() => {
  resetStoreForTests();
  placeSig.value = null;
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')])));
});

test('a paste arms the Place tool with the copied parts, joints kept', () => {
  select([1, 2], 'replace');
  const payload = copyPayload()!;
  rememberCopy(payload);
  pasteText(payload.code);
  const src = placeSig.value!;
  expect(src.kind).toBe('paste');
  const sub = src.kind === 'paste' ? src.sub : null;
  expect(sub!.order).toEqual([1, 2]);
  expect(sub!.parts.get(2)!.conns).toEqual([sock('1', 1, '6')]);
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
  const src = placeSig.value!;
  expect(src.kind === 'paste' && src.sub.order.length).toBe(1);
});
