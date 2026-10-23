// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/preact';
import { favouritesSig, recentsSig } from '../../../src/state/favourites';
import { baseCatalogSig, resetStoreForTests } from '../../../src/state/store';
import { PartBrowser } from '../../../src/ui/panels/PartBrowser';
import { PartPicker } from '../../../src/ui/widgets/PartPicker';
import { MINI } from '../../helpers/catalog';

beforeEach(() => {
  resetStoreForTests();
  localStorage.clear();
  favouritesSig.value = [];
  recentsSig.value = [];
});

test('sections in order and search filters', () => {
  baseCatalogSig.value = MINI;
  render(<PartBrowser onArm={() => {}} />);
  const heads = screen.getAllByRole('heading').map((h) => h.textContent);
  expect(heads.slice(0, 2)).toEqual(['★ Favourites', 'Recent']);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'gate' } });
  expect(screen.queryByText('Connector')).toBeNull();
  expect(screen.getByText('Gate-AND')).toBeTruthy();
});
test('picker lists only eligible types and Enter picks the first', () => {
  baseCatalogSig.value = MINI;
  const onPick = vi.fn();
  render(
    <PartPicker
      eligible={(t) => t !== 'Chassis'}
      onPick={onPick}
      onClose={() => {}}
      anchor={{ x: 0, y: 0 }}
    />,
  );
  expect(screen.queryByText('Chassis')).toBeNull();
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'conn' } });
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
  expect(onPick).toHaveBeenCalledWith({ kind: 'part', type: 'Connector' });
});
test('the star files a part under favourites', () => {
  baseCatalogSig.value = MINI;
  render(<PartBrowser onArm={() => {}} />);
  fireEvent.click(screen.getByLabelText('Favourite Gate-AND'));
  expect(favouritesSig.value).toEqual(['Gate-AND']);
  expect(screen.getAllByText('Gate-AND')).toHaveLength(2);
});
test('clicking a card arms it and makes it recent', () => {
  baseCatalogSig.value = MINI;
  const onArm = vi.fn();
  render(<PartBrowser onArm={onArm} />);
  fireEvent.click(screen.getByText('Connector'));
  expect(onArm).toHaveBeenCalledWith({ kind: 'part', type: 'Connector' });
  expect(recentsSig.value).toEqual(['Connector']);
});
test('the card tooltip gives the socket count and corpus usage', () => {
  baseCatalogSig.value = MINI;
  render(<PartBrowser onArm={() => {}} />);
  expect(screen.getByTitle('6 sockets · used 11,484× in 185 real builds')).toBeTruthy();
});
test('arrow keys move the highlight, Enter picks it, and Escape closes the picker', () => {
  baseCatalogSig.value = MINI;
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(
    <PartPicker
      eligible={() => true}
      onPick={onPick}
      onClose={onClose}
      anchor={{ x: 10, y: 20 }}
    />,
  );
  const box = screen.getByRole('searchbox');
  expect(document.activeElement).toBe(box);
  fireEvent.keyDown(box, { key: 'ArrowDown' });
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(onPick).toHaveBeenCalledWith({ kind: 'part', type: 'Base' });
  fireEvent.keyDown(box, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});
test('dropping a favourite card on another reorders the favourites', () => {
  baseCatalogSig.value = MINI;
  favouritesSig.value = ['Part', 'Connector'];
  render(<PartBrowser onArm={() => {}} />);
  const favCards = document.querySelectorAll('.part-section')[0].querySelectorAll('.part-card');
  fireEvent.drop(favCards[0], { dataTransfer: { getData: () => 'Connector' } });
  expect(favouritesSig.value).toEqual(['Connector', 'Part']);
});
