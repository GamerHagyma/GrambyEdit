import { batch, effect } from '@preact/signals';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { loadAssets } from '../assets/load';
import { settingsSig } from '../state/settings';
import { assetsSig, baseCatalogSig, redo, socketOverridesSig, undo } from '../state/store';
import { toast } from '../state/toasts';
import { closeDialog, dialogSig, openDialog } from '../state/ui';
import { setStorageErrorReporter } from '../storage/prefs';
import { loadSocketOverrides } from '../storage/sockets';
import { toolSig } from '../tools/manager';
import { AboutDialog } from './dialogs/AboutDialog';
import { ExportDialog } from './dialogs/ExportDialog';
import { FirstRun } from './dialogs/FirstRun';
import { PointDeleteDialog } from './dialogs/PointDeleteDialog';
import { ImportDialog } from './dialogs/ImportDialog';
import { SettingsDialog } from './dialogs/SettingsDialog';
import { ShortcutsDialog } from './dialogs/ShortcutsDialog';
import { Meters } from './layout/Meters';
import { Shell } from './layout/Shell';
import { IssuesPanel } from './panels/IssuesPanel';
import { Outliner } from './panels/Outliner';
import { PaintPanel } from './panels/PaintPanel';
import { Properties } from './panels/Properties';
import { StatsPanel } from './panels/StatsPanel';
import { WorkbenchPanel } from './panels/WorkbenchPanel';
import { PickerHost } from './widgets/PickerHost';
import './tokens.css';

/** The open dialog, if it is one that exists yet. */
function Dialogs(): JSX.Element {
  const name = dialogSig.value;
  return (
    <>
      <ImportDialog open={name === 'import'} onClose={closeDialog} />
      <ExportDialog open={name === 'export'} onClose={closeDialog} />
      <SettingsDialog open={name === 'settings'} onClose={closeDialog} />
      <AboutDialog open={name === 'about'} onClose={closeDialog} />
      <ShortcutsDialog open={name === 'shortcuts'} onClose={closeDialog} />
      <FirstRun />
      <PickerHost />
      <PointDeleteDialog />
    </>
  );
}

/** The left dock: the Socket Workbench or the Paint panel for their tools. The part browser arrives with placing (Task 33). */
function LeftDock(): JSX.Element {
  const tool = toolSig.value;
  if (tool === 'sockets') return <WorkbenchPanel />;
  if (tool === 'paint') return <PaintPanel />;
  return <p class="empty">Nothing here yet</p>;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * App-wide keys until the command registry (Task 30) owns the keyboard: Ctrl+O / Ctrl+E open Import
 * and Export, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo (text fields keep their own), ? opens the guide.
 */
function onAppKey(e: KeyboardEvent): void {
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl && !e.altKey && e.key === '?' && !isTyping(e.target) && dialogSig.value === null) {
    e.preventDefault();
    openDialog('shortcuts');
    return;
  }
  if (!ctrl || e.altKey) return;
  if (!e.shiftKey && (e.code === 'KeyO' || e.code === 'KeyE')) {
    e.preventDefault();
    openDialog(e.code === 'KeyO' ? 'import' : 'export');
    return;
  }
  if (isTyping(e.target) || dialogSig.value !== null) return;
  if (e.code === 'KeyZ' || (e.code === 'KeyY' && !e.shiftKey)) {
    e.preventDefault();
    if (e.code === 'KeyZ' && !e.shiftKey) undo();
    else redo();
  }
}

export function App(): JSX.Element {
  useEffect(() => {
    setStorageErrorReporter((message) => toast(message, 'error'));
    const stopTheme = effect(() => {
      document.documentElement.dataset.theme = settingsSig.value.theme;
    });
    window.addEventListener('keydown', onAppKey);
    let alive = true;
    loadSocketOverrides().then((file) => {
      if (alive) socketOverridesSig.value = file;
    });
    loadAssets()
      .then((assets) => {
        if (!alive) return;
        batch(() => {
          assetsSig.value = assets;
          baseCatalogSig.value = assets.catalog;
        });
      })
      .catch((e: unknown) => {
        if (alive) toast(`Could not load the part library: ${(e as Error).message}`, 'error');
      });
    return () => {
      alive = false;
      stopTheme();
      window.removeEventListener('keydown', onAppKey);
    };
  }, []);
  return (
    <>
      <Shell
        parts={<LeftDock />}
        inspector={{
          properties: <Properties />,
          outliner: <Outliner />,
          stats: <StatsPanel />,
          issues: <IssuesPanel />,
        }}
        status={<Meters />}
      />
      <Dialogs />
    </>
  );
}
