import { batch, effect } from '@preact/signals';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { loadAssets } from '../assets/load';
import { settingsSig } from '../state/settings';
import { copyPayload, pasteText, rememberCopy } from '../state/clipboard';
import { hasCommand, runCommand } from '../state/commands';
import { creationsSig, refreshCreations, startAutosave } from '../state/library';
import { arm } from '../state/place';
import { isTypingTarget, resolveKey } from '../state/keymap';
import { assetsSig, baseCatalogSig, socketOverridesSig } from '../state/store';
import { toast } from '../state/toasts';
import { closeDialog, dialogSig } from '../state/ui';
import { setStorageErrorReporter } from '../storage/prefs';
import { loadSocketOverrides } from '../storage/sockets';
import { toolSig } from '../tools/manager';
import { getViewport } from '../viewport/context';
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
import { PartBrowser } from './panels/PartBrowser';
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

/** The left dock: the Socket Workbench or the Paint panel for their tools, else the part browser. */
function LeftDock(): JSX.Element {
  const tool = toolSig.value;
  if (tool === 'sockets') return <WorkbenchPanel />;
  if (tool === 'paint') return <PaintPanel />;
  return (
    <PartBrowser
      onArm={(c) =>
        arm(c.kind === 'part' ? { kind: 'part', type: c.type } : { kind: 'creation', id: c.id })
      }
      creations={creationsSig.value.map((r) => ({ id: r.id, name: r.name }))}
    />
  );
}

/** Keys a focused button, link or list keeps for itself: activation and focus moves. */
const FOCUS_KEYS = new Set([
  'Tab',
  'Enter',
  ' ',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);
/** Copy and paste go through the browser's copy and paste events, which need no permission. */
const NATIVE = new Set(['edit.copy', 'edit.paste']);

const dialogOpen = () => document.querySelector('.dialog-backdrop') !== null;

/**
 * The one key router: the viewport's own keys first (gizmo cancel, tool keys, camera fly keys), then the
 * keymap's command. Text fields and open dialogs keep their keys.
 */
function onKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || isTypingTarget(e.target) || dialogOpen()) return;
  const t = e.target;
  const control = t instanceof HTMLElement && t !== document.body && t.tagName !== 'CANVAS';
  if (control && FOCUS_KEYS.has(e.key)) return;
  if (getViewport()?.onKey(e)) {
    e.preventDefault();
    return;
  }
  const id = resolveKey(e, settingsSig.value.cameraScheme);
  if (id === null || NATIVE.has(id) || !hasCommand(id)) return;
  e.preventDefault();
  runCommand(id);
}

/** Ctrl+C on the build: the selection's share code goes to the system clipboard. Selected text copies as usual. */
function onCopy(e: ClipboardEvent): void {
  if (
    isTypingTarget(e.target) ||
    dialogOpen() ||
    (window.getSelection()?.toString() ?? '') !== ''
  ) {
    return;
  }
  const payload = copyPayload();
  if (!payload || !e.clipboardData) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', payload.code);
  rememberCopy(payload);
}

/** Ctrl+V on the build: a share code from the clipboard, or the editor's own copy. */
function onPaste(e: ClipboardEvent): void {
  if (isTypingTarget(e.target) || dialogOpen()) return;
  e.preventDefault();
  pasteText(e.clipboardData?.getData('text/plain') ?? null);
}

export function App(): JSX.Element {
  useEffect(() => {
    setStorageErrorReporter((message) => toast(message, 'error'));
    const stopTheme = effect(() => {
      document.documentElement.dataset.theme = settingsSig.value.theme;
    });
    window.addEventListener('keydown', onKey);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    let alive = true;
    const stopAutosave = startAutosave();
    refreshCreations().catch((e: unknown) =>
      toast(`Could not read the library: ${(e as Error).message}`, 'error'),
    );
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
      stopAutosave();
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
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
