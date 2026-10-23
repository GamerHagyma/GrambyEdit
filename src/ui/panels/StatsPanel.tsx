// Type counts and shares of parts and code (spec §13.4).
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { formatPercent } from '../../core/size';
import type { BuildStats } from '../../core/stats';
import { sizeSig, statsSig } from '../../state/derived';
import { select } from '../../state/selection';
import { docSig } from '../../state/store';
import { toast } from '../../state/toasts';

/** One `type, count, % of parts, % of code` line per type, tab-separated, without a header. */
function statsText(stats: BuildStats, jsonBytes: number): string {
  return stats.types
    .map((t) =>
      [
        t.type,
        t.count,
        formatPercent(t.count, stats.parts),
        formatPercent(t.codeBytes, jsonBytes),
      ].join('\t'),
    )
    .join('\n');
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied the type table');
  } catch (e) {
    toast(`Could not copy: ${(e as Error).message}`, 'error');
  }
}

/** Selects every part of `type`. `add` keeps the current selection (Shift+click). */
function selectType(type: string, add: boolean): void {
  const doc = docSig.value;
  select(
    doc.order.filter((id) => doc.parts.get(id)!.type === type),
    add ? 'add' : 'replace',
  );
}

type SortBy = 'type' | 'count' | 'code';
type Sort = { by: SortBy; desc: boolean };

/** A column header that sorts by its key; clicking it again flips the direction. */
function SortHeader({
  label,
  by,
  sort,
  onSort,
}: {
  label: string;
  by: SortBy;
  sort: Sort;
  onSort(s: Sort): void;
}): JSX.Element {
  const active = sort.by === by;
  return (
    <th scope="col" aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button
        class="sort-header"
        onClick={() => onSort({ by, desc: active ? !sort.desc : by !== 'type' })}
      >
        {label}
        {active ? (sort.desc ? ' ▾' : ' ▴') : ''}
      </button>
    </th>
  );
}

export function StatsPanel(): JSX.Element {
  const stats = statsSig.value;
  const { jsonBytes } = sizeSig.value;
  const [sort, setSort] = useState<Sort>({ by: 'count', desc: true });
  const sorted = [...stats.types].sort((a, b) => {
    const d =
      sort.by === 'type'
        ? a.type.localeCompare(b.type)
        : sort.by === 'count'
          ? a.count - b.count
          : a.codeBytes - b.codeBytes;
    return sort.desc ? -d : d;
  });
  return (
    <div class="stats">
      {stats.types.length === 0 ? (
        <p class="empty">No parts yet</p>
      ) : (
        <table class="stats-table">
          <thead>
            <tr>
              <SortHeader label="Type" by="type" sort={sort} onSort={setSort} />
              <SortHeader label="Count" by="count" sort={sort} onSort={setSort} />
              <SortHeader label="% of parts" by="count" sort={sort} onSort={setSort} />
              <SortHeader label="% of code" by="code" sort={sort} onSort={setSort} />
              <th scope="col">
                <span class="visually-hidden">Share</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr
                key={t.type}
                class="stats-row"
                tabIndex={0}
                onClick={(e) => selectType(t.type, e.shiftKey)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') selectType(t.type, false);
                }}
              >
                <td>{t.type}</td>
                <td class="num">{t.count}</td>
                <td class="num">{formatPercent(t.count, stats.parts)}</td>
                <td class="num">{formatPercent(t.codeBytes, jsonBytes)}</td>
                <td>
                  <span class="stat-bar">
                    <span style={{ width: `${t.partsPercent}%` }} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class="stats-foot">
        Parts {stats.parts} · Joints {stats.joints} · Points {stats.points} · Roots {stats.roots}
      </p>
      <button class="button" onClick={() => copyText(statsText(stats, jsonBytes))}>
        Copy as text
      </button>
    </div>
  );
}
