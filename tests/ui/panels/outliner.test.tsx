// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/preact';
import { Outliner } from '../../../src/ui/panels/Outliner';
import { ContextMenu } from '../../../src/ui/widgets/ContextMenu';
import { hiddenSig, selectionSig } from '../../../src/state/selection';
import { contextMenuSig } from '../../../src/state/ui';
import { loadDoc, resetStoreForTests } from '../../../src/state/store';
import { chainDoc, docOf, part, sock } from '../../helpers/doc';

beforeEach(() => {
  resetStoreForTests();
  contextMenuSig.value = null;
});

function OutlinerWithMenu() {
  const menu = contextMenuSig.value;
  return (
    <>
      <Outliner />
      {menu && (
        <ContextMenu
          {...menu}
          onClose={() => {
            contextMenuSig.value = null;
          }}
        />
      )}
    </>
  );
}

const selectedIds = () => [...selectionSig.value.parts];

test('Show all and Hide all affect the whole workspace despite a search filter', () => {
  loadDoc(chainDoc(3));
  render(<Outliner />);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: '#2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Hide all', exact: true }));
  expect([...hiddenSig.value]).toEqual([1, 2, 3]);
  fireEvent.click(screen.getByRole('button', { name: 'Show all', exact: true }));
  expect(hiddenSig.value.size).toBe(0);
});

test('virtualises 16,000 rows', () => {
  loadDoc(chainDoc(16_000));
  const { container } = render(<Outliner />);
  expect(container.querySelectorAll('[role="treeitem"]').length).toBeLessThanOrEqual(60);
});
test('search by #index', async () => {
  loadDoc(chainDoc(30));
  render(<Outliner />);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: '#17' } });
  expect(screen.getAllByRole('treeitem')).toHaveLength(1);
});

test('Shift selects a forward or reverse range from the original anchor', () => {
  loadDoc(chainDoc(6));
  render(<Outliner />);
  const rows = screen.getAllByRole('treeitem');
  fireEvent.click(rows[2]);
  fireEvent.click(rows[5], { shiftKey: true });
  expect(selectedIds()).toEqual([3, 4, 5, 6]);
  fireEvent.click(rows[0], { shiftKey: true });
  expect(selectedIds()).toEqual([1, 2, 3]);
});

test('Ctrl toggles rows and Ctrl+Shift adds a range', () => {
  loadDoc(chainDoc(6));
  render(<Outliner />);
  const rows = screen.getAllByRole('treeitem');
  fireEvent.click(rows[0]);
  fireEvent.click(rows[3], { ctrlKey: true });
  expect(selectedIds()).toEqual([1, 4]);
  fireEvent.click(rows[5], { ctrlKey: true, shiftKey: true });
  expect(selectedIds()).toEqual([1, 4, 5, 6]);
  fireEvent.click(rows[3], { ctrlKey: true });
  expect(selectedIds()).toEqual([1, 5, 6]);
});

test('a range follows grouped row order and skips group headings', () => {
  loadDoc(docOf(part(1, 'Part'), part(2, 'Connector'), part(3, 'Part'), part(4, 'Connector')));
  render(<Outliner />);
  fireEvent.click(screen.getByRole('button', { name: 'Group by type' }));
  const rows = screen.getAllByRole('treeitem');
  fireEvent.click(rows[1]); // Connector #4; groups are ordered by type for equal counts.
  fireEvent.click(rows[3], { shiftKey: true }); // Part #3.
  expect(selectedIds()).toEqual([4, 1, 3]);
});

test('a range skips collapsed children', () => {
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')]), part(3, 'Part')));
  render(<Outliner />);
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Part #1' }));
  const rows = screen.getAllByRole('treeitem');
  fireEvent.click(rows[0]);
  fireEvent.click(rows[1], { shiftKey: true });
  expect(selectedIds()).toEqual([1, 3]);
});

test('a filtered range includes only matches and tolerates a missing anchor', () => {
  loadDoc(
    docOf(
      part(1, 'Connector'),
      part(2, 'Part'),
      part(3, 'Connector'),
      part(4, 'Part'),
      part(5, 'Part'),
    ),
  );
  render(<Outliner />);
  fireEvent.click(screen.getAllByRole('treeitem')[0]);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'Part' } });
  let rows = screen.getAllByRole('treeitem');
  fireEvent.click(rows[0], { shiftKey: true });
  expect(selectedIds()).toEqual([2]);
  rows = screen.getAllByRole('treeitem');
  fireEvent.click(rows[2], { shiftKey: true });
  expect(selectedIds()).toEqual([2, 4, 5]);
});

test('right-click hides and restores the selected rows without losing the selection', () => {
  loadDoc(chainDoc(4));
  hiddenSig.value = new Set([4]);
  render(<OutlinerWithMenu />);
  const rows = screen.getAllByRole('treeitem');
  fireEvent.click(rows[0]);
  fireEvent.click(rows[1], { shiftKey: true });
  fireEvent.contextMenu(rows[0], { clientX: 30, clientY: 40 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Hide selected', exact: true }));
  expect([...hiddenSig.value]).toEqual([4, 1, 2]);
  expect(selectedIds()).toEqual([1, 2]);
  fireEvent.contextMenu(rows[1], { clientX: 30, clientY: 40 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Show selected', exact: true }));
  expect([...hiddenSig.value]).toEqual([4]);
  expect(selectedIds()).toEqual([1, 2]);
});

test('right-click on an unselected row acts on that row alone', () => {
  loadDoc(chainDoc(4));
  render(<OutlinerWithMenu />);
  const rows = screen.getAllByRole('treeitem');
  fireEvent.click(rows[0]);
  fireEvent.click(rows[1], { shiftKey: true });
  fireEvent.contextMenu(rows[3]);
  expect(selectedIds()).toEqual([4]);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Hide selected', exact: true }));
  expect([...hiddenSig.value]).toEqual([4]);
});

test('a range includes rows between virtualized windows', () => {
  loadDoc(chainDoc(100));
  const { container } = render(<Outliner />);
  fireEvent.click(screen.getAllByRole('treeitem')[1]);
  fireEvent.scroll(container.querySelector('.virtual-list')!, { target: { scrollTop: 75 * 24 } });
  const row = screen.getAllByRole('treeitem').find((e) => e.textContent === 'Part#80')!;
  fireEvent.click(row, { shiftKey: true });
  expect(selectedIds()).toEqual(Array.from({ length: 79 }, (_, i) => i + 2));
});
