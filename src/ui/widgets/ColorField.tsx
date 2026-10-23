// The RGB prop (spec §13.3): a colour swatch, a hex field and R/G/B fields. Channels run from 0 to 255.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { RGB } from '../../core/types';
import { NumberScrub } from './NumberScrub';

export interface ColorFieldProps {
  readonly id: string;
  readonly label: string;
  /** The shared colour; null when unset or mixed. */
  readonly value: RGB | null;
  readonly placeholder: string;
  onCommit(rgb: RGB): void;
}

const CHANNELS = [
  ['R', 'Red'],
  ['G', 'Green'],
  ['B', 'Blue'],
] as const;

const byte = (c: number): number => Math.min(255, Math.max(0, Math.round(c)));

const hexOf = (rgb: RGB): string =>
  `#${rgb.map((c) => byte(c).toString(16).padStart(2, '0')).join('')}`;

/** `rrggbb` or `#rrggbb`; any other text is null. */
function parseHex(text: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(text.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const sameRgb = (a: RGB, b: RGB | null): boolean => b !== null && a.every((c, i) => c === b[i]);

export function ColorField({
  id,
  label,
  value,
  placeholder,
  onCommit,
}: ColorFieldProps): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  const hex = value === null ? '' : hexOf(value);
  // A channel of an unset or mixed colour counts as 0 when it is edited on its own.
  const base: RGB = value ?? [0, 0, 0];

  return (
    <div class="color-field">
      <input
        type="color"
        class="swatch"
        aria-label={`${label} swatch`}
        value={value === null ? '#000000' : hex}
        onChange={(e) => {
          const rgb = parseHex(e.currentTarget.value);
          if (rgb && !sameRgb(rgb, value)) onCommit(rgb);
        }}
      />
      <input
        id={id}
        class="hex"
        type="text"
        value={draft ?? hex}
        placeholder={placeholder}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => {
          const rgb = draft === null ? null : parseHex(draft);
          if (rgb && !sameRgb(rgb, value)) onCommit(rgb);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {CHANNELS.map(([short, name], i) => (
        <label class="channel" key={name} title={name}>
          {short}
          <NumberScrub
            id={`${id}-${name.toLowerCase()}`}
            value={value === null ? null : value[i]}
            placeholder={placeholder}
            step={1}
            min={0}
            max={255}
            integer
            onCommit={(channel) => {
              const next = [...base] as [number, number, number];
              next[i] = channel;
              onCommit(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}
