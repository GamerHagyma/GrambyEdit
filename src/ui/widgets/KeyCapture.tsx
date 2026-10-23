// Press-a-key capture (spec §13.3): once armed, the next key pressed is written as its Roblox KeyCode name.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { robloxKeyName } from '../../core/propview';

export interface KeyCaptureProps {
  readonly id: string;
  /** The current key name; null when unset or mixed. */
  readonly value: string | null;
  readonly placeholder: string;
  onCommit(name: string): void;
}

export function KeyCapture({ id, value, placeholder, onCommit }: KeyCaptureProps): JSX.Element {
  const [armed, setArmed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // The listener is attached once per arming, so it reads the latest callback through this ref.
  const latest = useRef(onCommit);
  latest.current = onCommit;

  useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent): void => {
      // Taken before the page sees it, so a key that is also a shortcut is only captured.
      e.preventDefault();
      e.stopPropagation();
      const name = robloxKeyName(e.code);
      if (name === null) return;
      setArmed(false);
      button.current?.blur();
      latest.current(name);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [armed]);

  return (
    <button
      ref={button}
      id={id}
      type="button"
      class={armed ? 'key-capture armed' : 'key-capture'}
      onClick={() => setArmed(true)}
      onBlur={() => setArmed(false)}
    >
      {armed ? 'Press a key…' : (value ?? placeholder)}
    </button>
  );
}
