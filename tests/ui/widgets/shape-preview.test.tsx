// @vitest-environment jsdom
vi.mock('../../../src/viewport/shape-preview', () => ({
  START_VIEW: { yaw: 0.5, pitch: 0.4 },
  loadShapePreview: vi.fn(() => true),
  drawShapePreview: vi.fn(),
}));

import { act, fireEvent, render, screen } from '@testing-library/preact';
import { drawShapePreview, loadShapePreview } from '../../../src/viewport/shape-preview';
import { ShapePreview } from '../../../src/ui/widgets/ShapePreview';
import { docOf, part } from '../../helpers/doc';

/** The frames requested so far; `step` runs the next one `ms` after the last. */
let frames: FrameRequestCallback[] = [];
let now = 0;
const step = (ms: number) => {
  now += ms;
  const due = frames;
  frames = [];
  for (const f of due) f(now);
};
const lastView = () => vi.mocked(drawShapePreview).mock.calls.at(-1)![1];

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  frames = [];
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
  vi.stubGlobal('cancelAnimationFrame', () => (frames = []));
  vi.mocked(drawShapePreview).mockClear();
  vi.mocked(loadShapePreview).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('the shape loads once it stops changing, then turns about the vertical', () => {
  render(<ShapePreview sub={docOf(part(1, 'Part'))} />);
  act(() => void vi.advanceTimersByTime(200));
  expect(loadShapePreview).toHaveBeenCalledTimes(1);
  act(() => step(0));
  const first = lastView();
  act(() => step(1000));
  const later = lastView();
  expect(later.yaw).toBeGreaterThan(first.yaw);
  expect(later.pitch).toBe(first.pitch);
});

test('Spin stops and restarts the turning, and is remembered', () => {
  const { unmount } = render(<ShapePreview sub={docOf(part(1, 'Part'))} />);
  act(() => void vi.advanceTimersByTime(200));
  const spin = screen.getByRole('checkbox', { name: 'Spin' }) as HTMLInputElement;
  expect(spin.checked).toBe(true);
  fireEvent.click(spin);
  act(() => step(16));
  const stopped = lastView();
  act(() => step(1000));
  expect(lastView()).toEqual(stopped);
  unmount();
  render(<ShapePreview sub={docOf(part(1, 'Part'))} />);
  expect((screen.getByRole('checkbox', { name: 'Spin' }) as HTMLInputElement).checked).toBe(false);
});

test('dragging the picture turns it with the cursor, and tilts it short of the poles', () => {
  render(<ShapePreview sub={docOf(part(1, 'Part'))} />);
  act(() => void vi.advanceTimersByTime(200));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Spin' }));
  const canvas = screen.getByRole('img', { name: 'Shape preview' });
  canvas.setPointerCapture = () => {};
  const before = lastView() ?? { yaw: 0.5, pitch: 0.4 };
  fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  // Left and up: the near side follows the cursor, so the camera swings right and dips.
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 60, clientY: 80 });
  const turned = lastView();
  expect(turned.yaw).toBeGreaterThan(before.yaw);
  expect(turned.pitch).toBeLessThan(before.pitch);
  const pole = (80 * Math.PI) / 180;
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 60, clientY: -3000 });
  expect(lastView().pitch).toBeCloseTo(-pole, 9);
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 60, clientY: 3000 });
  expect(lastView().pitch).toBeCloseTo(pole, 9);
  fireEvent.pointerUp(canvas, { pointerId: 1 });
});
