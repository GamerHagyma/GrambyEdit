// @vitest-environment jsdom
import {
  addReferenceFile,
  addReferenceUrl,
  clearReferences,
  referencesSig,
  activeReferenceSig,
  removeReference,
  pasteReference,
} from '../../src/state/references';
import { docSig, historySig, resetStoreForTests } from '../../src/state/store';
import { toShareCode } from '../../src/core/share';

beforeEach(() => {
  clearReferences();
  resetStoreForTests();
  vi.stubGlobal('URL', URL);
  URL.createObjectURL = vi.fn(() => 'blob:reference-image');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  clearReferences();
  vi.unstubAllGlobals();
});

test('references are separate from the blueprint and history', () => {
  const doc = docSig.value,
    history = historySig.value,
    code = toShareCode(doc);
  expect(addReferenceUrl('https://example.com/truck.png')).toBe(true);
  expect(referencesSig.value).toHaveLength(1);
  expect(activeReferenceSig.value?.src).toBe('https://example.com/truck.png');
  expect(docSig.value).toBe(doc);
  expect(historySig.value).toBe(history);
  expect(toShareCode(docSig.value)).toBe(code);
});

test.each([
  'javascript:alert(1)',
  'file:///C:/image.png',
  'data:text/html,bad',
  'https://user:secret@example.com/image.png',
  'not a URL',
])('rejects unsafe or invalid URL %s', (url) => {
  expect(addReferenceUrl(url)).toBe(false);
  expect(referencesSig.value).toHaveLength(0);
});

test('clipboard files take precedence over text; removing local images releases their object URL', () => {
  const file = new File(['image'], 'truck.png', { type: 'image/png' });
  expect(pasteReference({ files: [file], getData: () => 'https://example.com/other.png' })).toBe(
    true,
  );
  expect(activeReferenceSig.value?.src).toBe('blob:reference-image');
  expect(referencesSig.value).toHaveLength(1);
  removeReference(activeReferenceSig.value!.id);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:reference-image');
  expect(activeReferenceSig.value).toBeNull();
});

test('pasted URLs are trimmed and removing an image selects the remaining reference', () => {
  expect(pasteReference({ files: [], getData: () => ' https://example.com/front.png\n' })).toBe(
    true,
  );
  const first = activeReferenceSig.value!;
  addReferenceUrl('http://example.com/side.jpg');
  removeReference(activeReferenceSig.value!.id);
  expect(activeReferenceSig.value).toEqual(first);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
});

test('non-image files are refused without creating object URLs', () => {
  expect(addReferenceFile(new File(['text'], 'notes.txt', { type: 'text/plain' }))).toBe(false);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(referencesSig.value).toHaveLength(0);
});
