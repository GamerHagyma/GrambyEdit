// The pop-up part picker (spec §12.6): opens at a point, lists the eligible parts and creations, and picks one.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { catalogSig } from '../../state/store';
import { fuzzyScore, rankParts } from './fuzzy';

export type PickChoice = { kind: 'part'; type: string } | { kind: 'creation'; id: string };

export interface PartPickerProps {
  eligible(type: string): boolean;
  onPick(c: PickChoice): void;
  onClose(): void;
  anchor: { x: number; y: number };
  creations?: readonly { id: string; name: string }[];
}

interface PickOption {
  key: string;
  label: string;
  hint: string;
  choice: PickChoice;
}

export function PartPicker({
  eligible,
  onPick,
  onClose,
  anchor,
  creations = [],
}: PartPickerProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const cat = catalogSig.value;
  const parts = cat
    ? rankParts(
        Object.values(cat.parts).filter((p) => eligible(p.type)),
        query,
      )
    : [];
  const options: PickOption[] = [
    ...parts.map((p): PickOption => ({
      key: `part:${p.type}`,
      label: p.type,
      hint: p.category,
      choice: { kind: 'part', type: p.type },
    })),
    ...creations
      .filter((c) => fuzzyScore(query, c.name) > 0)
      .map((c): PickOption => ({
        key: `creation:${c.id}`,
        label: c.name,
        hint: 'My creation',
        choice: { kind: 'creation', id: c.id },
      })),
  ];
  const at = Math.max(0, Math.min(active, options.length - 1));

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(Math.max(0, Math.min(at + step, options.length - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[at]) onPick(options[at].choice);
    }
  };

  return (
    <div
      class="part-picker"
      role="dialog"
      aria-label="Pick a part"
      style={{ left: `${anchor.x}px`, top: `${anchor.y}px` }}
    >
      <input
        ref={inputRef}
        type="search"
        aria-label="Search parts"
        aria-activedescendant={options[at] ? `part-picker-option-${at}` : undefined}
        placeholder="Search parts"
        value={query}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {options.length === 0 ? (
        <p class="part-picker-empty">No matches</p>
      ) : (
        <ul class="part-picker-list" role="listbox">
          {options.map((o, i) => (
            <li
              key={o.key}
              id={`part-picker-option-${i}`}
              role="option"
              aria-selected={i === at}
              class={i === at ? 'active' : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(o.choice)}
            >
              <span>{o.label}</span>
              <span class="muted">{o.hint}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
