// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/preact';
import { favouritesSig, recentsSig } from '../../../src/state/favourites';
import { arm, disarm, placeSig } from '../../../src/state/place';
import { selectionSig } from '../../../src/state/selection';
import {
  baseCatalogSig,
  docSig,
  historySig,
  loadDoc,
  resetStoreForTests,
} from '../../../src/state/store';
import { registerTool, toolSig } from '../../../src/tools/manager';
import { PartBrowser } from '../../../src/ui/panels/PartBrowser';
import { PartPicker } from '../../../src/ui/widgets/PartPicker';
import { MINI } from '../../helpers/catalog';
import { docOf, part } from '../../helpers/doc';

beforeEach(() => {
  resetStoreForTests();
  localStorage.clear();
  favouritesSig.value = [];
  recentsSig.value = [];
  disarm();
  toolSig.value = 'select';
  registerTool({ id: 'select', activate() {}, deactivate() {} });
  registerTool({ id: 'place', activate() {}, deactivate() {} });
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
  loadDoc(docOf(part(7, 'Part')));
  const onArm = vi.fn();
  render(<PartBrowser onArm={onArm} />);
  fireEvent.click(screen.getByText('Connector'));
  expect(onArm).toHaveBeenCalledWith({ kind: 'part', type: 'Connector' });
  expect(recentsSig.value).toEqual(['Connector']);
});

test('arming in an empty workspace keeps Recent stable until double-click completes', () => {
  baseCatalogSig.value = MINI;
  render(<PartBrowser onArm={arm} />);
  const button = screen.getByText('Part', { exact: true }).closest('button')!;
  fireEvent.click(button, { detail: 1 });
  expect(placeSig.value).toEqual({ kind: 'part', type: 'Part' });
  // A new Recent card here moves the category card away from the pointer between clicks.
  expect(recentsSig.value).toEqual([]);
  expect(screen.getAllByText('Part', { exact: true })).toHaveLength(1);
  fireEvent.click(button, { detail: 2 });
  fireEvent.dblClick(button);
  expect(docSig.value.parts.get(1)?.type).toBe('Part');
  expect(recentsSig.value).toEqual(['Part']);
});
test('the card tooltip gives the socket count', () => {
  baseCatalogSig.value = MINI;
  render(<PartBrowser onArm={() => {}} />);
  // Part and Base also have six sockets, so scope the check to the Connector card.
  expect(screen.getByText('Connector').closest('.part-card')?.getAttribute('title')).toBe(
    '6 sockets',
  );
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

test.each(['Structure', '★ Favourites', 'Recent'])(
  'double-clicking a part in %s creates exactly one part and clears the two clicks placement',
  (section) => {
    baseCatalogSig.value = MINI;
    favouritesSig.value = ['Part'];
    recentsSig.value = ['Part'];
    render(<PartBrowser onArm={arm} />);
    const group = screen.getByRole('heading', { name: section }).closest('section')!;
    const button = group.querySelector<HTMLButtonElement>('.part-card-arm')!;
    const type = button.querySelector('.part-card-name')!.textContent;
    fireEvent.click(button, { detail: 1 });
    expect(docSig.value.parts.size).toBe(0);
    expect(toolSig.value).toBe('place');
    fireEvent.click(button, { detail: 2 });
    fireEvent.dblClick(button);
    expect(docSig.value.parts.size).toBe(1);
    expect(docSig.value.parts.get(1)?.type).toBe(type);
    expect([...selectionSig.value.parts]).toEqual([1]);
    expect(historySig.value.past).toHaveLength(1);
    expect(placeSig.value).toBeNull();
    expect(toolSig.value).toBe('select');
    expect(recentsSig.value[0]).toBe(type);
  },
);

test('double-clicking a part in a nonempty workspace keeps normal armed placement', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(7, 'Part')));
  render(<PartBrowser onArm={arm} />);
  const button = screen.getByText('Connector').closest('button')!;
  fireEvent.click(button, { detail: 1 });
  fireEvent.click(button, { detail: 2 });
  fireEvent.dblClick(button);
  expect(docSig.value.order).toEqual([7]);
  expect(historySig.value.past).toHaveLength(0);
  expect(placeSig.value).toEqual({ kind: 'part', type: 'Connector' });
  expect(toolSig.value).toBe('place');
});

test('double-clicking the favourite star or a creation never inserts a first part', () => {
  baseCatalogSig.value = MINI;
  render(<PartBrowser onArm={arm} creations={[{ id: 'saved', name: 'Saved build' }]} />);
  fireEvent.dblClick(screen.getByLabelText('Favourite Connector'));
  const creation = screen.getByText('Saved build').closest('button')!;
  fireEvent.click(creation, { detail: 1 });
  fireEvent.click(creation, { detail: 2 });
  fireEvent.dblClick(creation);
  expect(docSig.value.parts.size).toBe(0);
  expect(placeSig.value).toEqual({ kind: 'creation', id: 'saved' });
});
