// Favourites (the ★ section, reorderable) and recents (newest first), kept in localStorage (spec §13.1).
import { signal } from '@preact/signals';
import { loadPref, savePref } from '../storage/prefs';

const RECENT_MAX = 12;

/** Stored lists are untrusted: anything that is not an array of strings reads as empty. */
const strings = (raw: unknown): string[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((t): t is string => typeof t === 'string'))] : [];

export const favouritesSig = signal<readonly string[]>(
  strings(loadPref<unknown>('favourites', [])),
);
export const recentsSig = signal<readonly string[]>(
  strings(loadPref<unknown>('recents', [])).slice(0, RECENT_MAX),
);

function setFavourites(next: readonly string[]): void {
  favouritesSig.value = next;
  savePref('favourites', next);
}

export function toggleFavourite(type: string): void {
  const list = favouritesSig.value;
  setFavourites(list.includes(type) ? list.filter((t) => t !== type) : [...list, type]);
}

/** Moves a favourite to `toIndex` in the new list (clamped). A type that is not a favourite is left alone. */
export function moveFavourite(type: string, toIndex: number): void {
  const list = favouritesSig.value;
  if (!list.includes(type)) return;
  const rest = list.filter((t) => t !== type);
  const at = Math.min(Math.max(0, toIndex), rest.length);
  setFavourites([...rest.slice(0, at), type, ...rest.slice(at)]);
}

/** Puts a part type at the front of the recents, dropping its earlier entry. */
export function pushRecent(type: string): void {
  const next = [type, ...recentsSig.value.filter((t) => t !== type)].slice(0, RECENT_MAX);
  recentsSig.value = next;
  savePref('recents', next);
}
