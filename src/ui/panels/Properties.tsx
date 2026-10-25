// The Properties panel (spec §13.3): the selected parts' props edited together. For one part it also shows
// its other props, connections, points and info.
import type { JSX } from 'preact';
import { Fragment } from 'preact';
import type { Catalog } from '../../core/catalog-types';
import { orderIndex } from '../../core/doc';
import { detach, makePoseJoint, removeConn } from '../../core/ops/conns';
import { setProp, UNSET } from '../../core/ops/props';
import {
  otherProps,
  selectionHeader,
  typeCounts,
  unionProps,
  visibleProperty,
} from '../../core/propview';
import { POSE_APPROX, poseConn } from '../../core/pose';
import { entryBytes } from '../../core/size';
import type { Doc, Part, PartId, Verdict } from '../../core/types';
import { posesSig } from '../../state/derived';
import { select, selectionSig } from '../../state/selection';
import { catalogSig, commit, docSig } from '../../state/store';
import { toast } from '../../state/toasts';
import { Icon } from '../icons';
import { JsonField } from '../widgets/JsonField';
import { PropField } from '../widgets/PropField';
import { ServoControls } from '../widgets/ServoControls';
import { collaborationReadOnlySig } from '../../state/collaboration';
import { isServo } from '../../core/servo-simulation';
import { servoPreviewSig, withServoPreview } from '../../state/servo-preview';

const EPHEMERAL = 'EphemeralAttachments';

interface PartProps {
  readonly cat: Catalog;
  readonly doc: Doc;
  readonly part: Part;
}

/** A catalog socket's name when it has one, else its id. */
function socketName(cat: Catalog, type: string | undefined, socket: string): string {
  const def = type !== undefined && Object.hasOwn(cat.parts, type) ? cat.parts[type] : undefined;
  return def && Object.hasOwn(def.sockets, socket) ? (def.sockets[socket].name ?? socket) : socket;
}

function Header({ doc, ids }: { doc: Doc; ids: readonly PartId[] }): JSX.Element {
  // A chip narrows the selection to its type. It sets the selection directly: `select` would add the
  // posed children of each part in attached mode, which can bring other types back in.
  const narrow = (type: string): void => {
    const kept = ids.filter((id) => doc.parts.get(id)?.type === type);
    selectionSig.value = {
      parts: new Set(kept),
      pieces: new Map(),
      points: new Set(),
      active: kept[kept.length - 1] ?? null,
    };
  };
  return (
    <div class="properties-header" role="group" aria-label={selectionHeader(doc, ids)}>
      <span>{`${ids.length} ${ids.length === 1 ? 'part' : 'parts'} —`}</span>
      {typeCounts(doc, ids).map((c, i) => (
        <Fragment key={c.type}>
          {i === 0 ? ' ' : ', '}
          <button type="button" class="chip" onClick={() => narrow(c.type)}>
            {`${c.count} ${c.type}`}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

function OtherProps({ cat, doc, part }: PartProps): JSX.Element | null {
  const entries = Object.entries(otherProps(doc, cat, part.id));
  if (entries.length === 0) return null;
  return (
    <section class="properties-section">
      <h3>Other properties</h3>
      {entries.map(([key, value], i) => {
        const id = `other-prop-${i}`;
        return (
          <div class="prop-row" key={key}>
            <div class="prop-head">
              <label for={id} class="prop-label">
                {key}
              </label>
              <button
                type="button"
                class="icon-button"
                title={`Remove ${key}`}
                aria-label={`Remove ${key}`}
                onClick={() =>
                  commit(`Remove ${key}`, (d) => {
                    setProp(d, cat, [part.id], key, UNSET);
                  })
                }
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
            <JsonField
              id={id}
              value={value}
              onCommit={(next) =>
                commit(`Set ${key}`, (d) => {
                  setProp(d, cat, [part.id], key, next);
                })
              }
            />
          </div>
        );
      })}
    </section>
  );
}

/** One conn. The pose conn carries a badge; raw conns are shown as imported and cannot be edited. */
function ConnRow({
  cat,
  doc,
  part,
  index,
  isPose,
}: PartProps & { readonly index: number; readonly isPose: boolean }): JSX.Element {
  const conn = part.conns[index];
  if (conn.target.kind === 'raw') {
    return (
      <li class="conn-row raw">
        <span class="muted">raw</span> <code>{JSON.stringify(conn.target.triple)}</code>
      </li>
    );
  }
  const { target } = conn;
  const host = doc.parts.get(target.part);
  const at = orderIndex(doc).get(target.part);
  const socket =
    target.kind === 'socket' ? socketName(cat, host?.type, target.socket) : target.uuid;
  const disconnect = (): void => {
    commit('Disconnect', (d) => {
      // The pose conn goes through `detach`, which hands the pose to the next joint.
      if (isPose) detach(d, part.id, posesSig.value);
      else removeConn(d, part.id, index);
    });
  };
  const makePose = (): void => {
    let verdict = null as Verdict | null;
    commit('Make pose joint', (d) => {
      verdict = makePoseJoint(d, part.id, index);
    });
    if (verdict !== null && !verdict.ok) toast(verdict.message, 'warn');
  };
  return (
    <li class={isPose ? 'conn-row pose' : 'conn-row'}>
      {isPose && <span class="pose-badge">pose</span>}
      <span>{`self ${socketName(cat, part.type, conn.self)} → `}</span>
      <button type="button" class="link" onClick={() => select([target.part], 'replace')}>
        {`${host?.type ?? 'missing'} #${at === undefined ? '?' : at + 1} ${socket}`}
      </button>
      <button type="button" class="button small" onClick={disconnect}>
        <Icon name="x" size={14} /> Disconnect
      </button>
      {!isPose && (
        <button type="button" class="button small" onClick={makePose}>
          Make pose joint
        </button>
      )}
    </li>
  );
}

function Connections({ cat, doc, part }: PartProps): JSX.Element {
  const pose = poseConn(part);
  const poseAt = pose === undefined ? -1 : part.conns.indexOf(pose);
  return (
    <section class="properties-section">
      <h3>Connections</h3>
      {part.conns.length === 0 ? (
        <p class="muted">No connections.</p>
      ) : (
        <ul class="conn-list">
          {part.conns.map((_, index) => (
            <ConnRow
              key={index}
              cat={cat}
              doc={doc}
              part={part}
              index={index}
              isPose={index === poseAt}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** A host's points, which live in `part.points` rather than in the props. */
function Points({ cat, part }: { readonly cat: Catalog; readonly part: Part }): JSX.Element | null {
  const host =
    part.points !== null ||
    (Object.hasOwn(cat.parts, part.type) && cat.parts[part.type].props.includes(EPHEMERAL));
  if (!host) return null;
  const points = part.points ? [...part.points.values()] : [];
  return (
    <section class="properties-section">
      <h3>Points</h3>
      {points.length === 0 ? (
        <p class="muted">No points.</p>
      ) : (
        <ul class="point-list">
          {points.map((p) => (
            <li key={p.uuid} class="point-row">
              <span>{p.partName}</span> <code>{p.uuid}</code>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Info({ cat, doc, part }: PartProps): JSX.Element {
  const position = orderIndex(doc);
  const def = Object.hasOwn(cat.parts, part.type) ? cat.parts[part.type] : undefined;
  const approximate = ((posesSig.value.flags.get(part.id) ?? 0) & POSE_APPROX) !== 0;
  return (
    <section class="properties-section">
      <h3>Info</h3>
      <dl class="info-list">
        <dt>Type</dt>
        <dd>{part.type}</dd>
        <dt>Category</dt>
        <dd>{def?.category ?? 'Unknown'}</dd>
        <dt>Entry</dt>
        <dd>{`#${position.get(part.id)! + 1}`}</dd>
        <dt>Code</dt>
        <dd>{`${entryBytes(part, position)} chars`}</dd>
      </dl>
      {approximate && <p class="pose-approx">≈ approximate position</p>}
    </section>
  );
}

export function Properties(): JSX.Element {
  const cat = catalogSig.value;
  if (cat === null) {
    return (
      <div class="properties" data-app-undo>
        <p class="empty">Loading the catalog…</p>
      </div>
    );
  }
  const doc = withServoPreview(docSig.value);
  const selected = selectionSig.value.parts;
  const ids = doc.order.filter((id) => selected.has(id));
  if (ids.length === 0) {
    return (
      <div class="properties" data-app-undo>
        <p class="empty">Select parts to edit their properties.</p>
      </div>
    );
  }
  // The other props, connections, points and info are for a single part only.
  const single = ids.length === 1 ? doc.parts.get(ids[0])! : null;
  return (
    <div class="properties" data-app-undo>
      <Header doc={doc} ids={ids} />
      {collaborationReadOnlySig.value && (
        <p class="muted">View only — the host can grant editing permission.</p>
      )}
      <fieldset
        class="property-fields"
        disabled={servoPreviewSig.value !== null || collaborationReadOnlySig.value}
      >
        {unionProps(doc, cat, ids).map((row) => (
          <PropField
            key={row.key}
            cat={cat}
            row={row}
            ids={ids.filter((id) => visibleProperty(doc.parts.get(id)!.type, row.key))}
          />
        ))}
      </fieldset>
      {single && isServo(single.type) && <ServoControls key={single.id} id={single.id} />}
      {single && (
        <>
          <OtherProps cat={cat} doc={doc} part={single} />
          <Connections cat={cat} doc={doc} part={single} />
          <Points cat={cat} part={single} />
          <Info cat={cat} doc={doc} part={single} />
        </>
      )}
    </div>
  );
}
