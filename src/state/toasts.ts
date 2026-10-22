import { signal } from '@preact/signals';

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly kind: 'info' | 'warn' | 'error';
  readonly action?: { readonly label: string; run(): void };
}

const LIFETIME = { info: 4000, warn: 4000, error: 8000 } as const;
const MAX_SHOWN = 5;

export const toastsSig = signal<readonly Toast[]>([]);
let nextId = 1;

/** Shows a transient message: 4 s for info and warnings, 8 s for errors; at most five at once. */
export function toast(
  message: string,
  kind: Toast['kind'] = 'info',
  action?: Toast['action'],
): void {
  const t: Toast = { id: nextId++, message, kind, action };
  toastsSig.value = [...toastsSig.value, t].slice(-MAX_SHOWN);
  setTimeout(() => dismissToast(t.id), LIFETIME[kind]);
}

export function dismissToast(id: number): void {
  if (toastsSig.value.some((t) => t.id === id)) {
    toastsSig.value = toastsSig.value.filter((t) => t.id !== id);
  }
}
