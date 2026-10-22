import { readFileSync } from 'node:fs';

let cache: string[] | null = null;

function decodesToArray(code: string): boolean {
  try {
    return Array.isArray(JSON.parse(Buffer.from(code, 'base64').toString('utf8')));
  } catch {
    return false;
  }
}

/** The 185 sharecodes in data/corpus/wiki_codes.txt that decode to a JSON array. */
export function corpusCodes(): string[] {
  cache ??= readFileSync(new URL('../../data/corpus/wiki_codes.txt', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && decodesToArray(line));
  return [...cache];
}
