// Part search (spec §13.1): case-insensitive subsequence matching, with bonuses for prefixes and word starts.
import type { PartDef } from '../../core/catalog-types';

/** 0 when `query` is not a subsequence of `text`; higher is better. The empty query matches with 1. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (q === '') return 1;
  const lower = text.toLowerCase();
  let score = 0;
  let from = 0;
  let prev = -2;
  for (const ch of q) {
    const at = lower.indexOf(ch, from);
    if (at < 0) return 0;
    score += 1;
    if (at === 0) score += 8;
    else if (isWordStart(text, at)) score += 4;
    if (at === prev + 1) score += 2;
    prev = at;
    from = at + 1;
  }
  return score;
}

/** After a separator, or at a camelCase hump such as the B in ConnectorBall. */
function isWordStart(text: string, at: number): boolean {
  const before = text[at - 1];
  return !/[A-Za-z0-9]/.test(before) || (/[A-Z]/.test(text[at]) && /[a-z]/.test(before));
}

/** The best score of the query over a part's type, game tooltip and category. */
export function partScore(part: PartDef, query: string): number {
  return Math.max(
    fuzzyScore(query, part.type),
    fuzzyScore(query, part.tooltip ?? ''),
    fuzzyScore(query, part.category),
    part.type === 'Bearing' ? fuzzyScore(query, 'Spinner') : 0,
  );
}

/** The parts that match `query`, best first; equal scores keep type order. An empty query lists them all. */
export function rankParts(parts: readonly PartDef[], query: string): PartDef[] {
  return parts
    .map((part) => ({ part, score: partScore(part, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.part.type.localeCompare(b.part.type))
    .map((r) => r.part);
}
