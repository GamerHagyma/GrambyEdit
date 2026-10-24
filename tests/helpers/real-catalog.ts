import { inject } from 'vitest';
import type { Catalog } from '../../src/core/catalog-types';

let memo: Promise<Catalog> | null = null;

/** The real runtime catalog, built once per run by `tests/global-setup.ts`; one copy per test file. */
export function realCatalog(): Promise<Catalog> {
  return (memo ??= Promise.resolve(JSON.parse(inject('realCatalog')) as Catalog));
}
