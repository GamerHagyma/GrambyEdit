// @vitest-environment jsdom
import type { Corners } from '../../src/core/surfaces/tiling';
import { select } from '../../src/state/selection';
import { updateSettings } from '../../src/state/settings';
import { resetSurfacesForTests, surfaceSig } from '../../src/state/surfaces';
import { registerTool, setTool } from '../../src/tools/manager';
import { createSurfaceTool } from '../../src/tools/surface';
import { baseCatalogSig, loadDoc, resetStoreForTests } from '../../src/state/store';
import { modalActiveSig, modalGuideSig, startModal } from '../../src/tools/modal';
import { setViewport } from '../../src/viewport/context';
import { MINI } from '../helpers/catalog';
import { docOf, part } from '../helpers/doc';
import { fakeViewport } from '../helpers/viewport';

const press = (code: string, key: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));

beforeEach(() => {
  resetStoreForTests();
  setViewport(fakeViewport());
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part')));
  select([1], 'replace');
});
afterEach(() => setViewport(null));

test('X shows the X axis through the pivot, then the local X axis, then nothing', () => {
  expect(startModal('move')).toBe(true);
  expect(modalActiveSig.value).toBe(true);
  expect(modalGuideSig.value).toBeNull();
  press('KeyX', 'x');
  expect(modalGuideSig.value?.axis).toBe('X');
  expect(modalGuideSig.value?.dir.toArray()).toEqual([1, 0, 0]);
  press('KeyX', 'x');
  expect(modalGuideSig.value?.axis).toBe('X');
  press('KeyX', 'x');
  expect(modalGuideSig.value).toBeNull();
  press('Escape', 'Escape');
});

test('ending the modal clears the guide and shows the gizmo again', () => {
  startModal('rotate');
  press('KeyZ', 'z');
  expect(modalGuideSig.value?.axis).toBe('Z');
  press('Escape', 'Escape');
  expect(modalGuideSig.value).toBeNull();
  expect(modalActiveSig.value).toBe(false);
});

describe('G on a surface corner', () => {
  // Corner 3 sits off the grid on every axis, on a Part at the origin.
  const CORNERS: Corners = [
    [-1, 0.5, 1],
    [1, 0.5, 1],
    [1.1, 0.57, -1.03],
    [-1, 0.5, -1],
  ];
  beforeAll(() => registerTool(createSurfaceTool()));
  beforeEach(() => {
    resetSurfacesForTests();
    select([], 'replace');
    surfaceSig.value = {
      ...surfaceSig.value,
      host: { part: 1, type: 'Part' },
      corners: CORNERS,
      home: CORNERS,
      selected: [2],
    };
    setTool('surface');
  });
  afterEach(() => {
    setTool('select');
    updateSettings({ snapToGrid: false });
  });

  /** Moves the mouse `dx` pixels right of where the modal started, with Ctrl held. */
  const drag = (dx: number) =>
    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 400 + dx, clientY: 300, ctrlKey: true }),
    );

  test('moves the active corner along X, by whole steps from where it was', () => {
    expect(startModal('move')).toBe(true);
    press('KeyX', 'x');
    drag(60);
    press('Enter', 'Enter');
    const [x, y, z] = surfaceSig.value.corners[2];
    expect(x).not.toBeCloseTo(1.1, 6);
    const steps = (x - 1.1) / 0.25;
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6);
    expect([y, z]).toEqual([0.57, -1.03]);
  });

  test('with World grid on, it lands on the grid on every axis instead', () => {
    updateSettings({ snapToGrid: true });
    expect(startModal('move')).toBe(true);
    press('KeyX', 'x');
    drag(60);
    press('Enter', 'Enter');
    const corner = surfaceSig.value.corners[2];
    expect(corner[0]).not.toBeCloseTo(1.1, 6);
    for (const c of corner) expect(Math.abs(c / 0.25 - Math.round(c / 0.25))).toBeLessThan(1e-6);
    expect(corner[1]).toBeCloseTo(0.5, 6);
    expect(corner[2]).toBeCloseTo(-1, 6);
  });

  test('Esc puts the corner back', () => {
    startModal('move');
    drag(60);
    press('Escape', 'Escape');
    expect(surfaceSig.value.corners[2]).toEqual([1.1, 0.57, -1.03]);
  });

  test('moves every chosen corner together', () => {
    surfaceSig.value = { ...surfaceSig.value, selected: [0, 1] };
    expect(startModal('move')).toBe(true);
    press('KeyY', 'y');
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 240 }));
    press('Enter', 'Enter');
    const [a, b] = surfaceSig.value.corners;
    expect(a[1]).toBeGreaterThan(0.5);
    expect(b[1]).toBeCloseTo(a[1], 9);
    expect([a[0], a[2], b[0], b[2]]).toEqual([-1, 1, 1, 1]);
  });
});
