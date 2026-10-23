// The validation issues, grouped by severity (spec §13.6). Some issues offer a quick fix, one undoable edit each.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { graphIndex } from '../../core/graph';
import { detach, removeConn } from '../../core/ops/conns';
import { deletePoint } from '../../core/ops/points';
import type { Doc, Issue, PartId, Severity, SocketId } from '../../core/types';
import { issuesSig, posesSig } from '../../state/derived';
import { select } from '../../state/selection';
import { catalogSig, commit, docSig } from '../../state/store';
import { Icon, type IconName } from '../icons';

interface Group {
  readonly severity: Severity;
  readonly heading: string;
  /** The CSS level class: `bad`, `warn` or `info`. */
  readonly level: string;
  readonly icon: IconName;
}

const GROUPS: readonly Group[] = [
  { severity: 'error', heading: 'Errors', level: 'bad', icon: 'error' },
  { severity: 'warning', heading: 'Warnings', level: 'warn', icon: 'warn' },
  { severity: 'info', heading: 'Info', level: 'info', icon: 'info' },
];

function IssueRow({ issue, group }: { issue: Issue; group: Group }): JSX.Element {
  const content = (
    <>
      <Icon name={group.icon} size={14} />
      <span class="issue-message">{issue.message}</span>
      <code class="issue-code">{issue.code}</code>
    </>
  );
  // An issue about the whole build names no parts, so there is nothing to select.
  if (issue.parts.length === 0) return <div class={`issue-row ${group.level}`}>{content}</div>;
  return (
    <button class={`issue-row ${group.level}`} onClick={() => select(issue.parts, 'replace')}>
      {content}
    </button>
  );
}

/** A joint's conn: the owner part and its index in the owner's `conns`. */
interface ConnRef {
  readonly owner: PartId;
  readonly index: number;
}

/**
 * Per part, the later joint (in export order) on its first socket that more than one joint lands on.
 * A socket conn lands on its owner's socket and on its target's socket, as in the E-MATE check.
 */
function extraJoints(doc: Doc): Map<PartId, ConnRef> {
  const onSocket = new Map<string, { part: PartId; refs: ConnRef[] }>();
  const land = (part: PartId, socket: SocketId, ref: ConnRef): void => {
    const key = `${part}:${socket}`;
    const entry = onSocket.get(key);
    if (entry === undefined) onSocket.set(key, { part, refs: [ref] });
    else entry.refs.push(ref);
  };
  for (const owner of doc.order) {
    doc.parts.get(owner)!.conns.forEach((conn, index) => {
      const { target } = conn;
      if (target.kind !== 'socket') return;
      land(owner, conn.self, { owner, index });
      land(target.part, target.socket, { owner, index });
    });
  }
  const out = new Map<PartId, ConnRef>();
  for (const { part, refs } of onSocket.values()) {
    if (refs.length > 1 && !out.has(part)) out.set(part, refs[refs.length - 1]);
  }
  return out;
}

/** Removes every point of `host` that no conn mounts on, in one commit. */
function removeUnusedPoints(host: PartId): void {
  const doc = docSig.value;
  const { pointUsers } = graphIndex(doc);
  const unused = [...(doc.parts.get(host)?.points?.keys() ?? [])].filter(
    (uuid) => !pointUsers.has(`${host}:${uuid}`),
  );
  if (unused.length === 0) return;
  commit('Remove unused points', (d) => {
    for (const uuid of unused) deletePoint(d, host, uuid, 'detach', posesSig.value);
  });
}

/** Removes the later joint of `part` that `extraJoints` names, in one commit. */
function removeJoint(part: PartId): void {
  const ref = extraJoints(docSig.value).get(part);
  if (ref === undefined) return;
  const { owner, index } = ref;
  commit('Remove joint', (d) => {
    const conns = d.get(owner)!.conns;
    // removeConn refuses the pose conn (the first socket or point conn): detach drops it and re-poses the part.
    const pose = conns.findIndex((c) => c.target.kind === 'socket' || c.target.kind === 'point');
    if (index === pose) detach(d, owner, posesSig.value);
    else removeConn(d, owner, index);
  });
}

interface QuickFix {
  readonly label: string;
  run(): void;
}

/** The quick fix an issue offers, or null. */
function quickFix(issue: Issue, joints: ReadonlyMap<PartId, ConnRef>): QuickFix | null {
  const part = issue.parts[0];
  if (issue.code === 'I-POINT-UNUSED') {
    return { label: 'Remove point', run: () => removeUnusedPoints(part) };
  }
  if (issue.code === 'E-MATE' && joints.has(part)) {
    return { label: 'Remove this joint', run: () => removeJoint(part) };
  }
  return null;
}

/** Issues listed per group before "Show all". */
const LIST_CAP = 200;

/**
 * Clicking an issue selects the parts it names. A quick fix sits beside that row, not inside it,
 * so clicking it selects nothing.
 */
export function IssuesPanel(): JSX.Element {
  const issues = issuesSig.value;
  // A damaged 16K build can raise thousands of issues: each group lists the first few hundred.
  const [expanded, setExpanded] = useState<ReadonlySet<Severity>>(() => new Set());
  // Issues are computed against the part library, so without it an empty list would wrongly read as clean.
  if (catalogSig.value === null) {
    return <p class="empty">Issues appear once the part library loads</p>;
  }
  if (issues.length === 0) return <p class="empty">No issues</p>;
  const joints = extraJoints(docSig.value);
  return (
    <div class="issues">
      {GROUPS.map((group) => {
        const items = issues.filter((issue) => issue.severity === group.severity);
        if (items.length === 0) return null;
        const shown = expanded.has(group.severity) ? items : items.slice(0, LIST_CAP);
        return (
          <section key={group.severity} class="issue-group">
            <h3>
              {group.heading} ({items.length})
            </h3>
            <ul class="issue-list">
              {shown.map((issue, i) => {
                const fix = quickFix(issue, joints);
                return (
                  <li key={i}>
                    <IssueRow issue={issue} group={group} />
                    {fix !== null && (
                      <button class="button small issue-fix" onClick={() => fix.run()}>
                        {fix.label}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {shown.length < items.length && (
              <button
                class="button small"
                onClick={() => setExpanded(new Set([...expanded, group.severity]))}
              >
                {`Show all ${items.length.toLocaleString('en-US')}`}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
