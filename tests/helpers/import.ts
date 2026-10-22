import { parseShareText } from '../../src/core/share';
import type { Doc } from '../../src/core/types';

/** Imports a share code or raw JSON paste; throws with the user-facing message on failure. */
export function importCode(code: string): Doc {
  const r = parseShareText(code);
  if (!r.ok) throw new Error(r.message);
  return r.doc;
}
