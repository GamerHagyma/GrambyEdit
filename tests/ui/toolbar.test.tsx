// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/preact';
import { addPart } from '../../src/core/ops/parts';
import { commit, docSig, resetStoreForTests } from '../../src/state/store';
import { Toolbar } from '../../src/ui/layout/Toolbar';

beforeEach(() => {
  resetStoreForTests();
});

test('Undo and Redo are disabled while there is no history', () => {
  render(<Toolbar />);
  expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(true);
});

test('the titles name the keys that run them', () => {
  render(<Toolbar />);
  expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('title')).toBe('Undo (Ctrl+Z)');
  expect(screen.getByRole('button', { name: 'Redo' }).getAttribute('title')).toBe(
    'Redo (Ctrl+Shift+Z, Ctrl+Y)',
  );
});

test('Undo removes an added part and Redo brings it back', () => {
  render(<Toolbar />);
  const undo = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
  const redo = screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement;

  act(() => {
    commit('Add Part', (d) => {
      addPart(d, 'Part', {});
    });
  });
  expect(undo.disabled).toBe(false);
  expect(redo.disabled).toBe(true);

  fireEvent.click(undo);
  expect(docSig.value.order).toEqual([]);
  expect(undo.disabled).toBe(true);
  expect(redo.disabled).toBe(false);

  fireEvent.click(redo);
  expect(docSig.value.order).toHaveLength(1);
  expect(redo.disabled).toBe(true);
  expect(undo.disabled).toBe(false);
});
