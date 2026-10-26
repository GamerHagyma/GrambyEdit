// The Socket Workbench panel (spec §12.7), the left dock in Sockets mode: pick a part, copy its probe
// codes, capture, turn, place or clear its sockets, and export or import the capture file.
import { Fragment, type JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { PartDef } from '../../core/catalog-types';
import { facingLabel, turnFrame } from '../../core/frames';
import { calibrationProbes, socketProbes, type ProbeCode } from '../../core/probes';
import type { CFrame12, SocketId } from '../../core/types';
import { catalogSig, socketOverridesSig } from '../../state/store';
import { toast } from '../../state/toasts';
import {
  captureProgress,
  captureSocket,
  clearSocket,
  resetSocketOverrides,
  socketResetVersionSig,
  exportSocketFile,
  importSocketFile,
  wbGizmoModeSig,
  wbMateSig,
  wbSocketSig,
  wbTypeSig,
} from '../../state/workbench';
import { downloadText } from '../download';
import { Icon } from '../icons';
import { CopyButton } from '../widgets/CopyButton';
import { fuzzyScore } from '../widgets/fuzzy';
import { NumberScrub } from '../widgets/NumberScrub';
import { Dialog } from '../layout/Dialog';

const reportFailure = (what: string) => (e: unknown) =>
  toast(`${what}: ${(e as Error).message}`, 'error');

export function WorkbenchPanel(): JSX.Element {
  const [query, setQuery] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
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
    downloadText(
      'socket_geometry.json',
      exportSocketFile(socketOverridesSig.value),
      'application/json',
    );
  const importFile = async (input: HTMLInputElement) => {
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;
    const resetVersion = socketResetVersionSig.peek();
    try {
      const text = await picked.text();
      if (resetVersion !== socketResetVersionSig.peek()) {
        toast('Socket import canceled because the socket data was reset.', 'warn');
        return;
      }
      const result = await importSocketFile(text);
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
            <p class="muted">
              Select a socket, then click where its marker sits on the mesh. Arrows show which way
              each socket faces.
            </p>
            <SocketTable type={def.type} def={def} selected={socket} />
            {socket !== null && Object.hasOwn(def.sockets, socket) && (
              <SocketControls type={def.type} socket={socket} frame={def.sockets[socket].frame} />
            )}
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
        <button class="button" onClick={() => setConfirmReset(true)}>
          Reset all to defaults…
        </button>
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
      <Dialog
        title="Reset all socket data"
        open={confirmReset}
        onClose={() => {
          if (!resetting) setConfirmReset(false);
        }}
        footer={
          <>
            <button class="button" disabled={resetting} onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
            <button
              class="button primary"
              disabled={resetting}
              onClick={async () => {
                setResetting(true);
                try {
                  await resetSocketOverrides();
                  setConfirmReset(false);
                  toast('All socket data restored to defaults.');
                } catch (e) {
                  reportFailure('Could not reset socket data')(e);
                } finally {
                  setResetting(false);
                }
              }}
            >
              {resetting ? 'Resetting…' : 'Reset all socket data'}
            </button>
          </>
        }
      >
        <p>
          Are you sure? This removes all custom socket captures and imported overrides saved in this
          browser, for every part, and restores the shipped defaults.
        </p>
        <p class="muted">
          Socket edits are stored locally in IndexedDB. Export your socket file first if you want to
          keep a backup.
        </p>
      </Dialog>
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

const AXES = ['x', 'y', 'z'] as const;

/** The selected socket: which way it faces, the gizmo mode, exact turns and an exact position. */
function SocketControls({
  type,
  socket,
  frame,
}: {
  type: string;
  socket: SocketId;
  frame: CFrame12;
}): JSX.Element {
  const [step, setStep] = useState(90);
  const mode = wbGizmoModeSig.value;
  const save = (cf: CFrame12) =>
    void captureSocket(type, socket, cf).catch(reportFailure('Could not save the socket'));
  const place = (i: number, v: number) => {
    const next: readonly number[] = frame.map((x, k) => (k === i ? v : x));
    save(next as CFrame12);
  };
  return (
    <section class="wb-socket" aria-label={`Socket ${socket}`}>
      <h3>
        {`Socket ${socket}`}
        <span class="wb-facing">{`faces ${facingLabel(frame)}`}</span>
      </h3>
      <div class="wb-row" role="group" aria-label="Gizmo">
        <span class="wb-label">Gizmo</span>
        <div class="segmented">
          <button
            aria-pressed={mode === 'translate'}
            onClick={() => {
              wbGizmoModeSig.value = 'translate';
            }}
          >
            Move (G)
          </button>
          <button
            aria-pressed={mode === 'rotate'}
            onClick={() => {
              wbGizmoModeSig.value = 'rotate';
            }}
          >
            Rotate (R)
          </button>
        </div>
      </div>
      <div class="wb-row" role="group" aria-label="Turn">
        <span class="wb-label">Turn</span>
        {AXES.map((axis) => (
          <button
            key={axis}
            class="button"
            title={`Turn ${step}° about the socket’s own ${axis.toUpperCase()} axis (Shift: back)`}
            onClick={(e) => save(turnFrame(frame, axis, e.shiftKey ? -step : step))}
          >
            {axis.toUpperCase()}
          </button>
        ))}
        <label class="visually-hidden" for="wb-turn-step">
          Turn step in degrees
        </label>
        <NumberScrub
          id="wb-turn-step"
          value={step}
          placeholder="90"
          step={1}
          min={0.1}
          max={360}
          onCommit={setStep}
        />
        <span class="wb-unit">°</span>
      </div>
      <div class="wb-row" role="group" aria-label="Position">
        <span class="wb-label">Position</span>
        {AXES.map((axis, i) => (
          <Fragment key={axis}>
            <label class="visually-hidden" for={`wb-pos-${axis}`}>
              {`Position ${axis.toUpperCase()}`}
            </label>
            <NumberScrub
              id={`wb-pos-${axis}`}
              value={Math.round(frame[i] * 1e4) / 1e4 + 0}
              placeholder="0"
              step={0.01}
              onCommit={(v) => place(i, v)}
            />
          </Fragment>
        ))}
      </div>
    </section>
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
