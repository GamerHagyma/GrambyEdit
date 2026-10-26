// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import { ReferencePanel, ReferenceWindow } from '../../../src/ui/panels/ReferencePanel';
import {
  addReferenceUrl,
  clearReferences,
  activeReferenceSig,
  referenceFloatingSig,
  referencePlanesSig,
  updateReferencePlane,
} from '../../../src/state/references';
import { docSig, historySig, resetStoreForTests } from '../../../src/state/store';

beforeEach(() => {
  clearReferences();
  resetStoreForTests();
});
afterEach(clearReferences);

test('Ctrl width and height commits preserve current plane proportions; releasing Ctrl allows independent sizing', () => {
  addReferenceUrl('https://example.com/front.png');
  render(<ReferencePanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Insert image plane' }));
  const id = activeReferenceSig.peek()!.id;
  act(() => updateReferencePlane(id, { width: 12, height: 6 }));
  const width = screen.getByLabelText('Plane width (studs)');
  fireEvent.keyDown(width, { key: 'Control', ctrlKey: true });
  fireEvent.input(width, { target: { value: '20' } });
  fireEvent.blur(width);
  expect(referencePlanesSig.peek().get(id)).toMatchObject({ width: 20, height: 10 });
  const height = screen.getByLabelText('Plane height (studs)');
  fireEvent.keyDown(height, { key: 'Control', ctrlKey: true });
  fireEvent.input(height, { target: { value: '4' } });
  fireEvent.blur(height);
  expect(referencePlanesSig.peek().get(id)).toMatchObject({ width: 8, height: 4 });
  fireEvent.keyUp(height, { key: 'Control', ctrlKey: false });
  fireEvent.input(height, { target: { value: '3' } });
  fireEvent.blur(height);
  expect(referencePlanesSig.peek().get(id)).toMatchObject({ width: 8, height: 3 });
});

test('reference plane controls edit local dimensions and angles and remove the plane alone', () => {
  addReferenceUrl('https://example.com/front.png');
  const before = docSig.peek();
  render(<ReferencePanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Insert image plane' }));
  const field = screen.getByLabelText('Plane position X');
  fireEvent.input(field, { target: { value: '3' } });
  fireEvent.blur(field);
  const width = screen.getByLabelText('Plane width (studs)');
  fireEvent.input(width, { target: { value: '12' } });
  fireEvent.blur(width);
  expect(referencePlanesSig.value.get(activeReferenceSig.value!.id)).toMatchObject({
    position: [3, 0, 0],
    width: 12,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Remove plane' }));
  expect(referencePlanesSig.value.size).toBe(0);
  expect(activeReferenceSig.value).not.toBeNull();
  expect(docSig.peek()).toBe(before);
});

test('URL references display, survive pop-out/dock, and never edit the blueprint', () => {
  const doc = docSig.value,
    history = historySig.value;
  render(
    <>
      <ReferencePanel />
      <ReferenceWindow />
    </>,
  );
  fireEvent.input(screen.getByLabelText('Image URL'), {
    target: { value: 'https://example.com/front.png' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add image', exact: true }));
  expect(screen.getByRole('img', { name: 'Reference: front.png' }).getAttribute('src')).toBe(
    'https://example.com/front.png',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pop out reference' }));
  expect(screen.getByRole('region', { name: 'Reference window' })).toBeTruthy();
  expect(referenceFloatingSig.value).toBe(true);
  expect(document.activeElement?.closest('.reference-window')).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Reference window' })).getByRole('button', {
      name: 'Dock reference',
    }),
  );
  expect(screen.queryByRole('region', { name: 'Reference window' })).toBeNull();
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Reference images');
  expect(activeReferenceSig.value?.src).toBe('https://example.com/front.png');
  expect(docSig.value).toBe(doc);
  expect(historySig.value).toBe(history);
});

test('the paste area accepts an image link and keeps pasted text out of the blueprint handler', () => {
  render(<ReferencePanel />);
  const outside = vi.fn();
  document.addEventListener('paste', outside);
  try {
    fireEvent.paste(screen.getByRole('region', { name: 'Reference images' }), {
      clipboardData: { files: [], getData: () => 'https://example.com/side.jpg' },
    });
    expect(activeReferenceSig.value?.name).toBe('side.jpg');
    expect(outside).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener('paste', outside);
  }
});

test('a failed image shows a useful error and can be replaced', async () => {
  addReferenceUrl('https://example.com/missing.png');
  render(<ReferencePanel />);
  fireEvent.error(screen.getByRole('img', { name: 'Reference: missing.png' }));
  expect(screen.getByRole('alert').textContent).toContain('Could not load');
  await act(() => {
    addReferenceUrl('https://example.com/working.jpg');
  });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('img', { name: 'Reference: working.jpg' })).toBeTruthy();
});

test('reference keyboard controls do not reach editor shortcuts', () => {
  render(<ReferencePanel />);
  const key = vi.fn();
  window.addEventListener('keydown', key);
  try {
    fireEvent.keyDown(screen.getByRole('region', { name: 'Reference images' }), {
      key: 'Delete',
      bubbles: true,
    });
    expect(key).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('keydown', key);
  }
});

test('the floating window can be moved and resized with the keyboard and stays on-screen', () => {
  referenceFloatingSig.value = true;
  render(<ReferenceWindow />);
  const panel = screen.getByRole('region', { name: 'Reference window' });
  const before = parseFloat(panel.style.left);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Move reference window' }), {
    key: 'ArrowRight',
  });
  expect(parseFloat(panel.style.left)).toBeGreaterThan(before);
  const width = parseFloat(panel.style.width);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Resize reference window bottom right' }), {
    key: 'ArrowRight',
  });
  expect(parseFloat(panel.style.width)).toBeGreaterThan(width);
  for (let i = 0; i < 200; i++)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move reference window' }), {
      key: 'ArrowLeft',
      shiftKey: true,
    });
  expect(parseFloat(panel.style.left)).toBeGreaterThanOrEqual(0);
});

function pointer(target: HTMLElement, type: string, x: number, y: number, id = 1): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: id });
  target.setPointerCapture = vi.fn();
  target.releasePointerCapture = vi.fn();
  fireEvent(target, event);
}

test('reference image zooms, pans within the image, and Fit resets without editing the build', () => {
  addReferenceUrl('https://example.com/front.png');
  const doc = docSig.value,
    history = historySig.value;
  render(<ReferencePanel />);
  const image = screen.getByRole('img', { name: 'Reference: front.png' }) as HTMLImageElement;
  const area = screen.getByRole('group', { name: 'Reference image navigation' });
  area.getBoundingClientRect = () => ({ width: 300, height: 200 }) as DOMRect;
  Object.defineProperties(image, { naturalWidth: { value: 600 }, naturalHeight: { value: 400 } });
  fireEvent.load(image);
  expect(screen.getByRole('button', { name: 'Zoom out reference' }).hasAttribute('disabled')).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in reference' }));
  expect(image.style.transform).toContain('scale(1.25)');
  pointer(area, 'pointerdown', 100, 100);
  pointer(area, 'pointermove', 120, 110);
  expect(image.style.transform).toContain('translate(20px, 10px)');
  pointer(area, 'pointermove', 10000, 10000);
  expect(image.style.transform).toContain('translate(37.5px, 25px)');
  pointer(area, 'pointercancel', 10000, 10000);
  const stopped = image.style.transform;
  pointer(area, 'pointermove', 0, 0);
  expect(image.style.transform).toBe(stopped);
  fireEvent.click(screen.getByRole('button', { name: 'Fit reference image' }));
  expect(image.style.transform).toBe('translate(0px, 0px) scale(1)');
  fireEvent.wheel(area, { deltaY: -100000 });
  expect(image.style.transform).toContain('scale(8)');
  fireEvent.wheel(area, { deltaY: 100000 });
  expect(image.style.transform).toBe('translate(0px, 0px) scale(1)');
  expect(docSig.value).toBe(doc);
  expect(historySig.value).toBe(history);
});

test('collapse hides image management and thumbnails while navigation and expand stay reachable', () => {
  addReferenceUrl('https://example.com/front.png');
  render(<ReferencePanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Collapse reference controls' }));
  expect(screen.queryByLabelText('Image URL')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Choose image…' })).toBeNull();
  expect(screen.queryByText(/References stay outside/)).toBeNull();
  expect(screen.queryByLabelText('Choose a reference')).toBeNull();
  expect(screen.getByRole('img', { name: 'Reference: front.png' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Zoom in reference' })).toBeTruthy();
  const expand = screen.getByRole('button', { name: 'Expand reference controls' });
  expect(expand.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(expand);
  expect(screen.getByLabelText('Image URL')).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: 'Collapse reference controls' })
      .getAttribute('aria-expanded'),
  ).toBe('true');
});

test('zoom, pan and collapsed controls survive popping out and docking', () => {
  addReferenceUrl('https://example.com/front.png');
  render(
    <>
      <ReferencePanel />
      <ReferenceWindow />
    </>,
  );
  const image = screen.getByRole('img', { name: 'Reference: front.png' }) as HTMLImageElement;
  const area = screen.getByRole('group', { name: 'Reference image navigation' });
  area.getBoundingClientRect = () => ({ width: 300, height: 200 }) as DOMRect;
  Object.defineProperties(image, { naturalWidth: { value: 600 }, naturalHeight: { value: 400 } });
  fireEvent.load(image);
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in reference' }));
  pointer(area, 'pointerdown', 100, 100);
  pointer(area, 'pointermove', 110, 110);
  pointer(area, 'pointerup', 110, 110);
  fireEvent.click(screen.getByRole('button', { name: 'Collapse reference controls' }));
  const transform = image.style.transform;
  fireEvent.click(screen.getByRole('button', { name: 'Pop out reference' }));
  expect(screen.getByRole('img', { name: 'Reference: front.png' }).style.transform).toBe(transform);
  expect(screen.getByRole('button', { name: 'Expand reference controls' })).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Reference window' })).getByRole('button', {
      name: 'Dock reference',
    }),
  );
  expect(screen.getByRole('img', { name: 'Reference: front.png' }).style.transform).toBe(transform);
  expect(screen.getByRole('button', { name: 'Expand reference controls' })).toBeTruthy();
});

test.each(['top left', 'top right', 'bottom left', 'bottom right'])(
  '%s corner resizes with the opposite corner fixed, viewport bounds, and pointer cancellation',
  (corner) => {
    referenceFloatingSig.value = true;
    render(<ReferenceWindow />);
    const panel = screen.getByRole('region', { name: 'Reference window' });
    const handle = screen.getByRole('button', { name: `Resize reference window ${corner}` });
    const rect = () => ({
      x: parseFloat(panel.style.left),
      y: parseFloat(panel.style.top),
      width: parseFloat(panel.style.width),
      height: parseFloat(panel.style.height),
    });
    const before = rect();
    const left = corner.includes('left'),
      top = corner.includes('top');
    pointer(handle, 'pointerdown', 100, 100);
    pointer(handle, 'pointermove', left ? 80 : 120, top ? 80 : 120);
    const after = rect();
    expect(after.width).toBe(before.width + 20);
    expect(after.height).toBe(before.height + 20);
    expect(left ? after.x + after.width : after.x).toBe(left ? before.x + before.width : before.x);
    expect(top ? after.y + after.height : after.y).toBe(top ? before.y + before.height : before.y);
    pointer(handle, 'pointermove', left ? -10000 : 10000, top ? -10000 : 10000);
    const bounded = rect();
    expect(bounded.x).toBeGreaterThanOrEqual(8);
    expect(bounded.y).toBeGreaterThanOrEqual(8);
    expect(bounded.x + bounded.width).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(bounded.y + bounded.height).toBeLessThanOrEqual(window.innerHeight - 8);
    expect(left ? bounded.x + bounded.width : bounded.x).toBe(
      left ? before.x + before.width : before.x,
    );
    expect(top ? bounded.y + bounded.height : bounded.y).toBe(
      top ? before.y + before.height : before.y,
    );
    pointer(handle, 'pointermove', left ? 10000 : -10000, top ? 10000 : -10000);
    const minimum = rect();
    expect(minimum.width).toBe(240);
    expect(minimum.height).toBe(240);
    expect(left ? minimum.x + minimum.width : minimum.x).toBe(
      left ? before.x + before.width : before.x,
    );
    expect(top ? minimum.y + minimum.height : minimum.y).toBe(
      top ? before.y + before.height : before.y,
    );
    pointer(handle, 'pointercancel', 100, 100);
    pointer(handle, 'pointermove', 100, 100);
    expect(rect()).toEqual(minimum);
  },
);
