import type { JSX } from 'preact';
import { dismissToast, toastsSig } from '../../state/toasts';
import { Icon } from '../icons';

export function Toasts(): JSX.Element {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toastsSig.value.map((t) => (
        <div key={t.id} class={`toast toast-${t.kind}`}>
          <span>{t.message}</span>
          {t.action && (
            <button
              class="link-button"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button class="icon-button" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <Icon name="x" />
          </button>
        </div>
      ))}
    </div>
  );
}
