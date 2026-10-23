// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/preact';
import { IssuesPanel } from '../../../src/ui/panels/IssuesPanel';
import { baseCatalogSig, loadDoc, resetStoreForTests } from '../../../src/state/store';
import { selectionSig } from '../../../src/state/selection';
import { docOf, part } from '../../helpers/doc';
import { MINI } from '../../helpers/catalog';

beforeEach(resetStoreForTests);

test('issues grouped by severity select their parts on click', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Mystery')));
  render(<IssuesPanel />);
  fireEvent.click(screen.getByText(/Mystery/));
  expect([...selectionSig.value.parts]).toEqual([1]);
});
