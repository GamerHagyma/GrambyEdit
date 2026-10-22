// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/preact';
import { Tabs } from '../../src/ui/layout/Tabs';
import { Dialog } from '../../src/ui/layout/Dialog';
import { toast, toastsSig } from '../../src/state/toasts';

vi.mock('../../src/viewport/index', () => ({ mountViewport: () => () => {} }));

test('tabs switch', () => {
  const on = vi.fn();
  render(
    <Tabs
      tabs={[
        { id: 'a', label: 'Properties' },
        { id: 'b', label: 'Outliner' },
      ]}
      active="a"
      onChange={on}
    />,
  );
  fireEvent.click(screen.getByText('Outliner'));
  expect(on).toHaveBeenCalledWith('b');
});
test('dialog closes on Escape', () => {
  const close = vi.fn();
  render(
    <Dialog title="Export" open onClose={close}>
      <button>Copy</button>
    </Dialog>,
  );
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(close).toHaveBeenCalled();
});
test('toasts auto-dismiss after 4 s', () => {
  vi.useFakeTimers();
  toast('Saved');
  expect(toastsSig.value).toHaveLength(1);
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  expect(toastsSig.value).toHaveLength(0);
  vi.useRealTimers();
});
test('the dialog focuses its content and gives focus back on close', () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const { rerender } = render(
    <Dialog title="Export" open onClose={() => {}}>
      <button>Copy</button>
    </Dialog>,
  );
  expect(document.activeElement?.textContent).toBe('Copy');
  rerender(
    <Dialog title="Export" open={false} onClose={() => {}}>
      <button>Copy</button>
    </Dialog>,
  );
  expect(document.activeElement).toBe(opener);
});
