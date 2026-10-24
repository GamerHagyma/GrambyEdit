// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/preact';
import { genRequestSig, resetGeneratorsForTests } from '../../../src/state/generators';
import { placeSig } from '../../../src/state/place';
import { baseCatalogSig, loadDoc, resetStoreForTests } from '../../../src/state/store';
import { GeneratorsPanel } from '../../../src/ui/panels/GeneratorsPanel';
import { MINI } from '../../helpers/catalog';
import { chainDoc } from '../../helpers/doc';

beforeEach(() => {
  resetStoreForTests();
  localStorage.clear();
  resetGeneratorsForTests();
  placeSig.value = null;
});

test('form follows the chosen shape and Generate arms place mode', () => {
  baseCatalogSig.value = MINI;
  render(<GeneratorsPanel />);
  fireEvent.click(screen.getByText('Torus'));
  expect(screen.getByLabelText('Major')).toBeTruthy();
  fireEvent.click(screen.getByText('Generate'));
  expect(placeSig.value?.kind).toBe('generated');
});

test('Generate arms the Place tool with the sub-doc the cost line describes', () => {
  baseCatalogSig.value = MINI;
  render(<GeneratorsPanel />);
  // The default ring: radius 5 at spacing 1 gives 31 elements, plus the host.
  expect(screen.getByText(/^\+32 parts/)).toBeTruthy();
  fireEvent.click(screen.getByText('Generate'));
  const src = placeSig.value;
  if (src?.kind !== 'generated') throw new Error('Generate did not arm the Place tool');
  expect(src.sub.order.length).toBe(32);
});

test('a build that cannot be made shows its error and disables Generate', () => {
  baseCatalogSig.value = MINI;
  render(<GeneratorsPanel />);
  fireEvent.input(screen.getByLabelText('Spacing'), { target: { value: '0' } });
  expect(screen.getByRole('alert').textContent).toMatch(/no elements/);
  expect((screen.getByText('Generate') as HTMLButtonElement).disabled).toBe(true);
});

test('the cost line warns when the build crosses a threshold', () => {
  baseCatalogSig.value = MINI;
  loadDoc(chainDoc(7_995));
  render(<GeneratorsPanel />);
  expect(screen.getByText(/parts 7,995 → 8,027/)).toBeTruthy();
  expect(screen.getByText('Crosses part soft cap')).toBeTruthy();
});

test('every shape is offered and each shows its own parameters', () => {
  baseCatalogSig.value = MINI;
  render(<GeneratorsPanel />);
  for (const label of [
    'Line',
    'Grid',
    'Box',
    'Ring',
    'Cylinder',
    'Sphere',
    'Cone',
    'Torus',
    'Arc',
    'Helix',
    'Stairs',
    'Text',
  ]) {
    expect(screen.getByText(label)).toBeTruthy();
  }
  fireEvent.click(screen.getByText('Box'));
  expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('6');
  fireEvent.click(screen.getByText('Text'));
  expect((screen.getByLabelText('Text') as HTMLInputElement).value).toBe('GRAMBY');
  fireEvent.input(screen.getByLabelText('Text'), { target: { value: 'HI' } });
  expect(genRequestSig.value.input.params).toEqual({ text: 'HI' });
});

test('a number parameter writes its value into the request', () => {
  baseCatalogSig.value = MINI;
  render(<GeneratorsPanel />);
  fireEvent.input(screen.getByLabelText('Radius'), { target: { value: '7' } });
  expect(genRequestSig.value.input.params).toEqual({ radius: 7 });
});

test('fill offers only the shape fills and orientation sets the orient', () => {
  baseCatalogSig.value = MINI;
  render(<GeneratorsPanel />);
  const fill = screen.getByLabelText('Fill') as HTMLSelectElement;
  expect([...fill.options].map((o) => o.value)).toEqual(['outline', 'solid']);
  fireEvent.change(fill, { target: { value: 'solid' } });
  expect(genRequestSig.value.input.fill).toBe('solid');
  fireEvent.change(screen.getByLabelText('Orientation'), { target: { value: 'outward' } });
  expect(genRequestSig.value.input.orient).toBe('outward');
});

test('the element and host pickers choose parts', () => {
  baseCatalogSig.value = MINI;
  render(<GeneratorsPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Part' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByText('Base'));
  expect(genRequestSig.value.element).toBe('Base');
  fireEvent.click(screen.getByRole('button', { name: 'Connector' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByText('Chassis'));
  expect(genRequestSig.value.host).toBe('Chassis');
});

test('a press outside the picker closes it', () => {
  baseCatalogSig.value = MINI;
  render(<GeneratorsPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Part' }));
  expect(screen.queryByRole('dialog')).not.toBeNull();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('the element picker offers only parts that can be mounted on a point', () => {
  baseCatalogSig.value = MINI;
  render(<GeneratorsPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Part' }));
  expect(within(screen.getByRole('dialog')).queryByText('Chassis')).toBeNull();
});

test('colour modes: single sets the colour, gradient and random add their controls', () => {
  baseCatalogSig.value = MINI;
  render(<GeneratorsPanel />);
  fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#ff0000' } });
  expect(genRequestSig.value.color).toEqual({ mode: 'single', rgb: [255, 0, 0] });
  fireEvent.change(screen.getByLabelText('Color mode'), { target: { value: 'gradient' } });
  expect(screen.getByLabelText('From')).toBeTruthy();
  expect(screen.getByLabelText('To')).toBeTruthy();
  expect(screen.getByLabelText('Axis')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Color mode'), { target: { value: 'random' } });
  expect(screen.getByLabelText('Palette color 1')).toBeTruthy();
  fireEvent.click(screen.getByText('Add color'));
  expect(screen.getByLabelText('Palette color 3')).toBeTruthy();
  expect(screen.getByLabelText('Seed')).toBeTruthy();
});

test('Save stores a preset and the preset list loads it', () => {
  baseCatalogSig.value = MINI;
  render(<GeneratorsPanel />);
  fireEvent.input(screen.getByLabelText('Preset name'), { target: { value: 'Ring A' } });
  fireEvent.click(screen.getByText('Save'));
  expect(Object.keys(JSON.parse(localStorage.getItem('grambyedit:genPresets')!))).toEqual([
    'Ring A',
  ]);
  fireEvent.click(screen.getByText('Box'));
  fireEvent.change(screen.getByLabelText('Load preset'), { target: { value: 'Ring A' } });
  expect(genRequestSig.value.shape).toBe('ring');
});

test('without the part library the panel says so and offers no Generate', () => {
  render(<GeneratorsPanel />);
  expect(screen.getByText(/still loading/)).toBeTruthy();
  expect(screen.queryByText('Generate')).toBeNull();
});
