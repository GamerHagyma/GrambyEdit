import { batch } from '@preact/signals';
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { loadAssets } from '../assets/load';
import { toast } from '../state/toasts';
import { assetsSig, baseCatalogSig } from '../state/store';
import { mountViewport } from '../viewport/index';
import { CREDITS } from './credits';
import './tokens.css';

export function App(): JSX.Element {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const unmount = mountViewport(viewport.current!);
    let alive = true;
    loadAssets()
      .then((assets) => {
        if (!alive) return;
        batch(() => {
          assetsSig.value = assets;
          baseCatalogSig.value = assets.catalog;
        });
      })
      .catch((e: unknown) => {
        if (alive) toast(`Could not load the part library: ${(e as Error).message}`, 'error');
      });
    return () => {
      alive = false;
      unmount();
    };
  }, []);
  return (
    <div class="app">
      <header class="top-bar">
        <span class="brand">GrambyEdit</span>
      </header>
      <main class="main">
        <div class="viewport" ref={viewport} />
      </main>
      <footer class="status-bar">
        <small class="credit">{CREDITS}</small>
      </footer>
    </div>
  );
}
