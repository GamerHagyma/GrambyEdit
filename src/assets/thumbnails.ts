// Part thumbnails (spec §13.1): each type is rendered once per catalog version and cached in IndexedDB 'thumbs'.
// The viewport registers the WebGL renderer at mount; until then an uncached thumbnail rejects.
import { toast } from '../state/toasts';
import { idbGet, idbPut } from '../storage/idb';

export type ThumbRenderer = (type: string) => Promise<Blob>;

let renderer: ThumbRenderer | null = null;
/** One object URL per cache key for the page's lifetime; a failed entry is removed so it can retry. */
const urls = new Map<string, Promise<string>>();
let cacheWarned = false;

export function setThumbnailRenderer(r: ThumbRenderer): void {
  renderer = r;
}

/** A failed cache call falls back to rendering without the cache; the user hears about it once. */
function cacheFailed(e: unknown): undefined {
  if (!cacheWarned) {
    cacheWarned = true;
    toast(e instanceof Error ? e.message : 'Browser storage failed.', 'warn');
  }
  return undefined;
}

async function blobFor(type: string, key: string): Promise<Blob> {
  const cached = await idbGet<Blob>('thumbs', key).catch(cacheFailed);
  if (cached) return cached;
  if (!renderer) throw new Error('No thumbnail renderer is registered yet.');
  const blob = await renderer(type);
  await idbPut('thumbs', blob, key).catch(cacheFailed);
  return blob;
}

/** An object URL for a part's thumbnail. Rejects when it is neither cached nor renderable yet. */
export function thumbnailUrl(type: string, version: string): Promise<string> {
  const key = `${version}:${type}`;
  let url = urls.get(key);
  if (url === undefined) {
    url = blobFor(type, key).then((blob) => URL.createObjectURL(blob));
    urls.set(key, url);
    url.catch(() => urls.delete(key));
  }
  return url;
}
