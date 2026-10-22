// Share text in and out: the codec plus the import, with messages the user can read.
import type { DecodeError } from './codec';
import { decode, encode } from './codec';
import { fromEntries, toEntries } from './doc';
import type { Doc } from './types';

function decodeMessage(e: DecodeError): string {
  switch (e.kind) {
    case 'bad-base64':
      return `Not a valid share code: invalid base64 at character ${e.offset + 1}.`;
    case 'bad-utf8':
      return 'Not a valid share code: the decoded bytes are not UTF-8 text.';
    case 'bad-json':
      return `Not a valid share code: ${e.message}`;
    case 'not-an-array':
      return 'Not a valid share code: the data is not a list of parts.';
  }
}

/** Accepts a share code (wrapped, unpadded, URL-safe) or a raw JSON paste. */
export function parseShareText(
  text: string,
): { ok: true; doc: Doc } | { ok: false; message: string } {
  const decoded = decode(text);
  if (!decoded.ok) return { ok: false, message: decodeMessage(decoded.error) };
  const built = fromEntries(decoded.value);
  if (!built.ok) {
    return { ok: false, message: `Entry #${built.error.entry + 1}: ${built.error.reason}.` };
  }
  return { ok: true, doc: built.doc };
}

export function toShareCode(doc: Doc): string {
  return encode(toEntries(doc));
}
