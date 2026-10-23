// The Paint panel (spec §12.5): the active colour with hex and R/G/B fields, swatches, recent colours, the
// build palette, the paint modes, Paint selection and the auto-colour toggle.
import type { JSX } from 'preact';
import { computed } from '@preact/signals';
import { buildPalette, hexToRgb, partsWithColor, rgbToHex } from '../../core/palette';
import type { RGB } from '../../core/types';
import { select, selectionSig } from '../../state/selection';
import { settingsSig, updateSettings } from '../../state/settings';
import { docSig } from '../../state/store';
import {
  brushRadiusSig,
  fillMatchSig,
  paintModeSig,
  paintParts,
  recentColorsSig,
  type FillMatch,
  type PaintMode,
} from '../../tools/paint';

/** The fixed swatches: four neutrals, then eight hues. */
const SWATCHES: readonly RGB[] = [
  [255, 255, 255],
  [189, 189, 189],
  [97, 97, 97],
  [0, 0, 0],
  [198, 40, 40],
  [239, 108, 0],
  [253, 216, 53],
  [46, 125, 50],
  [0, 172, 193],
  [30, 136, 229],
  [142, 36, 170],
  [216, 27, 96],
];

const MODES: readonly { readonly mode: PaintMode; readonly label: string }[] = [
  { mode: 'click', label: 'Click' },
  { mode: 'fill', label: 'Fill' },
  { mode: 'box', label: 'Box' },
  { mode: 'brush', label: 'Brush' },
  { mode: 'branch', label: 'Branch' },
];

const FILL_MATCHES: readonly { readonly match: FillMatch; readonly label: string }[] = [
  { match: 'color', label: 'Color' },
  { match: 'type', label: 'Type' },
  { match: 'any', label: 'Any' },
];

/** A typed channel: whole numbers from 0 to 255; anything else is null. */
const parseChannel = (text: string): number | null => {
  const t = text.trim();
  return /^\d{1,3}$/.test(t) && Number(t) <= 255 ? Number(t) : null;
};

const pickColor = (c: RGB): void => updateSettings({ activeColor: c });

// Cached, so a colour drag (which changes settings, not the build) does not rebuild it.
const paletteSig = computed(() => buildPalette(docSig.value));

export function PaintPanel(): JSX.Element {
  const { activeColor, autoColor } = settingsSig.value;
  const [r, g, b] = activeColor;
  const hex = rgbToHex(activeColor);
  const doc = docSig.value;
  const mode = paintModeSig.value;
  const selected = selectionSig.value.parts.size;

  /** A hex field or the colour input: a value that is not a colour puts the old one back. */
  const typeHex = (e: JSX.TargetedEvent<HTMLInputElement, Event>): void => {
    const next = hexToRgb(e.currentTarget.value);
    if (next === null) e.currentTarget.value = hex;
    else updateSettings({ activeColor: next });
  };

  /** One typed channel; text that is not a channel puts the old value back. */
  const typeChannel = (channel: number, e: JSX.TargetedEvent<HTMLInputElement, Event>): void => {
    const v = parseChannel(e.currentTarget.value);
    if (v === null) {
      e.currentTarget.value = String(activeColor[channel]);
      return;
    }
    const next: [number, number, number] = [r, g, b];
    next[channel] = v;
    updateSettings({ activeColor: next });
  };

  return (
    <div class="paint-panel">
      <div class="paint-color">
        <input type="color" aria-label="Color picker" value={hex} onInput={typeHex} />
        <label>
          Hex <input type="text" value={hex} onChange={typeHex} />
        </label>
        <label>
          R{' '}
          <input
            type="number"
            min={0}
            max={255}
            step={1}
            value={r}
            onChange={(e) => typeChannel(0, e)}
          />
        </label>
        <label>
          G{' '}
          <input
            type="number"
            min={0}
            max={255}
            step={1}
            value={g}
            onChange={(e) => typeChannel(1, e)}
          />
        </label>
        <label>
          B{' '}
          <input
            type="number"
            min={0}
            max={255}
            step={1}
            value={b}
            onChange={(e) => typeChannel(2, e)}
          />
        </label>
      </div>

      <h3>Swatches</h3>
      <div class="swatches" role="group" aria-label="Swatches">
        {SWATCHES.map((c) => {
          const label = rgbToHex(c);
          return (
            <button
              key={label}
              type="button"
              class="swatch"
              title={label}
              aria-label={`Swatch ${label}`}
              style={{ background: label }}
              onClick={() => pickColor(c)}
            />
          );
        })}
      </div>

      {recentColorsSig.value.length > 0 && (
        <>
          <h3>Recent colors</h3>
          <div class="swatches" role="group" aria-label="Recent colors">
            {recentColorsSig.value.map((c) => {
              const label = rgbToHex(c);
              return (
                <button
                  key={label}
                  type="button"
                  class="swatch"
                  title={label}
                  aria-label={`Recent ${label}`}
                  style={{ background: label }}
                  onClick={() => pickColor(c)}
                />
              );
            })}
          </div>
        </>
      )}

      <h3>Build palette</h3>
      <div class="swatches" role="group" aria-label="Build palette">
        {paletteSig.value.map(({ rgb, count }) => {
          const label = rgbToHex(rgb);
          const name = `${label}, ${count} ${count === 1 ? 'part' : 'parts'}`;
          return (
            <button
              key={label}
              type="button"
              class="swatch"
              title={`${name}. Shift+click selects them.`}
              aria-label={name}
              style={{ background: label }}
              onClick={(e) =>
                e.shiftKey ? select(partsWithColor(doc, rgb), 'replace') : pickColor(rgb)
              }
            />
          );
        })}
      </div>

      <h3>Mode</h3>
      <div class="paint-modes" role="group" aria-label="Paint mode">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            class="button"
            aria-pressed={mode === m.mode}
            onClick={() => {
              paintModeSig.value = m.mode;
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <label class="paint-field">
        Fill match
        <select
          value={fillMatchSig.value}
          onChange={(e) => {
            const next = FILL_MATCHES.find((f) => f.match === e.currentTarget.value);
            if (next) fillMatchSig.value = next.match;
          }}
        >
          {FILL_MATCHES.map((f) => (
            <option key={f.match} value={f.match}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label class="paint-field">
        Brush radius
        <input
          type="range"
          min={4}
          max={96}
          step={1}
          value={brushRadiusSig.value}
          onInput={(e) => {
            brushRadiusSig.value = Number(e.currentTarget.value);
          }}
        />
        <span>{`${brushRadiusSig.value} px`}</span>
      </label>

      <button
        type="button"
        class="button primary"
        disabled={selected === 0}
        onClick={() => paintParts(selectionSig.value.parts)}
      >
        Paint selection
      </button>
      <label class="paint-auto">
        <input
          type="checkbox"
          checked={autoColor}
          onChange={(e) => updateSettings({ autoColor: e.currentTarget.checked })}
        />
        Auto-color new parts
      </label>
    </div>
  );
}
