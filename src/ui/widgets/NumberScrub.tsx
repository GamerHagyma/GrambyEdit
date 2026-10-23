// A numeric field that also drag-scrubs (spec §13.3): one step per 4 px of horizontal drag, ten steps
// with Shift. Typing commits on blur or Enter. A drag commits once, when the pointer is released.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

const PX_PER_STEP = 4;
const SHIFT_STEPS = 10;

export interface NumberScrubProps {
  readonly id: string;
  /** The shared value; null when unset or mixed. */
  readonly value: number | null;
  readonly placeholder: string;
  readonly step: number;
  readonly min?: number;
  readonly max?: number;
  /** Only whole numbers are accepted, typed or scrubbed. */
  readonly integer?: boolean;
  onCommit(value: number): void;
}

const decimalsOf = (step: number): number => (String(step).split('.')[1] ?? '').length;

export function NumberScrub({
  id,
  value,
  placeholder,
  step,
  min,
  max,
  integer = false,
  onCommit,
}: NumberScrubProps): JSX.Element {
  // The text being typed or scrubbed; null shows the committed value.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const snap = (v: number): number =>
    integer ? Math.round(v) : Number(v.toFixed(decimalsOf(step)));
  const parse = (text: string): number | null => {
    if (text.trim() === '') return null;
    const v = Number(text);
    if (!Number.isFinite(v) || (integer && !Number.isInteger(v))) return null;
    return clamp(v);
  };

  const scrub = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const origin = value ?? 0;
    let moved = false;
    let last = origin;
    const move = (m: PointerEvent): void => {
      if (m.clientX !== startX) moved = true;
      if (!moved) return;
      const steps = Math.trunc((m.clientX - startX) / PX_PER_STEP) * (m.shiftKey ? SHIFT_STEPS : 1);
      last = clamp(snap(origin + steps * step));
      setDraft(String(last));
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) return;
      setDraft(null);
      if (last !== origin) onCommit(last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <input
      id={id}
      class="number-scrub"
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={draft ?? (value === null ? '' : String(value))}
      placeholder={placeholder}
      onInput={(e) => setDraft(e.currentTarget.value)}
      onBlur={() => {
        if (draft !== null) {
          const next = parse(draft);
          if (next !== null && next !== value) onCommit(next);
        }
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      onPointerDown={scrub}
    />
  );
}
