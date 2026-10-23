// A button that copies text to the clipboard and reads `Copied` for two seconds (spec §12.7).
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { toast } from '../../state/toasts';
import { Icon } from '../icons';

const FLASH_MS = 2_000;

export function CopyButton({ text, label }: { text: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  // No `await` before `writeText`, so the copy starts within the click itself.
  const copy = async () => {
    if (!navigator.clipboard) {
      toast('This browser cannot copy here.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch (e) {
      toast(`Could not copy: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <button class="button" onClick={copy}>
      <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied' : label}
    </button>
  );
}
