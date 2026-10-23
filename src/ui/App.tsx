import { batch, effect } from '@preact/signals';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { loadAssets } from '../assets/load';
import { settingsSig } from '../state/settings';
import { assetsSig, baseCatalogSig, socketOverridesSig } from '../state/store';
import { toast } from '../state/toasts';
import { setStorageErrorReporter } from '../storage/prefs';
import { loadSocketOverrides } from '../storage/sockets';
import { Shell } from './layout/Shell';
import './tokens.css';

export function App(): JSX.Element {
  useEffect(() => {
    setStorageErrorReporter((message) => toast(message, 'error'));
    const stopTheme = effect(() => {
      document.documentElement.dataset.theme = settingsSig.value.theme;
    });
    let alive = true;
    loadSocketOverrides().then((file) => {
      if (alive) socketOverridesSig.value = file;
    });
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
      stopTheme();
    };
  }, []);
  return <Shell />;
}
