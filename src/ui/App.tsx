import { batch, effect } from '@preact/signals';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { loadAssets } from '../assets/load';
import { settingsSig } from '../state/settings';
import { assetsSig, baseCatalogSig, socketOverridesSig } from '../state/store';
import { toast } from '../state/toasts';
import { closeDialog, dialogSig, openDialog } from '../state/ui';
import { setStorageErrorReporter } from '../storage/prefs';
import { loadSocketOverrides } from '../storage/sockets';
import { toolSig } from '../tools/manager';
import { ExportDialog } from './dialogs/ExportDialog';
import { ImportDialog } from './dialogs/ImportDialog';
import { Meters } from './layout/Meters';
import { Shell } from './layout/Shell';
import { IssuesPanel } from './panels/IssuesPanel';
import { Outliner } from './panels/Outliner';
import { StatsPanel } from './panels/StatsPanel';
import { WorkbenchPanel } from './panels/WorkbenchPanel';
import './tokens.css';

/** The open dialog, if it is one that exists yet. */
function Dialogs(): JSX.Element {
  const name = dialogSig.value;
  return (
    <>
      <ImportDialog open={name === 'import'} onClose={closeDialog} />
      <ExportDialog open={name === 'export'} onClose={closeDialog} />
    </>
  );
}

/** The left dock: the Socket Workbench in Sockets mode. The part browser arrives with placing (Task 33). */
function LeftDock(): JSX.Element {
  return toolSig.value === 'sockets' ? <WorkbenchPanel /> : <p class="empty">Nothing here yet</p>;
}

/** Ctrl+O and Ctrl+E open Import and Export. The command registry (Task 30) replaces this. */
function onFileKey(e: KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  const name = e.code === 'KeyO' ? 'import' : e.code === 'KeyE' ? 'export' : null;
  if (name === null) return;
  e.preventDefault();
  openDialog(name);
}

export function App(): JSX.Element {
  useEffect(() => {
    setStorageErrorReporter((message) => toast(message, 'error'));
    const stopTheme = effect(() => {
      document.documentElement.dataset.theme = settingsSig.value.theme;
    });
    window.addEventListener('keydown', onFileKey);
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
      window.removeEventListener('keydown', onFileKey);
    };
  }, []);
  return (
    <>
      <Shell
        parts={<LeftDock />}
        inspector={{ outliner: <Outliner />, stats: <StatsPanel />, issues: <IssuesPanel /> }}
        status={<Meters />}
      />
      <Dialogs />
    </>
  );
}
