// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/preact';
import { Outliner } from '../../../src/ui/panels/Outliner';
import { loadDoc, resetStoreForTests } from '../../../src/state/store';
import { chainDoc } from '../../helpers/doc';

beforeEach(resetStoreForTests);

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
