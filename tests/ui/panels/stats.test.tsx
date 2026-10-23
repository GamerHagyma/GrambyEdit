// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/preact';
import { StatsPanel } from '../../../src/ui/panels/StatsPanel';
import { loadDoc, resetStoreForTests } from '../../../src/state/store';
import { selectionSig } from '../../../src/state/selection';
import { docOf, part, sock } from '../../helpers/doc';

beforeEach(resetStoreForTests);

test('rows sorted by count with two-decimal percentages; clicking selects the type', () => {
  loadDoc(
    docOf(
      part(1, 'Connector'),
      part(2, 'Part', [sock('1', 1, '1')]),
      part(3, 'Part', [sock('1', 1, '2')]),
    ),
  );
  render(<StatsPanel />);
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows[0].textContent).toContain('Part');
  expect(rows[0].textContent).toContain('66.67');
  fireEvent.click(rows[0]);
  expect([...selectionSig.value.parts].sort()).toEqual([2, 3]);
});
