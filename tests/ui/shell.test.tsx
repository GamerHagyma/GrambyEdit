// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/preact';
import { Tabs } from '../../src/ui/layout/Tabs';
import { Dialog } from '../../src/ui/layout/Dialog';
import { toast, toastsSig } from '../../src/state/toasts';
import { Shell } from '../../src/ui/layout/Shell';
import { baseCatalogSig, loadDoc, resetStoreForTests } from '../../src/state/store';
import { clearSelection, select, selectPiece } from '../../src/state/selection';
import { statusHintSig } from '../../src/state/ui';
import { docOf, part } from '../helpers/doc';
import { realCatalog } from '../helpers/real-catalog';

vi.mock('../../src/viewport/index', () => ({ mountViewport: () => () => {} }));

test('multi-piece selections show usage in the bottom bar, with tool prompts taking precedence', async () => {
  resetStoreForTests();
  baseCatalogSig.value = await realCatalog();
  loadDoc(docOf(part(1, 'Part'), part(2, 'Wire'), part(3, 'Button')));
  statusHintSig.value = null;
  const { container } = render(<Shell />);
  const hint = () => container.querySelector('.status-hint')?.textContent ?? '';
  expect(hint()).toBe('');
  await act(() => selectPiece(2, 0, 'replace'));
  expect(hint()).toMatch(/Drag.*socket.*surface/);
  expect(hint()).toContain('Double-click');
  await act(() => {
    statusHintSig.value = 'Pick a host';
  });
  expect(hint()).toBe('Pick a host');
  await act(() => {
    statusHintSig.value = null;
    select([3], 'replace');
  });
  expect(hint()).toContain('G/R');
  await act(() => select([1], 'replace'));
  expect(hint()).toBe('');
  await act(() => {
    select([2], 'replace');
    clearSelection();
  });
  expect(hint()).toBe('');
});

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
