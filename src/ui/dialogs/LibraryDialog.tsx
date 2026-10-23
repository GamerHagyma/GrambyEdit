// The creation library (spec §13.8, §14): saved builds as cards, with search, sort and card actions.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatPercent } from '../../core/size';
import { creationsSig, openCreation, persistentSig, refreshCreations } from '../../state/library';
import { arm } from '../../state/place';
import { settingsSig } from '../../state/settings';
import { historySig } from '../../state/store';
import { toast } from '../../state/toasts';
import { exportBundle, importBundle } from '../../storage/bundle';
import {
  deleteCreation,
  duplicateCreation,
  listCreations,
  renameCreation,
  saveCreation,
  type CreationRecord,
} from '../../storage/library';
import { Icon } from '../icons';
import { Dialog } from '../layout/Dialog';
import { fuzzyScore } from '../widgets/fuzzy';

type SortKey = 'updated' | 'name' | 'parts';

const SORTS: Record<SortKey, (a: CreationRecord, b: CreationRecord) => number> = {
  updated: (a, b) => b.updatedAt - a.updatedAt,
  name: (a, b) => a.name.localeCompare(b.name),
  parts: (a, b) => b.partCount - a.partCount || a.name.localeCompare(b.name),
};

/** Mounted only while open, so each opening reads the library again. */
export function LibraryDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): JSX.Element | null {
  return open ? <LibraryBody onClose={onClose} /> : null;
}

function LibraryBody({ onClose }: { onClose(): void }): JSX.Element {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  // The creation whose Open waits for confirmation, because the open build has unsaved edits.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [storage, setStorage] = useState('');
  const [persisted, setPersisted] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshCreations().catch(failed);
    void storageText().then(setStorage);
    void isPersisted().then(setPersisted);
  }, []);

  const { limits } = settingsSig.value;
  const all = creationsSig.value;
  const shown = all
    .filter((r) => fuzzyScore(query, r.name) > 0 || r.tags.some((t) => fuzzyScore(query, t) > 0))
    .sort(SORTS[sort]);

  const openNow = async (id: string) => {
    try {
      await openCreation(id);
      onClose();
    } catch (e) {
      failed(e);
    }
  };
  const openCard = (id: string) => {
    if (historySig.value.past.length > 0) setConfirming(id);
    else void openNow(id);
  };
  const confirmOpen = () => {
    const id = confirming;
    setConfirming(null);
    if (id !== null) void openNow(id);
  };

  const insert = (id: string) => {
    arm({ kind: 'creation', id });
    onClose();
  };

  const commitRename = () => {
    if (renaming === null || renaming.name.trim() === '') return;
    const { id, name } = renaming;
    setRenaming(null);
    void mutate(() => renameCreation(id, name.trim()));
  };

  const card = (r: CreationRecord) => {
    const editing = renaming !== null && renaming.id === r.id ? renaming : null;
    return (
      <li key={r.id} class="creation-card">
        <Thumb blob={r.thumb} />
        <div class="creation-body">
          {editing ? (
            <input
              ref={focusOnMount}
              type="text"
              aria-label="New name"
              value={editing.name}
              onInput={(e) => setRenaming({ id: r.id, name: e.currentTarget.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                else if (e.key === 'Escape') {
                  // Escape cancels the rename here; it must not close the library.
                  e.stopPropagation();
                  setRenaming(null);
                }
              }}
            />
          ) : (
            <strong class="creation-name">{r.name}</strong>
          )}
          <span class="muted">{`${r.partCount.toLocaleString('en-US')} parts`}</span>
          <span class="muted">{`${formatPercent(r.codeLength, limits.codeChars)}% of code limit`}</span>
          <span class="muted">{`Updated ${new Date(r.updatedAt).toLocaleDateString()}`}</span>
          {r.tags.length > 0 && <span class="muted">{`Tags: ${r.tags.join(', ')}`}</span>}
        </div>
        <div class="creation-actions">
          {editing ? (
            <>
              <button class="button small primary" onClick={commitRename}>
                Save name
              </button>
              <button class="button small" onClick={() => setRenaming(null)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button class="button small primary" onClick={() => openCard(r.id)}>
                Open
              </button>
              <button class="button small" onClick={() => insert(r.id)}>
                Insert as part
              </button>
              <button
                class="button small"
                aria-label={`Rename ${r.name}`}
                onClick={() => setRenaming({ id: r.id, name: r.name })}
              >
                Rename
              </button>
            </>
          )}
          <button
            class="icon-button"
            aria-label={`Duplicate ${r.name}`}
            title="Duplicate"
            onClick={() => void mutate(() => duplicateCreation(r.id))}
          >
            <Icon name="copy" />
          </button>
          <button
            class="icon-button"
            aria-label={`Export ${r.name}`}
            title="Export .txt"
            onClick={() => exportOne(r)}
          >
            <Icon name="download" />
          </button>
          <button
            class="icon-button"
            aria-label={`Delete ${r.name}`}
            title="Delete"
            onClick={() => void remove(r)}
          >
            <Icon name="trash" />
          </button>
        </div>
      </li>
    );
  };

  return (
    <Dialog
      title="Library"
      open
      onClose={onClose}
      footer={
        confirming !== null ? (
          <>
            <button class="button" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button class="button primary" onClick={confirmOpen}>
              Replace
            </button>
          </>
        ) : undefined
      }
    >
      <div class="library">
        <div class="library-toolbar">
          <input
            type="search"
            aria-label="Search creations"
            placeholder="Search names and tags"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <select
            aria-label="Sort"
            value={sort}
            onChange={(e) => setSort(e.currentTarget.value as SortKey)}
          >
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
            <option value="parts">Most parts</option>
          </select>
          <button class="button small" onClick={() => importInput.current?.click()}>
            <Icon name="upload" /> Import bundle
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (file) void importFile(file);
            }}
          />
          <button class="button small" disabled={all.length === 0} onClick={() => void exportAll()}>
            <Icon name="download" /> Export all
          </button>
        </div>
        <p class="library-status muted">
          <span>{storage}</span>
          <span>{`Persistent: ${(persistentSig.value ?? persisted) ? 'yes' : 'no'}`}</span>
        </p>
        {confirming !== null && (
          <p role="alert">Replace the current build? Unsaved changes are lost.</p>
        )}
        {all.length === 0 ? (
          <p class="muted">No creations yet. Save the build with Ctrl+S to add one.</p>
        ) : shown.length === 0 ? (
          <p class="muted">No creations match the search.</p>
        ) : (
          <ul class="library-grid">{shown.map(card)}</ul>
        )}
      </div>
    </Dialog>
  );
}

/** The card's picture, or a box icon while there is none. Its object URL is revoked when it changes. */
function Thumb({ blob }: { blob: Blob | null }): JSX.Element {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (blob === null || typeof URL.createObjectURL !== 'function') {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return src ? (
    <img class="creation-thumb" src={src} alt="" />
  ) : (
    <span class="creation-thumb">
      <Icon name="box" size={28} />
    </span>
  );
}

/** A ref that focuses its element when it appears. The same function each render, so it runs once. */
function focusOnMount(el: HTMLElement | null): void {
  el?.focus();
}

function failed(e: unknown): void {
  toast((e as Error).message, 'error');
}

/** Runs a change to the library, then reloads the list. A failure is shown as a toast. */
async function mutate(job: () => Promise<unknown>): Promise<void> {
  try {
    await job();
  } catch (e) {
    failed(e);
  }
  await refreshCreations().catch(failed);
}

/** Deletes a creation; its toast puts it back under the same id. */
function remove(r: CreationRecord): Promise<void> {
  return mutate(async () => {
    await deleteCreation(r.id);
    toast(`Deleted "${r.name}".`, 'info', { label: 'Undo', run: () => void restore(r) });
  });
}

/** Re-saves a deleted creation with everything it had, under its own id. */
function restore(r: CreationRecord): Promise<void> {
  return mutate(() =>
    saveCreation({
      id: r.id,
      name: r.name,
      code: r.code,
      partCount: r.partCount,
      thumb: r.thumb,
      editorMeta: r.editorMeta,
      tags: [...r.tags],
      notes: r.notes,
    }),
  );
}

function importFile(file: File): Promise<void> {
  return mutate(async () => {
    const r = await importBundle(await file.text());
    toast(`Imported ${r.added}, skipped ${r.skipped}, renamed ${r.renamed}.`);
  });
}

async function exportAll(): Promise<void> {
  try {
    const records = await listCreations();
    saveFile(`GrambyEdit-library-${stamp()}.json`, exportBundle(records), 'application/json');
  } catch (e) {
    failed(e);
  }
}

function exportOne(r: CreationRecord): void {
  saveFile(`${r.name.replace(/[\\/:*?"<>|]/g, '_')}.txt`, r.code, 'text/plain');
}

/** Saves text through a temporary object URL, revoked after the download has started. */
function saveFile(name: string, text: string, type: string): void {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  } catch (e) {
    toast(`Download failed: ${(e as Error).message}`, 'error');
  }
}

/** Local date as yyyy-mm-dd, for file names. */
function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const megabytes = (bytes: number): string =>
  `${(bytes / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })} MB`;

/** The browser's storage estimate for the toolbar. */
async function storageText(): Promise<string> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate) return 'Storage: unknown';
    return `Storage: ${megabytes(estimate.usage ?? 0)} of ${megabytes(estimate.quota ?? 0)}`;
  } catch {
    return 'Storage: unknown';
  }
}

/** Whether the browser keeps this library's storage; a browser that cannot say counts as no. */
async function isPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}
