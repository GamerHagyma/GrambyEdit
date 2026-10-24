// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { WorkbenchPanel } from '../../../src/ui/panels/WorkbenchPanel';
import { baseCatalogSig, catalogSig, resetStoreForTests } from '../../../src/state/store';
import {
  captureSocket,
  wbGizmoModeSig,
  wbMateSig,
  wbSocketSig,
  wbTypeSig,
} from '../../../src/state/workbench';
import { MINI } from '../../helpers/catalog';

beforeEach(() => {
  resetStoreForTests();
  baseCatalogSig.value = MINI;
});
beforeEach(() => {
  wbTypeSig.value = null;
  wbSocketSig.value = null;
  wbMateSig.value = false;
});

test('parts listed by usage with progress', () => {
  render(<WorkbenchPanel />);
  const first = screen.getAllByRole('option')[0];
  expect(first.textContent).toContain('Connector');
  expect(first.textContent).toContain('0/6');
});

test('choosing Splitter_2 shows six sockets and the red-stick legend', () => {
  render(<WorkbenchPanel />);
  fireEvent.click(screen.getByText('Splitter_2'));
  expect(
    screen.getAllByRole('row').filter((r) => /approx|captured/.test(r.textContent!)),
  ).toHaveLength(6);
  expect(screen.getByText('red stick')).toBeTruthy();
});

test('copy button copies a probe code', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<WorkbenchPanel />);
  fireEvent.click(screen.getByText('Splitter_2'));
  fireEvent.click(screen.getAllByText('Copy code')[0]);
  expect(writeText.mock.calls[0][0]).toMatch(/^[A-Za-z0-9+/]+=*$/);
  expect(await screen.findByText('Copied')).toBeTruthy();
});

test('Clear forgets a capture and the socket reads approx again', async () => {
  await captureSocket('Splitter_2', '4', [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  render(<WorkbenchPanel />);
  fireEvent.click(screen.getByText('Splitter_2'));
  expect(screen.getAllByText('captured')).toHaveLength(1);
  fireEvent.click(screen.getByText('Clear'));
  await waitFor(() => expect(screen.queryByText('Clear')).toBeNull());
  expect(screen.getAllByText('approx')).toHaveLength(6);
});

test('a socket row selects it, and Test mate sets its flag', () => {
  render(<WorkbenchPanel />);
  fireEvent.click(screen.getByText('Splitter_2'));
  fireEvent.click(screen.getAllByRole('row')[1]);
  expect(wbSocketSig.value).toBe('3');
  fireEvent.click(screen.getByLabelText('Test mate'));
  expect(wbMateSig.value).toBe(true);
});

test('Export file downloads socket_geometry.json', async () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:socket-file');
  Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  render(<WorkbenchPanel />);
  fireEvent.click(screen.getByText('Export file'));
  expect(names).toEqual(['socket_geometry.json']);
  const blob = createObjectURL.mock.calls[0][0];
  expect(JSON.parse(await blob.text()).format).toBe('grambyedit-sockets');
  vi.restoreAllMocks();
});

test('Import file shows the error text of a rejected file', async () => {
  render(<WorkbenchPanel />);
  const file = new File(['not json'], 'socket_geometry.json', { type: 'application/json' });
  fireEvent.change(screen.getByLabelText('Socket file'), { target: { files: [file] } });
  expect((await screen.findByRole('alert')).textContent).toBe('not valid JSON');
});

test('the selected socket shows its facing; Turn and Position save a new frame', async () => {
  await captureSocket('Part', '2', [0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0]);
  wbTypeSig.value = 'Part';
  wbSocketSig.value = '2';
  render(<WorkbenchPanel />);
  const frame = () => catalogSig.value!.parts.Part.sockets['2'].frame;
  expect(screen.getByText('faces +X')).toBeTruthy();
  // A quarter turn about its own X tips it from +X to +Y, in place.
  fireEvent.click(screen.getByRole('button', { name: 'X' }));
  await waitFor(() => expect(frame()).toEqual([0.5, 0, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0]));
  expect(screen.getByText('faces +Y')).toBeTruthy();
  // Shift turns back.
  fireEvent.click(screen.getByRole('button', { name: 'X' }), { shiftKey: true });
  await waitFor(() => expect(frame()).toEqual([0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0]));
  const y = screen.getByLabelText('Position Y');
  fireEvent.input(y, { target: { value: '0.25' } });
  fireEvent.blur(y);
  await waitFor(() => expect(frame()).toEqual([0.5, 0.25, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0]));
  expect(catalogSig.value!.parts.Part.sockets['2'].frameSource).toBe('captured');
});

test('the gizmo buttons switch between moving and turning the socket', () => {
  wbTypeSig.value = 'Part';
  wbSocketSig.value = '2';
  wbGizmoModeSig.value = 'translate';
  render(<WorkbenchPanel />);
  fireEvent.click(screen.getByText('Rotate (R)'));
  expect(wbGizmoModeSig.value).toBe('rotate');
  expect(screen.getByText('Rotate (R)').getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByText('Move (G)'));
  expect(wbGizmoModeSig.value).toBe('translate');
});
