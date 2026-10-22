import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { selectionSig, selectModeSig } from '../../state/selection';
import { redo, undo, viewBus } from '../../state/store';
import { openDialog } from '../../state/ui';
import { loadPref, savePref } from '../../storage/prefs';
import { mountViewport } from '../../viewport/index';
import { CREDITS } from '../credits';
import { Dock } from './Dock';
import { StatusBar } from './StatusBar';
import { Tabs } from './Tabs';
import { Toasts } from './Toasts';
import { Toolbar } from './Toolbar';

interface MenuItem {
  label: string;
  run(): void;
  hint?: string;
}

/** A top-bar menu: a button that opens a list; Escape or a click outside closes it. */
function Menu({ label, items }: { label: string; items: readonly MenuItem[] }): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div class="menu" ref={ref}>
      <button
        class="menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div class="menu-list" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.run();
              }}
            >
              <span>{it.label}</span>
              {it.hint && <span class="muted">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const RIGHT_TABS = [
  { id: 'properties', label: 'Properties' },
  { id: 'outliner', label: 'Outliner' },
  { id: 'stats', label: 'Stats' },
  { id: 'issues', label: 'Issues' },
] as const;

export type RightTab = (typeof RIGHT_TABS)[number]['id'];

/** The editor layout (spec §17): top bar, Parts dock, viewport, inspector dock and status bar. */
export function Shell({
  parts,
  inspector,
  status,
}: {
  parts?: ComponentChildren;
  inspector?: Partial<Record<RightTab, ComponentChildren>>;
  status?: ComponentChildren;
}): JSX.Element {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => mountViewport(viewport.current!), []);
  const [tab, setTab] = useState<RightTab>(() => {
    const stored = loadPref<string>('rightTab', 'properties');
    return RIGHT_TABS.some((t) => t.id === stored) ? (stored as RightTab) : 'properties';
  });
  const chooseTab = (id: string) => {
    setTab(id as RightTab);
    savePref('rightTab', id);
  };
  const selected = selectionSig.value.parts.size;

  return (
    <div class="app">
      <header class="top-bar">
        <span class="brand">GrambyEdit</span>
        <Menu
          label="File"
          items={[
            { label: 'Import code…', run: () => openDialog('import'), hint: 'Ctrl+O' },
            { label: 'Export code…', run: () => openDialog('export'), hint: 'Ctrl+E' },
            { label: 'Library…', run: () => openDialog('library') },
            { label: 'Save to library…', run: () => openDialog('save'), hint: 'Ctrl+S' },
          ]}
        />
        <Menu
          label="Edit"
          items={[
            { label: 'Undo', run: undo, hint: 'Ctrl+Z' },
            { label: 'Redo', run: redo, hint: 'Ctrl+Shift+Z' },
            { label: 'Settings…', run: () => openDialog('settings') },
          ]}
        />
        <Menu
          label="View"
          items={[
            { label: 'Frame selection', run: () => viewBus.emit({ kind: 'frame-selection' }) },
            { label: 'Frame all', run: () => viewBus.emit({ kind: 'frame-all' }), hint: 'Home' },
            { label: 'Toggle orthographic', run: () => viewBus.emit({ kind: 'toggle-ortho' }) },
            { label: 'Keyboard shortcuts', run: () => openDialog('shortcuts'), hint: '?' },
            { label: 'About GrambyEdit', run: () => openDialog('about') },
          ]}
        />
        <span class="sep" />
        <Toolbar />
      </header>
      <main class="main">
        <Dock side="left" label="Parts">
          {parts ?? <p class="empty">Nothing here yet</p>}
        </Dock>
        <div class="viewport" ref={viewport} />
        <Dock side="right" label="Inspector">
          <Tabs tabs={RIGHT_TABS} active={tab} onChange={chooseTab} />
          <div
            class="tab-body"
            role="tabpanel"
            aria-label={RIGHT_TABS.find((t) => t.id === tab)!.label}
          >
            {inspector?.[tab] ?? <p class="empty">Nothing here yet</p>}
          </div>
        </Dock>
      </main>
      <StatusBar>
        <span>
          {selectModeSig.value === 'attached' ? 'Part + attached' : 'Part'} · {selected} selected
        </span>
        {status}
        <small class="credit">{CREDITS}</small>
      </StatusBar>
      <Toasts />
    </div>
  );
}
