// The outliner (spec §13.2): the pose tree, search, group-by-type and the editor-only hide toggle.
import type { JSX } from 'preact';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { orderIndex } from '../../core/doc';
import { poseTree } from '../../core/graph';
import type { Doc, Issue, Part, PartId, Severity } from '../../core/types';
import { issuesSig } from '../../state/derived';
import { hiddenSig, select, selectionSig } from '../../state/selection';
import { docSig, viewBus } from '../../state/store';
import { Icon } from '../icons';
import { VirtualList } from '../widgets/VirtualList';

const ROW = 24;
/** Used when the list cannot be measured (jsdom reports every element as 0 px tall). */
const DEFAULT_HEIGHT = 600;
const INDENT_PX = 14;
/** Indentation stops at this depth, so a long pose chain keeps its rows on screen. */
const MAX_INDENT_LEVEL = 24;

const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
const LEVEL: Record<Severity, string> = { error: 'bad', warning: 'warn', info: 'info' };

type Item =
  | {
      readonly kind: 'part';
      readonly id: PartId;
      readonly depth: number;
      readonly open: boolean | null;
    }
  | { readonly kind: 'heading'; readonly type: string; readonly count: number };

/** A copy of `set` with `id` added, or removed when it is already in it. */
function toggled<T>(set: ReadonlySet<T>, id: T): Set<T> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Keeps a click or double-click on a row's button from reaching the row. */
const stopBubbling = (e: Event): void => e.stopPropagation();

/** The pose tree depth first. The children of a collapsed part are left out. */
function treeItems(doc: Doc, collapsed: ReadonlySet<PartId>): Item[] {
  const { roots, children } = poseTree(doc);
  const items: Item[] = [];
  const stack = roots.map((id): [PartId, number] => [id, 0]).reverse();
  while (stack.length > 0) {
    const [id, depth] = stack.pop()!;
    const kids = children.get(id) ?? [];
    const open = kids.length > 0 ? !collapsed.has(id) : null;
    items.push({ kind: 'part', id, depth, open });
    if (open) {
      for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i], depth + 1]);
    }
  }
  return items;
}

/** Parts grouped by type, largest group first as in the Stats panel, each in export order. */
function groupItems(doc: Doc): Item[] {
  const groups = new Map<string, PartId[]>();
  for (const id of doc.order) {
    const type = doc.parts.get(id)!.type;
    const ids = groups.get(type);
    if (ids) ids.push(id);
    else groups.set(type, [id]);
  }
  const items: Item[] = [];
  const sorted = [...groups].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
  for (const [type, ids] of sorted) {
    items.push({ kind: 'heading', type, count: ids.length });
    for (const id of ids) items.push({ kind: 'part', id, depth: 0, open: null });
  }
  return items;
}

/** A flat list: the parts whose type contains `query`, or for `#<n>` the part at that 1-based index. */
function searchItems(doc: Doc, query: string): Item[] {
  const position = orderIndex(doc);
  const index = /^#(\d+)$/.exec(query);
  const text = query.toLowerCase();
  const items: Item[] = [];
  for (const id of doc.order) {
    const hit = index
      ? position.get(id)! + 1 === Number(index[1])
      : doc.parts.get(id)!.type.toLowerCase().includes(text);
    if (hit) items.push({ kind: 'part', id, depth: 0, open: null });
  }
  return items;
}

/** Per part: how many issues name it, and the most severe of them. */
function badgesOf(issues: readonly Issue[]): Map<PartId, { count: number; severity: Severity }> {
  const badges = new Map<PartId, { count: number; severity: Severity }>();
  for (const issue of issues) {
    for (const id of new Set(issue.parts)) {
      const prev = badges.get(id);
      const severity =
        prev && RANK[prev.severity] < RANK[issue.severity] ? prev.severity : issue.severity;
      badges.set(id, { count: (prev?.count ?? 0) + 1, severity });
    }
  }
  return badges;
}

/** The part's `RGB` prop as a CSS colour, when it is a triple of numbers. */
function colorOf(part: Part): string | null {
  const rgb = part.props.RGB;
  return Array.isArray(rgb) && rgb.length === 3 && rgb.every((c) => typeof c === 'number')
    ? `rgb(${rgb.join(', ')})`
    : null;
}

export function Outliner(): JSX.Element {
  const doc = docSig.value;
  const hidden = hiddenSig.value;
  const selected = selectionSig.value.parts;
  const issues = issuesSig.value;
  const [query, setQuery] = useState('');
  const [grouped, setGrouped] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<PartId>>(() => new Set());
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const body = useRef<HTMLDivElement>(null);
  const text = query.trim();

  const items = useMemo(() => {
    if (text !== '') return searchItems(doc, text);
    return grouped ? groupItems(doc) : treeItems(doc, collapsed);
  }, [doc, text, grouped, collapsed]);
  const badges = useMemo(() => badgesOf(issues), [issues]);
  const position = orderIndex(doc);

  // The list takes its container's height, or the default when the container cannot be measured.
  useLayoutEffect(() => {
    const measure = () => {
      const px = body.current?.clientHeight ?? 0;
      setHeight(px > 0 ? px : DEFAULT_HEIGHT);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const renderItem = (item: Item): JSX.Element => {
    if (item.kind === 'heading') {
      return (
        <div class="tree-heading" role="presentation">
          <span>{item.type}</span>
          <span class="muted">{item.count}</span>
        </div>
      );
    }
    const { id, depth, open } = item;
    const part = doc.parts.get(id)!;
    const index = position.get(id)! + 1;
    const label = `${part.type} #${index}`;
    const isSelected = selected.has(id);
    const isHidden = hidden.has(id);
    const badge = badges.get(id);
    const color = colorOf(part);
    return (
      <div
        role="treeitem"
        class={isSelected ? 'tree-row selected' : 'tree-row'}
        aria-level={depth + 1}
        aria-selected={isSelected}
        aria-expanded={open ?? undefined}
        tabIndex={0}
        style={{ paddingLeft: `${Math.min(depth, MAX_INDENT_LEVEL) * INDENT_PX}px` }}
        onClick={(e) => select([id], e.shiftKey ? 'add' : 'replace')}
        onDblClick={() => {
          select([id], 'replace');
          viewBus.emit({ kind: 'frame-selection' });
        }}
        onKeyDown={(e) => {
          // Enter on a button inside the row acts on that button only.
          if (e.key === 'Enter' && e.target === e.currentTarget) select([id], 'replace');
        }}
      >
        {open === null ? (
          <span class="tree-disclosure" />
        ) : (
          <button
            class="icon-button tree-disclosure"
            aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((prev) => toggled(prev, id));
            }}
            onDblClick={stopBubbling}
          >
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
          </button>
        )}
        {color && <span class="tree-color" style={{ background: color }} />}
        <span class="tree-type">{part.type}</span>
        <span class="tree-index muted">#{index}</span>
        {badge && (
          <span
            class={`tree-badge ${LEVEL[badge.severity]}`}
            title={`${badge.count} issue${badge.count === 1 ? '' : 's'}`}
          >
            {badge.count}
          </span>
        )}
        <button
          class="icon-button tree-eye"
          aria-label={`Hide ${label}`}
          aria-pressed={isHidden}
          title={isHidden ? 'Show in viewport' : 'Hide in viewport'}
          onClick={(e) => {
            e.stopPropagation();
            hiddenSig.value = toggled(hiddenSig.value, id);
          }}
          onDblClick={stopBubbling}
        >
          <Icon name={isHidden ? 'eye-off' : 'eye'} size={14} />
        </button>
      </div>
    );
  };

  return (
    <div class="outliner">
      <div class="outliner-bar">
        <input
          type="search"
          aria-label="Search parts"
          placeholder="Type or #index"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        <button class="button" aria-pressed={grouped} onClick={() => setGrouped(!grouped)}>
          Group by type
        </button>
      </div>
      <div
        class="outliner-body"
        role="tree"
        aria-label="Parts"
        aria-multiselectable="true"
        ref={body}
      >
        {items.length === 0 ? (
          <p class="empty">{text === '' ? 'No parts yet' : 'No matches'}</p>
        ) : (
          <VirtualList items={items} rowHeight={ROW} height={height} render={renderItem} />
        )}
      </div>
    </div>
  );
}
