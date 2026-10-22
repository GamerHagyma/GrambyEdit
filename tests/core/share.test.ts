import { parseShareText, toShareCode } from '../../src/core/share';
import { APPENDIX_A_CODE } from '../fixtures/spec-codes';
test('round-trips Appendix A', () => {
  const r = parseShareText(APPENDIX_A_CODE);
  expect(r.ok && r.doc.order.length).toBe(12);
  expect(r.ok && parseShareText(toShareCode(r.doc)).ok).toBe(true);
});
test('human-readable failures', () => {
  expect(parseShareText('W1si*')).toEqual({
    ok: false,
    message: 'Not a valid share code: invalid base64 at character 5.',
  });
  expect(parseShareText('[[42,[],[]]]')).toEqual({
    ok: false,
    message: 'Entry #1: name is not a string.',
  });
});
