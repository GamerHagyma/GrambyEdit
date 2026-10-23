// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/preact';
import { PaintPanel } from '../../../src/ui/panels/PaintPanel';
import { select, selectionSig } from '../../../src/state/selection';
import { settingsSig, updateSettings } from '../../../src/state/settings';
import { baseCatalogSig, docSig, loadDoc, resetStoreForTests } from '../../../src/state/store';
import { toastsSig } from '../../../src/state/toasts';
import { paintModeSig, recentColorsSig } from '../../../src/tools/paint';
import { docOf, part } from '../../helpers/doc';
import { MINI } from '../../helpers/catalog';

beforeEach(() => {
  resetStoreForTests();
  localStorage.clear();
});

test('Paint selection paints paintables and reports the rest', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part'), part(2, 'Gate-AND')));
  select([1, 2], 'replace');
  updateSettings({ activeColor: [10, 20, 30] });
  render(<PaintPanel />);
  fireEvent.click(screen.getByText('Paint selection'));
  expect(docSig.value.parts.get(1)!.props.RGB).toEqual([10, 20, 30]);
  expect(toastsSig.value.at(-1)!.message).toBe("Skipped 1 parts that can't be painted.");
});

test('painting with the selection records the color as recent', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part')));
  select([1], 'replace');
  updateSettings({ activeColor: [10, 20, 30] });
  render(<PaintPanel />);
  fireEvent.click(screen.getByText('Paint selection'));
  expect(recentColorsSig.value[0]).toEqual([10, 20, 30]);
});

test('a swatch sets the active color', () => {
  render(<PaintPanel />);
  fireEvent.click(screen.getByLabelText('Swatch #c62828'));
  expect(settingsSig.value.activeColor).toEqual([198, 40, 40]);
});

test('typing a channel or a hex value sets the active color', () => {
  render(<PaintPanel />);
  fireEvent.change(screen.getByLabelText('G'), { target: { value: '99' } });
  expect(settingsSig.value.activeColor[1]).toBe(99);
  fireEvent.change(screen.getByLabelText('Hex'), { target: { value: '#0a0b0c' } });
  expect(settingsSig.value.activeColor).toEqual([10, 11, 12]);
});

test('a build color click picks it, and Shift+click selects its parts', () => {
  baseCatalogSig.value = MINI;
  loadDoc(
    docOf(
      part(1, 'Part', [], { RGB: [198, 40, 40] }),
      part(2, 'Part', [], { RGB: [198, 40, 40] }),
      part(3, 'Part', [], { RGB: [9, 8, 7] }),
    ),
  );
  render(<PaintPanel />);
  fireEvent.click(screen.getByLabelText('#090807, 1 part'));
  expect(settingsSig.value.activeColor).toEqual([9, 8, 7]);
  expect(selectionSig.value.parts.size).toBe(0);
  fireEvent.click(screen.getByLabelText('#c62828, 2 parts'), { shiftKey: true });
  expect([...selectionSig.value.parts].sort()).toEqual([1, 2]);
});

test('the mode buttons set the paint mode and mark it pressed', () => {
  render(<PaintPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Brush' }));
  expect(paintModeSig.value).toBe('brush');
  expect(screen.getByRole('button', { name: 'Brush' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Click' }).getAttribute('aria-pressed')).toBe('false');
});

test('the auto-color toggle sets settings.autoColor', () => {
  render(<PaintPanel />);
  fireEvent.click(screen.getByLabelText('Auto-color new parts'));
  expect(settingsSig.value.autoColor).toBe(true);
});
