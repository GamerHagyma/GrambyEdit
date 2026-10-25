// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/preact';
import { addPart } from '../../src/core/ops/parts';
import { App } from '../../src/ui/App';
import { CREDITS } from '../../src/ui/credits';
import { loadPref, savePref } from '../../src/storage/prefs';
import { inspectorTabSig, showInspectorTab, showLeftTab } from '../../src/state/ui';
import {
  addReferenceUrl,
  clearReferences,
  referenceFloatingSig,
  referencesSig,
} from '../../src/state/references';
import { hiddenSig, select, selectionSig } from '../../src/state/selection';
import { genHostPickSig } from '../../src/state/generators';
import { surfaceSig } from '../../src/state/surfaces';
import { openCreationIdSig } from '../../src/state/library';
import { disarm, placeSig } from '../../src/state/place';
import {
  baseCatalogSig,
  commit,
  docSig,
  historySig,
  resetStoreForTests,
} from '../../src/state/store';
import { MINI } from '../helpers/catalog';

// jsdom has no canvas; the Generators tab's shape picture needs one.
vi.mock('../../src/viewport/shape-preview', () => ({
  START_VIEW: { yaw: 0, pitch: 0 },
  loadShapePreview: vi.fn(),
  drawShapePreview: vi.fn(),
}));

beforeEach(() => {
  resetStoreForTests();
  baseCatalogSig.value = MINI;
  // The first-run dialog is modal and would keep every key.
  savePref('firstRunDone', true);
});

test('File New requires confirmation and resets the workspace without erasing references or preferences', () => {
  clearReferences();
  render(<App />);
  commit('Add Part', (d) => {
    addPart(d, 'Part', {});
  });
  select([1], 'replace');
  hiddenSig.value = new Set([1]);
  genHostPickSig.value = { part: 1, type: 'Part' };
  surfaceSig.value = { ...surfaceSig.value, host: { part: 1, type: 'Part' } };
  openCreationIdSig.value = 'existing-creation';
  placeSig.value = { kind: 'part', type: 'Part' };
  addReferenceUrl('https://example.com/reference.png');
  const doc = docSig.value,
    history = historySig.value;
  fireEvent.click(screen.getByRole('button', { name: 'File', exact: true }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'New', exact: true }));
  expect(screen.getByRole('dialog', { name: 'New blueprint' }).textContent).toContain(
    'Are you sure',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(docSig.value).toBe(doc);
  expect(historySig.value).toBe(history);
  fireEvent.click(screen.getByRole('button', { name: 'File', exact: true }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'New', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'New blueprint', exact: true }));
  expect(docSig.value.order).toEqual([]);
  expect(docSig.value.nextId).toBe(1);
  expect(historySig.value.past).toEqual([]);
  expect(historySig.value.future).toEqual([]);
  expect(selectionSig.value.parts.size).toBe(0);
  expect(hiddenSig.value.size).toBe(0);
  expect(genHostPickSig.value).toBeNull();
  expect(surfaceSig.value.host).toBeNull();
  expect(placeSig.value).toBeNull();
  expect(openCreationIdSig.value).toBeNull();
  expect(referencesSig.value).toHaveLength(1);
  expect(loadPref('firstRunDone', false)).toBe(true);
  clearReferences();
});

test('shell shows the product name and the Mumble Games credit', () => {
  render(<App />);
  expect(screen.getByText('GrambyEdit')).toBeTruthy();
  expect(screen.getByText(CREDITS)).toBeTruthy();
  expect(CREDITS).toBe(
    "Road to Gramby's and all part meshes © Mumble Games. Mesh exports: JuanCrakYT/RtG-Format and jirrob/GrambysWorkshop (MIT).",
  );
});

/** Dispatches Ctrl+Z on `target`; it bubbles to the window listener as a real key press does. */
function ctrlZ(target: HTMLElement): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key: 'z',
    code: 'KeyZ',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(e);
  return e;
}

test('Ctrl+Z in a field under data-app-undo undoes the last edit', () => {
  render(<App />);
  commit('Add Part', (d) => {
    addPart(d, 'Part', {});
  });
  const panel = document.createElement('div');
  panel.setAttribute('data-app-undo', '');
  const input = document.createElement('input');
  panel.append(input);
  document.body.append(panel);
  const e = ctrlZ(input);
  expect(docSig.value.order).toEqual([]);
  expect(e.defaultPrevented).toBe(true);
  panel.remove();
});

test('Ctrl+Z in a field outside data-app-undo leaves the history alone', () => {
  render(<App />);
  commit('Add Part', (d) => {
    addPart(d, 'Part', {});
  });
  const input = document.createElement('input');
  document.body.append(input);
  const e = ctrlZ(input);
  expect(historySig.value.past).toHaveLength(1);
  expect(e.defaultPrevented).toBe(false);
  input.remove();
});

test('the left dock switches between Parts and Generators and remembers the choice', () => {
  showLeftTab('parts');
  render(<App />);
  expect(screen.queryByText('Generate')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Generators' }));
  expect(screen.getByText('Generate')).toBeTruthy();
  expect(loadPref('leftTab', 'parts')).toBe('generators');
  fireEvent.click(screen.getByRole('tab', { name: 'Parts' }));
  expect(screen.queryByText('Generate')).toBeNull();
});

test.each(['image', 'url'])(
  'pasting an %s over the editor opens Reference without changing the build',
  (kind) => {
    clearReferences();
    showInspectorTab('properties');
    URL.createObjectURL = vi.fn(() => 'blob:pasted-reference');
    URL.revokeObjectURL = vi.fn();
    render(<App />);
    commit('Add Part', (d) => {
      addPart(d, 'Part', {});
    });
    const doc = docSig.value,
      history = historySig.value;
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files:
          kind === 'image' ? [new File(['image'], 'clipboard.png', { type: 'image/png' })] : [],
        getData: () => (kind === 'url' ? 'https://example.com/truck.png' : ''),
      },
    });
    document.body.dispatchEvent(event);
    expect(referencesSig.value).toHaveLength(1);
    expect(inspectorTabSig.value).toBe('reference');
    expect(docSig.value).toBe(doc);
    expect(historySig.value).toBe(history);
    expect(event.defaultPrevented).toBe(true);
    clearReferences();
  },
);

test('placeholder and floating header controls cannot delete, copy, or paste blueprint parts', () => {
  clearReferences();
  disarm();
  showInspectorTab('reference');
  referenceFloatingSig.value = true;
  const { container } = render(<App />);
  commit('Add Part', (d) => {
    addPart(d, 'Part', {});
  });
  select(docSig.value.order, 'replace');
  const doc = docSig.value,
    history = historySig.value;
  const placeholder = container.querySelector<HTMLButtonElement>(
    '.reference-docked-placeholder button',
  )!;
  placeholder.focus();
  fireEvent.keyDown(placeholder, { key: 'Delete', code: 'Delete', bubbles: true });
  expect(docSig.value).toBe(doc);
  expect(historySig.value).toBe(history);
  const copy = vi.fn();
  fireEvent.copy(placeholder, { clipboardData: { setData: copy } });
  expect(copy).not.toHaveBeenCalled();
  fireEvent.paste(screen.getByRole('button', { name: 'Move reference window' }), {
    clipboardData: { files: [], getData: () => '[["Part",[],[]]]' },
  });
  expect(placeSig.value).toBeNull();
  clearReferences();
});

test('Escape releases a sustained servo and lets Rest return to zero', async () => {
  const { activateServo, advanceServoSimulation, cancelServoSimulation } =
    await import('../../src/state/servo-simulation');
  const { servoPreviewSig } = await import('../../src/state/servo-preview');
  inspectorTabSig.value = 'properties';
  render(<App />);
  commit('Add Servo', (d) => {
    addPart(d, 'Servo', { Rest: true });
  });
  select([1], 'replace');
  activateServo(1, 1, true);
  advanceServoSimulation(0.2);
  fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
  expect(servoPreviewSig.value?.direction).toBe(0);
  advanceServoSimulation(0.2);
  expect(servoPreviewSig.value).toBeNull();
  expect(docSig.value.parts.get(1)!.props.Rotation ?? 0).toBe(0);
  cancelServoSimulation();
});
