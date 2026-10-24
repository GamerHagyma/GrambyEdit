// Builds the real catalog once per test run. `realCatalog()` reads it with `inject`, so test files no
// longer each spend seconds rebuilding it, which timed tests out when the whole suite ran at once.
import { buildAssets } from '../scripts/build-assets';

export default async function setup(project: {
  provide(key: 'realCatalog', value: string): void;
}): Promise<void> {
  const { catalog } = await buildAssets({ root: '.', outDir: null });
  project.provide('realCatalog', JSON.stringify(catalog));
}

declare module 'vitest' {
  export interface ProvidedContext {
    realCatalog: string;
  }
}
