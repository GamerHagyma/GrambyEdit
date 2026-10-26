// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/preact';
import {
  ContextMenu,
  partMenuItems,
  viewMenuItems,
  type MenuItem,
} from '../../../src/ui/widgets/ContextMenu';
import { allCommands, registerCommand } from '../../../src/state/commands';
import { select } from '../../../src/state/selection';
import { baseCatalogSig, loadDoc, resetStoreForTests } from '../../../src/state/store';
import { MINI } from '../../helpers/catalog';
import { docOf, part } from '../../helpers/doc';

beforeEach(() => {
  resetStoreForTests();
  baseCatalogSig.value = MINI;
});

const items: MenuItem[] = [
  { label: 'Alpha', command: 'test.ctx.alpha' },
  { label: 'Beta', command: 'test.ctx.beta', disabled: true },
  { label: 'Gamma', command: 'test.ctx.gamma' },
];

test('part and empty viewport menus expose Invert selection', () => {
  loadDoc(docOf(part(1, 'Part')));
  expect(partMenuItems().some((i) => i.command === 'select.invert')).toBe(true);
  expect(viewMenuItems().some((i) => i.command === 'select.invert')).toBe(true);
});

/** Registers the three commands of `items` with fresh spies. */
function registerItems() {
  const run = { alpha: vi.fn(), beta: vi.fn(), gamma: vi.fn() };
  registerCommand({ id: 'test.ctx.alpha', label: 'Alpha', run: run.alpha });
  registerCommand({ id: 'test.ctx.beta', label: 'Beta', run: run.beta });
  registerCommand({ id: 'test.ctx.gamma', label: 'Gamma', run: run.gamma });
  return run;
}

test('the menu sits at the pointer and lists its items as menu items', () => {
  render(<ContextMenu items={items} x={30} y={40} onClose={() => {}} />);
  const menu = screen.getByRole('menu');
  expect(menu.style.left).toBe('30px');
  expect(menu.style.top).toBe('40px');
  expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
    'Alpha',
    'Beta',
    'Gamma',
  ]);
  expect(screen.getByText('Beta').getAttribute('aria-disabled')).toBe('true');
});

test('the menu is pulled back inside the window', () => {
  const size = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ width: 200, height: 100 } as DOMRect);
  try {
    render(<ContextMenu items={items} x={5000} y={5000} onClose={() => {}} />);
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe(`${window.innerWidth - 200}px`);
    expect(menu.style.top).toBe(`${window.innerHeight - 100}px`);
  } finally {
    size.mockRestore();
  }
});

test('the first enabled item has focus; arrows skip disabled items; Enter runs and closes', () => {
  const run = registerItems();
  const close = vi.fn();
  render(<ContextMenu items={items} x={0} y={0} onClose={close} />);
  expect(document.activeElement).toBe(screen.getByText('Alpha'));
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
  expect(document.activeElement).toBe(screen.getByText('Gamma'));
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Enter' });
  expect(run.gamma).toHaveBeenCalledTimes(1);
  expect(run.beta).not.toHaveBeenCalled();
  expect(run.alpha).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
});

test('a click runs an enabled item and closes; a disabled item does nothing', () => {
  const run = registerItems();
  const close = vi.fn();
  render(<ContextMenu items={items} x={0} y={0} onClose={close} />);
  fireEvent.click(screen.getByText('Beta'));
  expect(run.beta).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Alpha'));
  expect(run.alpha).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

test('Escape closes the menu and does not reach the window', () => {
  const close = vi.fn();
  const onWindow = vi.fn();
  window.addEventListener('keydown', onWindow);
  try {
    render(<ContextMenu items={items} x={0} y={0} onClose={close} />);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
    expect(onWindow).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('keydown', onWindow);
  }
});

test('a press outside closes the menu; a press inside does not', () => {
  const close = vi.fn();
  render(<ContextMenu items={items} x={0} y={0} onClose={close} />);
  fireEvent.mouseDown(screen.getByText('Alpha'));
  expect(close).not.toHaveBeenCalled();
  fireEvent.mouseDown(document.body);
  expect(close).toHaveBeenCalledTimes(1);
});

test('the part menu lists the part commands, greyed when they cannot run', () => {
  loadDoc(docOf(part(1, 'Part')));
  const menu = partMenuItems();
  expect(menu.map((m) => m.command)).toEqual([
    'edit.delete',
    'edit.duplicate',
    'edit.copy',
    'edit.paste',
    'view.hide',
    'select.linked',
    'select.similarType',
    'select.invert',
    'edit.detach',
    'edit.makeFree',
    'file.saveSelection',
  ]);
  for (const item of menu) {
    expect(item.label).toBe(allCommands().find((c) => c.id === item.command)!.label);
  }
  expect(menu.find((m) => m.command === 'edit.duplicate')).toEqual({
    label: 'Duplicate',
    command: 'edit.duplicate',
    disabled: true,
  });
  expect(menu.find((m) => m.command === 'edit.paste')!.disabled).toBe(false);
  select([1], 'replace');
  expect(partMenuItems().find((m) => m.command === 'edit.duplicate')!.disabled).toBe(false);
});
