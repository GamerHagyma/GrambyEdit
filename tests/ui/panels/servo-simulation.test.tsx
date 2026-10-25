// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/preact';
import { Properties } from '../../../src/ui/panels/Properties';
import { advanceServoSimulation, cancelServoSimulation } from '../../../src/state/servo-simulation';
import { servoPreviewSig } from '../../../src/state/servo-preview';
import { baseCatalogSig, loadDoc, docSig, resetStoreForTests } from '../../../src/state/store';
import { select } from '../../../src/state/selection';
import { realCatalog } from '../../helpers/real-catalog';
import { docOf, part } from '../../helpers/doc';
import type { Catalog } from '../../../src/core/catalog-types';
let cat: Catalog;
beforeAll(async () => {
  cat = await realCatalog();
});
beforeEach(() => {
  resetStoreForTests();
  baseCatalogSig.value = cat;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => {
  cancelServoSimulation();
  vi.unstubAllGlobals();
});
test.each(['Servo', 'Servo_Physics'])(
  '%s has simulation controls and Rotation shows the unrounded live angle',
  (type) => {
    loadDoc(docOf(part(1, type, [], { Speed: 47.2, Rest: false })));
    select([1], 'replace');
    render(<Properties />);
    expect(screen.getByRole('group', { name: 'Simulate' })).toBeTruthy();
    const blue = screen.getByRole('button', { name: 'Blue — negative' });
    fireEvent.keyDown(blue, { key: ' ' });
    act(() => advanceServoSimulation(0.123));
    const angle = servoPreviewSig.value!.angle;
    expect(angle).toBeCloseTo(-47.2 * 0.123);
    expect((screen.getByLabelText('Rotation (°)') as HTMLInputElement).value).toBe(String(angle));
    expect(screen.getByLabelText('Speed (°/s)').matches(':disabled')).toBe(true);
    fireEvent.keyUp(blue, { key: ' ' });
    expect(docSig.value.parts.get(1)!.props.Rotation).toBe(angle);
    expect(screen.getByLabelText('Speed (°/s)').matches(':disabled')).toBe(false);
  },
);
test('Sustain makes activation buttons toggle, and changing it releases activation', () => {
  loadDoc(docOf(part(1, 'Servo', [], { Rest: false })));
  select([1], 'replace');
  render(<Properties />);
  fireEvent.click(screen.getByLabelText('Sustain'));
  const red = screen.getByRole('button', { name: 'Red — positive' });
  fireEvent.click(red);
  expect(red.getAttribute('aria-pressed')).toBe('true');
  expect(servoPreviewSig.value?.direction).toBe(1);
  act(() => advanceServoSimulation(0.2));
  fireEvent.click(red);
  expect(servoPreviewSig.value).toBeNull();
  fireEvent.click(red);
  fireEvent.click(screen.getByLabelText('Sustain'));
  expect(servoPreviewSig.value).toBeNull();
});
test('ordinary parts and multiple selections do not receive a single-servo simulation control', () => {
  loadDoc(docOf(part(1, 'Part'), part(2, 'Servo')));
  select([1, 2], 'replace');
  render(<Properties />);
  expect(screen.queryByRole('group', { name: 'Simulate' })).toBeNull();
});

test('Sustain keyboard activation ignores repeated Enter events', () => {
  loadDoc(docOf(part(1, 'Servo', [], { Rest: false })));
  select([1], 'replace');
  render(<Properties />);
  fireEvent.click(screen.getByLabelText('Sustain'));
  const blue = screen.getByRole('button', { name: 'Blue — negative' });
  fireEvent.keyDown(blue, { key: 'Enter' });
  act(() => advanceServoSimulation(0.1));
  fireEvent.keyDown(blue, { key: 'Enter', repeat: true });
  fireEvent.keyUp(blue, { key: 'Enter' });
  expect(servoPreviewSig.value?.direction).toBe(-1);
  fireEvent.keyDown(blue, { key: 'Enter' });
  fireEvent.keyUp(blue, { key: 'Enter' });
  expect(servoPreviewSig.value).toBeNull();
});

test.each(['Servo', 'Servo_Physics'])(
  '%s shows missing Rest and Limit enabled as unchecked',
  (type) => {
    loadDoc(docOf(part(1, type)));
    select([1], 'replace');
    render(<Properties />);
    expect((screen.getByLabelText('Rest') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Limit enabled') as HTMLInputElement).checked).toBe(false);
  },
);
