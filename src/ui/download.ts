// Saving text as a file: a temporary object URL on a hidden link, revoked once the download has started.
import { toast } from '../state/toasts';

export function downloadText(name: string, text: string, type: string): void {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  } catch (e) {
    toast(`Download failed: ${(e as Error).message}`, 'error');
  }
}

/** The local date as yyyy-mm-dd, for file names. */
export function dateStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
