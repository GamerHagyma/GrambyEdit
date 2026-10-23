// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/preact';
import { CommandPalette } from '../../../src/ui/dialogs/CommandPalette';
import { allCommands, registerCommand } from '../../../src/state/commands';
import { DEFAULT_SETTINGS, settingsSig } from '../../../src/state/settings';
import { baseCatalogSig, docSig, loadDoc, resetStoreForTests } from '../../../src/state/store';
import { MINI } from '../../helpers/catalog';
import { docOf, part } from '../../helpers/doc';

beforeEach(() => {
  resetStoreForTests();
  baseCatalogSig.value = MINI;
});

afterEach(() => {
  settingsSig.value = DEFAULT_SETTINGS;
});

/** The palette row whose label is `label`. */
const rowFor = (label: string): HTMLElement =>
  screen.getByText(label).closest('[role="option"]') as HTMLElement;

test('palette filters and runs', () => {
  const run = vi.fn();
  registerCommand({ id: 'test.hello', label: 'Say hello', run });
  render(<CommandPalette open onClose={() => {}} />);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'hello' } });
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
  expect(run).toHaveBeenCalled();
});

test('a closed palette renders nothing', () => {
  const { container } = render(<CommandPalette open={false} onClose={() => {}} />);
  expect(container.textContent).toBe('');
});

test('the search box has focus when the palette opens', () => {
  render(<CommandPalette open onClose={() => {}} />);
  expect(document.activeElement).toBe(screen.getByRole('searchbox'));
});

test('an empty query lists every command in registry order', () => {
  render(<CommandPalette open onClose={() => {}} />);
  const labels = screen
    .getAllByRole('option')
    .map((row) => row.querySelector('.palette-label')!.textContent);
  expect(labels).toEqual(allCommands().map((c) => c.label));
});

test('the best fuzzy match comes first', () => {
  render(<CommandPalette open onClose={() => {}} />);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'dup' } });
  const first = screen.getAllByRole('option')[0];
  expect(first.querySelector('.palette-label')!.textContent).toBe('Duplicate');
});

test('each row shows the first key of the blender scheme', () => {
  render(<CommandPalette open onClose={() => {}} />);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'duplicate' } });
  expect(screen.getByText('Shift+D')).toBeTruthy();
});

test('the keys follow the camera scheme', () => {
  settingsSig.value = { ...DEFAULT_SETTINGS, cameraScheme: 'studio' };
  render(<CommandPalette open onClose={() => {}} />);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'duplicate' } });
  expect(screen.getByText('Ctrl+D')).toBeTruthy();
});

test('a disabled command is greyed, and Enter on it neither runs it nor closes', () => {
  loadDoc(docOf(part(1, 'Part'))); // nothing selected, so Duplicate cannot run
  const close = vi.fn();
  render(<CommandPalette open onClose={close} />);
  const box = screen.getByRole('searchbox');
  fireEvent.input(box, { target: { value: 'duplicate' } });
  expect(rowFor('Duplicate').getAttribute('aria-disabled')).toBe('true');
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(close).not.toHaveBeenCalled();
  expect(docSig.value.order).toEqual([1]);
});

test('arrows move the highlight within the list, and Enter runs the highlighted row', () => {
  const one = vi.fn();
  const two = vi.fn();
  registerCommand({ id: 'test.nav.one', label: 'Probe nav one', run: one });
  registerCommand({ id: 'test.nav.two', label: 'Probe nav two', run: two });
  const close = vi.fn();
  render(<CommandPalette open onClose={close} />);
  const box = screen.getByRole('searchbox');
  fireEvent.input(box, { target: { value: 'probe nav' } });
  expect(rowFor('Probe nav one').getAttribute('aria-selected')).toBe('true');
  fireEvent.keyDown(box, { key: 'ArrowUp' }); // stops at the top
  expect(rowFor('Probe nav one').getAttribute('aria-selected')).toBe('true');
  fireEvent.keyDown(box, { key: 'ArrowDown' });
  expect(rowFor('Probe nav two').getAttribute('aria-selected')).toBe('true');
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(two).toHaveBeenCalledTimes(1);
  expect(one).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
});

test('a click runs the row and closes', () => {
  const run = vi.fn();
  const close = vi.fn();
  registerCommand({ id: 'test.click', label: 'Probe click', run });
  render(<CommandPalette open onClose={close} />);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'probe click' } });
  fireEvent.click(rowFor('Probe click'));
  expect(run).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

test('Enter with no matches does nothing', () => {
  const close = vi.fn();
  render(<CommandPalette open onClose={close} />);
  const box = screen.getByRole('searchbox');
  fireEvent.input(box, { target: { value: 'zqxjv' } });
  expect(screen.getByText('No matching commands')).toBeTruthy();
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(close).not.toHaveBeenCalled();
});

test('Escape closes the palette', () => {
  const close = vi.fn();
  render(<CommandPalette open onClose={close} />);
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
  expect(close).toHaveBeenCalledTimes(1);
});
