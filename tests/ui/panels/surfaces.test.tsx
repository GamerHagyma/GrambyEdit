// @vitest-environment jsdom
vi.mock('../../../src/viewport/shape-preview', () => ({
  START_VIEW: { yaw: 0, pitch: 0 },
  loadShapePreview: vi.fn(),
  drawShapePreview: vi.fn(),
}));

import { act, fireEvent, render, screen } from '@testing-library/preact';
import { Vector3 } from 'three';
import type { Catalog } from '../../../src/core/catalog-types';
import { baseCatalogSig, docSig, loadDoc, resetStoreForTests } from '../../../src/state/store';
import { resetSurfacesForTests, setCorner, surfaceSig } from '../../../src/state/surfaces';
import { pickSig } from '../../../src/tools/pick';
import { SurfacePanel } from '../../../src/ui/panels/SurfacePanel';
import { MINI } from '../../helpers/catalog';
import { docOf, part } from '../../helpers/doc';
import { realCatalog } from '../../helpers/real-catalog';

let cat: Catalog;
beforeAll(async () => {
  cat = await realCatalog();
});
beforeEach(() => {
  resetStoreForTests();
  localStorage.clear();
  resetSurfacesForTests();
  pickSig.value = null;
});

/** Picks the top face of Part 1 at its centre, as a click in the build does. */
function pickTop(): void {
  act(() => {
    pickSig.value!.onPick({
      part: 1,
      body: 0,
      point: new Vector3(0, 0.5, 0),
      normal: new Vector3(0, 1, 0),
      subPart: 'Part',
      distance: 1,
    });
  });
}

/** The panel with a Part in the build and its top face picked as the parent. */
function renderPicked(): void {
  baseCatalogSig.value = cat;
  loadDoc(docOf(part(1, 'Part')));
  render(<SurfacePanel />);
  fireEvent.click(screen.getByText('Pick parent'));
  pickTop();
}

test('without GasCaps it says so', () => {
  baseCatalogSig.value = MINI;
  render(<SurfacePanel />);
  expect(screen.getByText('This part library has no GasCap.')).toBeTruthy();
});

test('Pick parent starts a pick and the corners appear', () => {
  baseCatalogSig.value = cat;
  loadDoc(docOf(part(1, 'Part')));
  render(<SurfacePanel />);
  fireEvent.click(screen.getByText('Pick parent'));
  expect(pickSig.value?.prompt).toMatch(/face the surface starts on/);
  pickTop();
  expect(screen.getByText('#1 Part')).toBeTruthy();
  expect(screen.getByLabelText('Corner 1 X')).toBeTruthy();
  expect(screen.getByText('4 GasCaps in 2 rows')).toBeTruthy();
});

test('corner fields edit the corners', () => {
  renderPicked();
  fireEvent.input(screen.getByLabelText('Corner 2 X'), { target: { value: '2' } });
  expect(surfaceSig.value.corners[1][0]).toBe(2);
  fireEvent.focus(screen.getByLabelText('Corner 3 Y'));
  expect(surfaceSig.value.selected).toEqual([2]);
});

test('Create adds the caps and says so', () => {
  renderPicked();
  fireEvent.click(screen.getByText('Create'));
  expect(docSig.value.order.length).toBe(5);
  expect(screen.getByText(/Created 4 GasCaps/)).toBeTruthy();
  expect((screen.getByText('Create') as HTMLButtonElement).disabled).toBe(true);
});

test('crossed corners disable Create', () => {
  renderPicked();
  const { corners } = surfaceSig.value;
  act(() => {
    setCorner(1, corners[2]);
    setCorner(2, corners[1]);
  });
  expect(screen.getByRole('alert').textContent).toMatch(/cross over/);
  expect((screen.getByText('Create') as HTMLButtonElement).disabled).toBe(true);
});

test('gradient colours run along the corners', () => {
  renderPicked();
  fireEvent.change(screen.getByLabelText('Color mode'), { target: { value: 'gradient' } });
  const axis = screen.getByLabelText('Axis') as HTMLSelectElement;
  expect([...axis.options].map((o) => o.textContent)).toEqual(['Corner 1 → 2', 'Corner 1 → 4']);
  fireEvent.change(axis, { target: { value: 'v' } });
  expect(surfaceSig.value.color).toMatchObject({ mode: 'gradient', axis: 'v' });
});

test('the corner the gizmo moves stands out in the list', () => {
  renderPicked();
  fireEvent.click(screen.getByText('Corner 3'));
  expect(surfaceSig.value.selected).toEqual([2]);
  const button = screen.getByText('Corner 3');
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(button.parentElement!.classList.contains('active')).toBe(true);
  expect(screen.getByText('Corner 1').parentElement!.classList.contains('active')).toBe(false);
});

test('Shift+click on a corner adds it to the choice, and a plain click chooses it alone', () => {
  renderPicked();
  fireEvent.click(screen.getByText('Corner 1'));
  fireEvent.click(screen.getByText('Corner 3'), { shiftKey: true });
  expect(surfaceSig.value.selected).toEqual([0, 2]);
  for (const n of [1, 3]) {
    expect(screen.getByText('Corner ' + n).getAttribute('aria-pressed')).toBe('true');
  }
  // Typing into a chosen corner keeps the choice; another corner's field chooses that one.
  fireEvent.focus(screen.getByLabelText('Corner 1 X'));
  expect(surfaceSig.value.selected).toEqual([0, 2]);
  fireEvent.focus(screen.getByLabelText('Corner 2 X'));
  expect(surfaceSig.value.selected).toEqual([1]);
  fireEvent.click(screen.getByText('Corner 2'));
  expect(surfaceSig.value.selected).toEqual([]);
});
