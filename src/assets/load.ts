// Loads the runtime assets written by `npm run assets` (spec §5) from the site's own origin.
import type { Catalog, Manifest } from '../core/catalog-types';
import type { Assets } from './geometry';

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status}).`);
  return res;
}

/**
 * Fetches `version.txt` uncached, then the catalog, manifest and mesh pack keyed by that version,
 * so a new deploy never mixes with stale cached files.
 */
export async function loadAssets(baseUrl: string = import.meta.env.BASE_URL): Promise<Assets> {
  const dir = `${baseUrl}assets/`;
  const version = (await (await fetchOk(`${dir}version.txt`, { cache: 'no-cache' })).text()).trim();
  const q = `?v=${encodeURIComponent(version)}`;
  const [catalog, manifest, bin] = await Promise.all([
    fetchOk(`${dir}catalog.json${q}`).then((r) => r.json() as Promise<Catalog>),
    fetchOk(`${dir}parts.json${q}`).then((r) => r.json() as Promise<Manifest>),
    fetchOk(`${dir}parts.bin${q}`).then((r) => r.arrayBuffer()),
  ]);
  if (catalog.version !== version || manifest.version !== version) {
    throw new Error('The editor assets are out of sync; reload the page.');
  }
  return { catalog, manifest, bin };
}
