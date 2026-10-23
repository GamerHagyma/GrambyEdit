// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/preact';
import { ExportDialog } from '../../../src/ui/dialogs/ExportDialog';
import { ImportDialog } from '../../../src/ui/dialogs/ImportDialog';
import {
  baseCatalogSig,
  commit,
  docSig,
  loadDoc,
  resetStoreForTests,
} from '../../../src/state/store';
import { chainDoc, docOf, mount, part } from '../../helpers/doc';
import { MINI } from '../../helpers/catalog';
import { APPENDIX_A_CODE } from '../../fixtures/spec-codes';

beforeEach(resetStoreForTests);

test('export dialog shows only a preview of huge codes', () => {
  loadDoc(chainDoc(16_000));
  const { container } = render(<ExportDialog open onClose={() => {}} />);
  expect(container.textContent!.length).toBeLessThan(2_000);
});
test('errors block export until confirmed', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Light', [mount('1', 2, '{x}')]), part(2, 'Part')));
  render(<ExportDialog open onClose={() => {}} />);
  expect(screen.getByText('Export anyway')).toBeTruthy();
  expect(screen.getByText(/E-UUID/)).toBeTruthy();
});
test('import asks before replacing a build that has history', () => {
  loadDoc(chainDoc(2));
  commit('add', (d) => {
    const id = d.allocId();
    d.add({ id, type: 'Part', conns: [], props: {}, points: null });
  });
  render(<ImportDialog open onClose={() => {}} />);
  fireEvent.input(screen.getByRole('textbox'), { target: { value: APPENDIX_A_CODE } });
  fireEvent.click(screen.getByText('Open (replace)'));
  expect(screen.getByText('Replace the current build? Unsaved changes are lost.')).toBeTruthy();
  expect(docSig.value.order).toHaveLength(3);
  fireEvent.click(screen.getByText('Replace'));
  expect(docSig.value.order).toHaveLength(12);
});
test('import opens directly when the build has no history', () => {
  loadDoc(chainDoc(2));
  render(<ImportDialog open onClose={() => {}} />);
  fireEvent.input(screen.getByRole('textbox'), { target: { value: APPENDIX_A_CODE } });
  fireEvent.click(screen.getByText('Open (replace)'));
  expect(screen.queryByText('Replace the current build? Unsaved changes are lost.')).toBeNull();
  expect(docSig.value.order).toHaveLength(12);
});
