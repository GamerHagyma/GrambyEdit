import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { runCommand } from '../../state/commands';
import { issuesSig } from '../../state/derived';
import { keysFor } from '../../state/keymap';
import { selectionSig, selectModeSig } from '../../state/selection';
import { settingsSig } from '../../state/settings';
import { catalogSig, docSig } from '../../state/store';
import { inspectorTabSig, openDialog, showInspectorTab, statusHintSig } from '../../state/ui';
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

/** Error and warning counts in the status bar (spec §13.6); a click opens the Issues tab. */
function IssueBadge(): JSX.Element {
  const issues = issuesSig.value;
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const level = errors > 0 ? 'bad' : warnings > 0 ? 'warn' : 'ok';
  return (
    <button
      class={`meter issue-badge ${level}`}
      title="Open the Issues tab"
      onClick={() => showInspectorTab('issues')}
    >
      {`${errors} ${errors === 1 ? 'error' : 'errors'} · ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`}
    </button>
  );
}

const RIGHT_TABS = [
  { id: 'properties', label: 'Properties' },
  { id: 'reference', label: 'Reference' },
  { id: 'outliner', label: 'Outliner' },
  { id: 'stats', label: 'Stats' },
  { id: 'issues', label: 'Issues' },
  { id: 'history', label: 'History' },
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
  const stored = inspectorTabSig.value;
  const tab: RightTab = RIGHT_TABS.some((t) => t.id === stored)
    ? (stored as RightTab)
    : 'properties';
  const chooseTab = (id: string) => showInspectorTab(id);
  const selected = selectionSig.value.parts.size;
  const cat = catalogSig.value;
  const doc = docSig.value;
  const multiPiece = [...selectionSig.value.parts].some((id) => {
    const part = doc.parts.get(id);
    return part && (cat?.parts[part.type]?.bodies?.length ?? 0) > 1;
  });
  const hint =
    statusHintSig.value ??
    (multiPiece
      ? 'Drag piece to socket/surface (Select/Move) · G/R: move/rotate · Double-click: whole part'
      : null);
  const scheme = settingsSig.value.cameraScheme;
  /** A menu item that runs a command and shows its first key in the current scheme. */
  const cmd = (id: string, label: string): MenuItem => ({
    label,
    run: () => void runCommand(id),
    hint: keysFor(id, scheme)[0],
  });

  return (
    <div class="app">
      <header class="top-bar">
        <span class="brand">GrambyEdit</span>
        <Menu
          label="File"
          items={[
            cmd('file.import', 'Import code…'),
            cmd('file.export', 'Export code…'),
            cmd('file.library', 'Library…'),
            cmd('file.save', 'Save to library…'),
          ]}
        />
        <Menu
          label="Edit"
          items={[
            cmd('edit.undo', 'Undo'),
            cmd('edit.redo', 'Redo'),
            cmd('edit.copy', 'Copy'),
            cmd('edit.paste', 'Paste'),
            cmd('edit.duplicate', 'Duplicate'),
            cmd('edit.delete', 'Delete'),
            cmd('select.all', 'Select all'),
            cmd('select.none', 'Select none'),
            { label: 'Settings…', run: () => openDialog('settings') },
          ]}
        />
        <Menu
          label="View"
          items={[
            cmd('view.frameSelected', 'Frame selection'),
            cmd('view.frameAll', 'Frame all'),
            cmd('view.ortho', 'Toggle orthographic'),
            cmd('view.hide', 'Hide selected'),
            cmd('view.unhide', 'Show all'),
            cmd('view.isolate', 'Isolate selected'),
            cmd('app.shortcuts', 'Keyboard shortcuts'),
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
        <IssueBadge />
        {hint && (
          <span class="status-hint" title={hint}>
            {hint}
          </span>
        )}
        <small class="credit">{CREDITS}</small>
      </StatusBar>
      <Toasts />
    </div>
  );
}
