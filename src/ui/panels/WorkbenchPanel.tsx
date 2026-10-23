// The Socket Workbench panel (spec §12.7), the left dock in Sockets mode: pick a part, copy its probe
// codes, capture or clear its sockets, and export or import the capture file.
import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { PartDef } from '../../core/catalog-types';
import { calibrationProbes, socketProbes, type ProbeCode } from '../../core/probes';
import type { SocketId } from '../../core/types';
import { catalogSig, socketOverridesSig } from '../../state/store';
import { toast } from '../../state/toasts';
import {
  captureProgress,
  clearSocket,
  exportSocketFile,
  importSocketFile,
  wbMateSig,
  wbSocketSig,
  wbTypeSig,
} from '../../state/workbench';
import { Icon } from '../icons';
import { CopyButton } from '../widgets/CopyButton';
import { fuzzyScore } from '../widgets/fuzzy';

const reportFailure = (what: string) => (e: unknown) =>
  toast(`${what}: ${(e as Error).message}`, 'error');

/** Saves text through a temporary object URL, revoked once the download has started. */
function download(name: string, text: string): void {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
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

export function WorkbenchPanel(): JSX.Element {
  const [query, setQuery] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cat = catalogSig.value;
  if (!cat) return <p class="empty">Loading the parts…</p>;

  const type = wbTypeSig.value;
  const socket = wbSocketSig.value;
  const def = type === null ? undefined : cat.parts[type];
  const progress = captureProgress(cat, socketOverridesSig.value).filter(
    (p) => fuzzyScore(query, p.type) > 0,
  );

  const choose = (t: string) => {
    if (wbTypeSig.value === t) return;
    wbTypeSig.value = t;
    wbSocketSig.value = null;
  };
  const exportFile = () =>
    download('socket_geometry.json', exportSocketFile(socketOverridesSig.value));
  const importFile = async (input: HTMLInputElement) => {
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;
    try {
      const result = await importSocketFile(await picked.text());
      if (result.ok) {
        setImportError(null);
        toast(`Imported ${picked.name}`);
      } else {
        setImportError(result.error);
      }
    } catch (e) {
      toast(`Could not import ${picked.name}: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <section class="workbench">
      <div class="wb-parts">
        <div class="wb-search">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Search parts"
            placeholder="Search parts"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </div>
        <ul class="wb-part-list" role="listbox" aria-label="Parts by usage">
          {progress.map((p) => (
            <li
              key={p.type}
              role="option"
              aria-selected={p.type === type}
              tabIndex={0}
              onClick={() => choose(p.type)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') choose(p.type);
              }}
            >
              <span class="wb-type">{p.type}</span>
              <span class="wb-progress">{`${p.captured}/${p.total}`}</span>
              <span class="wb-uses" title="Uses in real builds">
                {`${p.corpusCount.toLocaleString('en-US')}×`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div class="wb-detail">
        {def ? (
          <>
            <h3>{`${def.type} sockets`}</h3>
            <p class="muted">Select a socket, then click where its marker sits on the mesh.</p>
            <SocketTable type={def.type} def={def} selected={socket} />
            <label class="wb-mate">
              <input
                type="checkbox"
                checked={wbMateSig.value}
                onChange={(e) => {
                  wbMateSig.value = e.currentTarget.checked;
                }}
              />
              Test mate
            </label>
            <section class="wb-probes">
              <h3>Probe codes</h3>
              <p class="muted">Copy a code, spawn it in game, and see where the colors land.</p>
              {socketProbes(cat, def.type).map((p) => (
                <ProbeCard key={p.id} probe={p} />
              ))}
            </section>
          </>
        ) : (
          <p class="empty">Pick a part to see its sockets.</p>
        )}
      </div>

      <section class="wb-calibration">
        <h3>Calibration</h3>
        {calibrationProbes(cat).map((p) => (
          <ProbeCard key={p.id} probe={p} />
        ))}
      </section>

      <footer class="wb-footer">
        <button class="button" onClick={exportFile}>
          <Icon name="download" /> Export file
        </button>
        <button class="button" onClick={() => fileInput.current?.click()}>
          <Icon name="upload" /> Import file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Socket file"
          onChange={(e) => void importFile(e.currentTarget)}
        />
        {importError !== null && (
          <p class="wb-error" role="alert">
            {importError}
          </p>
        )}
      </footer>
    </section>
  );
}

function SocketTable({
  type,
  def,
  selected,
}: {
  type: string;
  def: PartDef;
  selected: SocketId | null;
}): JSX.Element {
  const pick = (id: SocketId) => {
    wbSocketSig.value = id;
  };
  return (
    <table class="wb-socket-table">
      <thead>
        <tr>
          <th scope="col">Socket</th>
          <th scope="col">Side</th>
          <th scope="col">Role</th>
          <th scope="col">Name</th>
          <th scope="col">Status</th>
          <th scope="col">
            <span class="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(def.sockets).map(([id, s]) => {
          const captured = s.frameSource === 'captured';
          return (
            <tr
              key={id}
              tabIndex={0}
              aria-selected={id === selected}
              onClick={() => pick(id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target === e.currentTarget) pick(id);
              }}
            >
              <td class="num">{id}</td>
              <td>{s.side}</td>
              <td>{s.role ?? '—'}</td>
              <td>{s.name ?? '—'}</td>
              <td>
                <span class={`wb-status ${s.frameSource}`}>{s.frameSource}</span>
              </td>
              <td>
                {captured && (
                  <button
                    class="button"
                    onClick={(e) => {
                      // Clearing must not also select the row.
                      e.stopPropagation();
                      void clearSocket(type, id).catch(reportFailure('Could not clear the socket'));
                    }}
                  >
                    Clear
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ProbeCard({ probe }: { probe: ProbeCode }): JSX.Element {
  return (
    <article class="wb-probe">
      <header>
        <h4>{probe.title}</h4>
        <CopyButton text={probe.code} label="Copy code" />
      </header>
      <ul class="wb-legend">
        {probe.legend.map((row) => (
          <li key={row.socket ?? row.note}>
            {row.color && (
              <span
                class="swatch"
                aria-hidden="true"
                style={{ background: `rgb(${row.color.rgb.join(', ')})` }}
              />
            )}
            {row.socket !== null && (
              <span class="wb-legend-socket">{`socket ${row.socket} =`}</span>
            )}
            <span>{row.note}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
