// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import { ReferencePanel, ReferenceWindow } from '../../../src/ui/panels/ReferencePanel';
import {
  addReferenceUrl,
  clearReferences,
  activeReferenceSig,
  referenceFloatingSig,
} from '../../../src/state/references';
import { docSig, historySig, resetStoreForTests } from '../../../src/state/store';

beforeEach(() => {
  clearReferences();
  resetStoreForTests();
});
afterEach(clearReferences);

test('URL references display, survive pop-out/dock, and never edit the blueprint', () => {
  const doc = docSig.value,
    history = historySig.value;
  render(
    <>
      <ReferencePanel />
      <ReferenceWindow />
    </>,
  );
  fireEvent.input(screen.getByLabelText('Image URL'), {
    target: { value: 'https://example.com/front.png' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add image', exact: true }));
  expect(screen.getByRole('img', { name: 'Reference: front.png' }).getAttribute('src')).toBe(
    'https://example.com/front.png',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pop out reference' }));
  expect(screen.getByRole('region', { name: 'Reference window' })).toBeTruthy();
  expect(referenceFloatingSig.value).toBe(true);
  expect(document.activeElement?.closest('.reference-window')).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Reference window' })).getByRole('button', {
      name: 'Dock reference',
    }),
  );
  expect(screen.queryByRole('region', { name: 'Reference window' })).toBeNull();
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Reference images');
  expect(activeReferenceSig.value?.src).toBe('https://example.com/front.png');
  expect(docSig.value).toBe(doc);
  expect(historySig.value).toBe(history);
});

test('the paste area accepts an image link and keeps pasted text out of the blueprint handler', () => {
  render(<ReferencePanel />);
  const outside = vi.fn();
  document.addEventListener('paste', outside);
  try {
    fireEvent.paste(screen.getByRole('region', { name: 'Reference images' }), {
      clipboardData: { files: [], getData: () => 'https://example.com/side.jpg' },
    });
    expect(activeReferenceSig.value?.name).toBe('side.jpg');
    expect(outside).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener('paste', outside);
  }
});

test('a failed image shows a useful error and can be replaced', async () => {
  addReferenceUrl('https://example.com/missing.png');
  render(<ReferencePanel />);
  fireEvent.error(screen.getByRole('img', { name: 'Reference: missing.png' }));
  expect(screen.getByRole('alert').textContent).toContain('Could not load');
  await act(() => {
    addReferenceUrl('https://example.com/working.jpg');
  });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('img', { name: 'Reference: working.jpg' })).toBeTruthy();
});

test('reference keyboard controls do not reach editor shortcuts', () => {
  render(<ReferencePanel />);
  const key = vi.fn();
  window.addEventListener('keydown', key);
  try {
    fireEvent.keyDown(screen.getByRole('region', { name: 'Reference images' }), {
      key: 'Delete',
      bubbles: true,
    });
    expect(key).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('keydown', key);
  }
});

test('the floating window can be moved and resized with the keyboard and stays on-screen', () => {
  referenceFloatingSig.value = true;
  render(<ReferenceWindow />);
  const panel = screen.getByRole('region', { name: 'Reference window' });
  const before = parseFloat(panel.style.left);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Move reference window' }), {
    key: 'ArrowRight',
  });
  expect(parseFloat(panel.style.left)).toBeGreaterThan(before);
  const width = parseFloat(panel.style.width);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Resize reference window' }), {
    key: 'ArrowRight',
  });
  expect(parseFloat(panel.style.width)).toBeGreaterThan(width);
  for (let i = 0; i < 200; i++)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move reference window' }), {
      key: 'ArrowLeft',
      shiftKey: true,
    });
  expect(parseFloat(panel.style.left)).toBeGreaterThanOrEqual(0);
});
