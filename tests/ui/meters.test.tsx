// @vitest-environment jsdom
import { render, screen } from '@testing-library/preact';
import { Meters } from '../../src/ui/layout/Meters';
import { metersView } from '../../src/ui/layout/Meters'; // pure helper exported for tests
import { resetStoreForTests } from '../../src/state/store';

beforeEach(resetStoreForTests);

test('two-decimal code meter and part meter text and classes', () => {
  expect(
    metersView(
      { base64Chars: 640_800, parts: 2_385 },
      { codeChars: 8_000_000, partSoftCap: 8_000, partWarn: 16_000 },
    ),
  ).toEqual({
    codeText: 'Code 8.01% used',
    codeLevel: 'ok',
    partsText: 'Parts 2,385 / 8,000',
    partsLevel: 'ok',
    partsNote: '',
  });
  expect(
    metersView(
      { base64Chars: 7_000_000, parts: 9_000 },
      { codeChars: 8_000_000, partSoftCap: 8_000, partWarn: 16_000 },
    ),
  ).toMatchObject({ codeLevel: 'warn', partsLevel: 'high', partsNote: 'laggy' });
  expect(
    metersView(
      { base64Chars: 9_000_000, parts: 17_000 },
      { codeChars: 8_000_000, partSoftCap: 8_000, partWarn: 16_000 },
    ),
  ).toMatchObject({ codeLevel: 'bad', partsLevel: 'bad', partsNote: 'beyond tested' });
  render(<Meters />);
  expect(screen.getByText('Code 0.00% used')).toBeTruthy();
});
