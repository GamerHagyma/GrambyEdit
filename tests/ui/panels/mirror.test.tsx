// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/preact';
import { MirrorPanel } from '../../../src/ui/panels/MirrorPanel';
import { symmetrySig, clearSymmetry } from '../../../src/state/symmetry';
import { baseCatalogSig, loadDoc, resetStoreForTests, docSig } from '../../../src/state/store';
import { select } from '../../../src/state/selection';
import { MINI } from '../../helpers/catalog';
import { docOf, part } from '../../helpers/doc';
beforeEach(() => {
  resetStoreForTests();
  clearSymmetry();
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Connector'), part(2, 'Part')));
});
test('anchor, plane and radial settings change locally without changing the build', () => {
  render(<MirrorPanel />);
  select([1], 'replace');
  fireEvent.click(screen.getByRole('button', { name: 'Use selected Part / Connector' }));
  expect(symmetrySig.value.anchor).toBe(1);
  const before = docSig.value;
  fireEvent.change(screen.getByLabelText('Symmetry mode'), { target: { value: 'radial' } });
  expect(screen.getByLabelText('Total sectors')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Repeat new placements'));
  expect(symmetrySig.value.auto).toBe(true);
  expect(docSig.value).toBe(before);
  fireEvent.click(screen.getByRole('button', { name: 'Clear mirror' }));
  expect(symmetrySig.value.anchor).toBeNull();
});
