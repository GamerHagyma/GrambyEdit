// Share-code codec (spec §6.3): base64 over UTF-8 JSON. Table-driven, so 8 M-char codes stay fast.
import type { Json } from './types';

export type DecodeError =
  | { kind: 'bad-base64'; offset: number }
  | { kind: 'bad-utf8' }
  | { kind: 'bad-json'; message: string }
  | { kind: 'not-an-array' };

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PAD = '='.charCodeAt(0);
const INVALID = 0xff;

/** ASCII code to 6-bit value; the URL-safe `-` and `_` decode as `+` and `/`. */
const DECODE = new Uint8Array(256).fill(INVALID);
for (let i = 0; i < 64; i++) DECODE[ALPHABET.charCodeAt(i)] = i;
DECODE['-'.charCodeAt(0)] = 62;
DECODE['_'.charCodeAt(0)] = 63;

/** 6-bit value to ASCII code. */
const ENCODE = Uint8Array.from(ALPHABET, (ch) => ch.charCodeAt(0));

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true });
const WHITESPACE = /\s/;

/** Index in `text` of its `k`-th non-whitespace character, so error offsets match what the user pasted. */
function sourceOffset(text: string, k: number): number {
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (WHITESPACE.test(text[i])) continue;
    if (seen === k) return i;
    seen++;
  }
  return text.length;
}

function badBase64(text: string, k: number): { ok: false; error: DecodeError } {
  return { ok: false, error: { kind: 'bad-base64', offset: sourceOffset(text, k) } };
}

/** Accepts a share code (wrapped, unpadded or URL-safe) or a raw JSON paste that starts with `[`. */
export function decode(
  text: string,
): { ok: true; value: Json[] } | { ok: false; error: DecodeError } {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    try {
      return { ok: true, value: JSON.parse(trimmed) };
    } catch (e) {
      return { ok: false, error: { kind: 'bad-json', message: (e as Error).message } };
    }
  }

  const s = text.replace(/\s+/g, '');
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === PAD) end--;

  // Six bits per character; a byte is complete every 8 bits, so the buffer is exactly full at the end.
  const bytes = new Uint8Array(Math.floor((end * 3) / 4));
  let n = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < end; i++) {
    const c = s.charCodeAt(i);
    const v = c < 256 ? DECODE[c] : INVALID;
    if (v === INVALID) return badBase64(text, i);
    acc = ((acc << 6) | v) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[n++] = (acc >> bits) & 0xff;
    }
  }
  if (end % 4 === 1) return badBase64(text, end - 1);

  let json: string;
  try {
    json = STRICT_UTF8.decode(bytes);
  } catch {
    return { ok: false, error: { kind: 'bad-utf8' } };
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: { kind: 'bad-json', message: (e as Error).message } };
  }
  return Array.isArray(value)
    ? { ok: true, value }
    : { ok: false, error: { kind: 'not-an-array' } };
}

/** Compact JSON, UTF-8, then standard base64 with `=` padding. Never `btoa`: it fails on large input. */
export function encode(entries: readonly Json[]): string {
  const bytes = TEXT_ENCODER.encode(JSON.stringify(entries));
  const n = bytes.length;
  const out = new Uint8Array(Math.ceil(n / 3) * 4);
  let o = 0;
  let i = 0;
  for (; i + 3 <= n; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out[o++] = ENCODE[v >> 18];
    out[o++] = ENCODE[(v >> 12) & 63];
    out[o++] = ENCODE[(v >> 6) & 63];
    out[o++] = ENCODE[v & 63];
  }
  const rest = n - i;
  if (rest > 0) {
    const v = (bytes[i] << 16) | ((rest === 2 ? bytes[i + 1] : 0) << 8);
    out[o++] = ENCODE[v >> 18];
    out[o++] = ENCODE[(v >> 12) & 63];
    out[o++] = rest === 2 ? ENCODE[(v >> 6) & 63] : PAD;
    out[o++] = PAD;
  }
  // The output is pure ASCII, which is valid UTF-8, so one decode turns the whole buffer into a string.
  return TEXT_DECODER.decode(out);
}

export function utf8Length(s: string): number {
  return TEXT_ENCODER.encode(s).length;
}
