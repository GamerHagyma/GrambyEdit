// The validation issues, grouped by severity (spec §13.6).
import type { JSX } from 'preact';
import type { Issue, Severity } from '../../core/types';
import { issuesSig } from '../../state/derived';
import { select } from '../../state/selection';
import { catalogSig } from '../../state/store';
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

/** Clicking an issue selects the parts it names. */
export function IssuesPanel(): JSX.Element {
  const issues = issuesSig.value;
  // Issues are computed against the part library, so without it an empty list would wrongly read as clean.
  if (catalogSig.value === null) {
    return <p class="empty">Issues appear once the part library loads</p>;
  }
  if (issues.length === 0) return <p class="empty">No issues</p>;
  return (
    <div class="issues">
      {GROUPS.map((group) => {
        const items = issues.filter((issue) => issue.severity === group.severity);
        if (items.length === 0) return null;
        return (
          <section key={group.severity} class="issue-group">
            <h3>
              {group.heading} ({items.length})
            </h3>
            <ul class="issue-list">
              {items.map((issue, i) => (
                <li key={i}>
                  <IssueRow issue={issue} group={group} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
