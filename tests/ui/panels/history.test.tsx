// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/preact';
import { HistoryPanel } from '../../../src/ui/panels/HistoryPanel';
import { commit, docSig, loadDoc, redo, resetStoreForTests, undo } from '../../../src/state/store';
import { chainDoc } from '../../helpers/doc';

beforeEach(resetStoreForTests);

/** Three edits on part 1: a, b, c. OrientationY is 1, 2, 3 after each. */
function editThree(): void {
  loadDoc(chainDoc(1));
  commit('a', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 1 } }));
  commit('b', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 2 } }));
  commit('c', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 3 } }));
}

test('history click jumps back two steps', () => {
  loadDoc(chainDoc(1));
  commit('a', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 1 } }));
  commit('b', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 2 } }));
  commit('c', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 3 } }));
  render(<HistoryPanel />);
  fireEvent.click(screen.getByText('a'));
  expect(docSig.value.parts.get(1)!.props).toEqual({ OrientationY: 1 });
});

test('rows read Opened, the past oldest first, then the greyed future', () => {
  editThree();
  undo();
  undo();
  render(<HistoryPanel />);
  const rows = screen.getAllByRole('button');
  expect(rows.map((r) => r.textContent)).toEqual(['Opened', 'a', 'b', 'c']);
  expect(rows.map((r) => r.getAttribute('aria-current'))).toEqual([null, 'step', null, null]);
  expect(rows.map((r) => r.classList.contains('future'))).toEqual([false, false, true, true]);
});

test('an empty history shows only Opened, as the current row', () => {
  loadDoc(chainDoc(1));
  render(<HistoryPanel />);
  const rows = screen.getAllByRole('button');
  expect(rows.map((r) => r.textContent)).toEqual(['Opened']);
  expect(rows[0].getAttribute('aria-current')).toBe('step');
});

test('clicking a greyed row redoes up to it', () => {
  editThree();
  undo();
  undo();
  render(<HistoryPanel />);
  fireEvent.click(screen.getByText('c'));
  expect(docSig.value.parts.get(1)!.props).toEqual({ OrientationY: 3 });
  expect(screen.getAllByRole('button').map((r) => r.getAttribute('aria-current'))).toEqual([
    null,
    null,
    null,
    'step',
  ]);
});

test('clicking Opened undoes every edit', () => {
  editThree();
  render(<HistoryPanel />);
  fireEvent.click(screen.getByText('Opened'));
  expect(docSig.value.parts.get(1)!.props).toEqual({});
  redo();
  expect(docSig.value.parts.get(1)!.props).toEqual({ OrientationY: 1 });
});

test('a shared history cannot jump backward through other participants edits', async () => {
  const { historyAvailabilitySig } = await import('../../../src/state/store');
  editThree();
  historyAvailabilitySig.value = { undo: true, redo: false };
  render(<HistoryPanel />);
  expect(screen.getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
});
