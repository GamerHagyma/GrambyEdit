// Share-code import and export for the dialogs (spec §6.3, §13.7). Reads the store, commits nothing.
import { validate } from '../core/rules';
import { parseShareText, toShareCode } from '../core/share';
import { codeSize } from '../core/size';
import { buildStats } from '../core/stats';
import type { Doc, Issue } from '../core/types';
import { isServo } from '../core/servo-simulation';
import { withServoPreview } from './servo-preview';
import { settingsSig } from './settings';
import { catalogSig, docSig } from './store';

const PREVIEW_CHARS = 200;

export interface ImportSummary {
  readonly parts: number;
  readonly types: number;
  readonly errors: number;
  readonly warnings: number;
}

/**
 * Parses pasted text (a share code, wrapped or not, or raw JSON) and counts what the build would
 * show. Issues are counted by validating the parsed build; with no catalog loaded, none are counted.
 */
export function importText(
  text: string,
): { ok: true; doc: Doc; summary: ImportSummary } | { ok: false; message: string } {
  const parsed = parseShareText(text);
  if (!parsed.ok) return parsed;
  const { doc } = parsed;
  const catalog = catalogSig.value;
  const issues = catalog
    ? validate(doc, catalog, settingsSig.value.limits, codeSize(doc).base64Chars)
    : [];
  const stats = buildStats(doc);
  return {
    ok: true,
    doc,
    summary: {
      parts: stats.parts,
      types: stats.types.length,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
  };
}

/** The current build as a share code, with its issues. */
export function exportCurrent(
  includeRotation = true,
  source = withServoPreview(docSig.value),
): { doc: Doc; code: string; issues: Issue[] } {
  let doc = source;
  if (!includeRotation) {
    const parts = new Map(source.parts);
    for (const [id, part] of parts) {
      if (!isServo(part.type) || !Object.hasOwn(part.props, 'Rotation')) continue;
      const props = { ...part.props };
      delete props.Rotation;
      parts.set(id, { ...part, props });
    }
    doc = { ...source, parts };
  }
  const code = toShareCode(doc);
  const cat = catalogSig.value;
  const issues = cat ? validate(doc, cat, settingsSig.value.limits, code.length) : [];
  return { doc, code, issues };
}

/** Codes over 400 characters show their first and last 200 characters only; the DOM never holds a whole code. */
export function codePreview(code: string): string {
  return code.length > 2 * PREVIEW_CHARS
    ? `${code.slice(0, PREVIEW_CHARS)} … ${code.slice(-PREVIEW_CHARS)}`
    : code;
}
