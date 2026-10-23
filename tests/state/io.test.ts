import { importText, codePreview } from '../../src/state/io';
import { APPENDIX_A_CODE } from '../fixtures/spec-codes';
import { toShareCode } from '../../src/core/share';
import { baseCatalogSig, resetStoreForTests } from '../../src/state/store';
import { docOf, mount, part } from '../helpers/doc';
import { MINI } from '../helpers/catalog';

beforeEach(resetStoreForTests);

test('import summary and failure message', () => {
  const r = importText(APPENDIX_A_CODE);
  expect(r.ok && r.summary.parts).toBe(12);
  expect(importText('not a code!')).toEqual({
    ok: false,
    message: 'Not a valid share code: invalid base64 at character 11.',
  });
});
test('pasted codes wrapped over lines import', () => {
  const wrapped = APPENDIX_A_CODE.replace(/(.{40})/g, '$1\n  ');
  const r = importText(wrapped);
  expect(r.ok && r.summary.parts).toBe(12);
});
test('summary counts the issues of the imported build', () => {
  baseCatalogSig.value = MINI;
  const code = toShareCode(docOf(part(1, 'Light', [mount('1', 2, '{x}')]), part(2, 'Part')));
  const r = importText(code);
  expect(r.ok && r.summary.errors).toBe(1);
});
test('previews of huge codes stay short', () => {
  const p = codePreview('A'.repeat(8_000_000));
  expect(p.length).toBe(403);
  expect(p).toContain(' … ');
});
test('codes of 400 characters or fewer are previewed whole', () => {
  expect(codePreview('B'.repeat(400))).toBe('B'.repeat(400));
});
