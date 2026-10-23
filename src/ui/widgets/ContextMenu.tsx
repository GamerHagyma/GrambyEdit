// A right-click menu at a point in the window (spec §13.10). Arrows, Enter and Esc, or a click; a press outside closes it.
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { allCommands, runCommand } from '../../state/commands';

export interface MenuItem {
  readonly label: string;
  readonly command: string;
  readonly disabled?: boolean;
}

/** The commands of a part's right-click menu, in menu order. */
const PART_MENU = [
  'edit.delete',
  'edit.duplicate',
  'edit.copy',
  'edit.paste',
  'view.hide',
  'select.linked',
  'select.similarType',
  'edit.detach',
  'edit.makeFree',
  'file.saveSelection',
] as const;

/** The part menu's items, labelled and greyed from the registry. Throws if a listed command is missing. */
export function partMenuItems(): { label: string; command: string; disabled: boolean }[] {
  const byId = new Map(allCommands().map((c) => [c.id, c] as const));
  return PART_MENU.map((id) => {
    const command = byId.get(id);
    if (command === undefined) throw new Error(`partMenuItems: command ${id} is not registered`);
    return {
      label: command.label,
      command: id,
      disabled: command.enabled !== undefined && !command.enabled(),
    };
  });
}

/** The commands of the right-click menu on empty space. */
const VIEW_MENU = [
  'edit.paste',
  'select.all',
  'view.unhide',
  'view.frameAll',
  'app.palette',
] as const;

/** The empty-space menu's items, labelled and greyed from the registry. */
export function viewMenuItems(): { label: string; command: string; disabled: boolean }[] {
  const byId = new Map(allCommands().map((c) => [c.id, c] as const));
  return VIEW_MENU.flatMap((id) => {
    const command = byId.get(id);
    if (command === undefined) return [];
    return [
      {
        label: command.label,
        command: id,
        disabled: command.enabled !== undefined && !command.enabled(),
      },
    ];
  });
}

/** The next enabled item from `from` in direction `dir`, or `from` itself when there is none. */
function neighbour(items: readonly MenuItem[], from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < items.length; i += dir) {
    if (!items[i].disabled) return i;
  }
  return from;
}

export function ContextMenu({
  items,
  x,
  y,
  onClose,
}: {
  items: readonly MenuItem[];
  /** Client pixels: where the pointer was. */
  x: number;
  y: number;
  onClose(): void;
}): JSX.Element {
  const menu = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const [at, setAt] = useState({ left: x, top: y });
  const [active, setActive] = useState(() => items.findIndex((item) => !item.disabled));

  // Pulls the menu back inside the window, now that its size is known.
  useLayoutEffect(() => {
    const { width, height } = menu.current!.getBoundingClientRect();
    setAt({
      left: Math.max(0, Math.min(x, window.innerWidth - width)),
      top: Math.max(0, Math.min(y, window.innerHeight - height)),
    });
  }, [x, y]);

  // The highlighted item takes focus, so the keys reach the menu.
  useEffect(() => {
    rows.current[active]?.focus();
  }, [active]);

  // A press outside the menu closes it.
  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (!menu.current!.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [onClose]);

  const choose = (i: number) => {
    const item = items[i];
    if (item !== undefined && !item.disabled && runCommand(item.command)) onClose();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Only the menu closes: the app's own Escape (cancel) must not also run.
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => neighbour(items, a, dir));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    }
  };

  return (
    <div
      ref={menu}
      class="context-menu"
      role="menu"
      style={{ position: 'fixed', left: `${at.left}px`, top: `${at.top}px` }}
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) => (
        <div
          key={i}
          ref={(el) => {
            rows.current[i] = el;
          }}
          class={item.disabled ? 'context-item disabled' : 'context-item'}
          role="menuitem"
          tabIndex={-1}
          aria-disabled={item.disabled === true}
          onClick={() => choose(i)}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
