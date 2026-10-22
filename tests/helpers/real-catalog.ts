import { buildAssets } from '../../scripts/build-assets';
import type { Catalog } from '../../src/core/catalog-types';

let memo: Promise<Catalog> | null = null;

/** The real runtime catalog, built once per test file. */
export function realCatalog(): Promise<Catalog> {
  return (memo ??= buildAssets({ root: '.', outDir: null }).then((r) => r.catalog));
}
