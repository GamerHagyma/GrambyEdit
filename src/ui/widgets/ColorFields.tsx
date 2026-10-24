// The colour fields of a generated shape or a GasCap surface (spec §13.9, §13.11): the colour mode, then the
// colours that mode takes. Each control reports the whole tint; `idPrefix` keeps two panels' ids apart.
import type { JSX } from 'preact';
import { withTintMode, type Tint } from '../../core/generators';
import { hexToRgb, rgbToHex } from '../../core/palette';
import type { RGB } from '../../core/types';

/** A choice for a gradient's axis: its value, and the text the Axis select shows for it. */
export interface AxisOption<A extends string> {
  readonly id: A;
  readonly label: string;
}

export interface ColorFieldsProps<A extends string> {
  readonly idPrefix: string;
  readonly color: Tint<A>;
  readonly axes: readonly AxisOption<A>[];
  onChange(next: Tint<A>): void;
}

const WHITE: RGB = [255, 255, 255];

/**
 * The colour fields for `color`. A new mode keeps the first colour, and a gradient starts on the first of
 * `axes` (`withTintMode`).
 */
export function ColorFields<A extends string>({
  idPrefix,
  color,
  axes,
  onChange,
}: ColorFieldsProps<A>): JSX.Element {
  const idOf = (name: string) => `${idPrefix}-${name}`;
  return (
    <>
      <div class="gen-field">
        <label for={idOf('color-mode')}>Color mode</label>
        <select
          id={idOf('color-mode')}
          value={color.mode}
          onChange={(e) => {
            const mode = e.currentTarget.value;
            if (mode === 'single' || mode === 'gradient' || mode === 'random') {
              onChange(withTintMode(color, mode, axes[0].id));
            }
          }}
        >
          <option value="single">Single</option>
          <option value="gradient">Gradient</option>
          <option value="random">Random</option>
        </select>
      </div>
      {color.mode === 'single' && (
        <div class="gen-field">
          <label for={idOf('color')}>Color</label>
          <input
            id={idOf('color')}
            type="color"
            value={rgbToHex(color.rgb)}
            onChange={(e) => {
              const rgb = hexToRgb(e.currentTarget.value);
              if (rgb) onChange({ mode: 'single', rgb });
            }}
          />
        </div>
      )}
      {color.mode === 'gradient' && (
        <>
          <div class="gen-field">
            <label for={idOf('from')}>From</label>
            <input
              id={idOf('from')}
              type="color"
              value={rgbToHex(color.from)}
              onChange={(e) => {
                const from = hexToRgb(e.currentTarget.value);
                if (from) onChange({ ...color, from });
              }}
            />
          </div>
          <div class="gen-field">
            <label for={idOf('to')}>To</label>
            <input
              id={idOf('to')}
              type="color"
              value={rgbToHex(color.to)}
              onChange={(e) => {
                const to = hexToRgb(e.currentTarget.value);
                if (to) onChange({ ...color, to });
              }}
            />
          </div>
          <div class="gen-field">
            <label for={idOf('axis')}>Axis</label>
            <select
              id={idOf('axis')}
              value={color.axis}
              onChange={(e) => {
                const axis = axes.find((a) => a.id === e.currentTarget.value)?.id;
                if (axis !== undefined) onChange({ ...color, axis });
              }}
            >
              {axes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {color.mode === 'random' && (
        <>
          {color.palette.map((rgb, i) => (
            <div class="gen-field" key={i}>
              <input
                type="color"
                aria-label={`Palette color ${i + 1}`}
                value={rgbToHex(rgb)}
                onChange={(e) => {
                  const next = hexToRgb(e.currentTarget.value);
                  if (next) {
                    onChange({
                      ...color,
                      palette: color.palette.map((x, j) => (j === i ? next : x)),
                    });
                  }
                }}
              />
              <button
                class="button small"
                aria-label={`Remove palette color ${i + 1}`}
                disabled={color.palette.length === 1}
                onClick={() =>
                  onChange({ ...color, palette: color.palette.filter((_, j) => j !== i) })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            class="button small"
            onClick={() => onChange({ ...color, palette: [...color.palette, WHITE] })}
          >
            Add color
          </button>
          <div class="gen-field">
            <label for={idOf('seed')}>Seed</label>
            <input
              id={idOf('seed')}
              type="number"
              step={1}
              value={color.seed}
              onInput={(e) => {
                // An empty field is no seed; Number('') would read it as 0.
                const seed = Number(e.currentTarget.value);
                if (e.currentTarget.value !== '' && Number.isInteger(seed)) {
                  onChange({ ...color, seed });
                }
              }}
            />
          </div>
        </>
      )}
    </>
  );
}
