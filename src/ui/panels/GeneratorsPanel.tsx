// The Generators panel (spec §13.9, §15): a shape with its parameters, the element and host parts, the spacing and
// the colours, what the shape would add to the build, and Generate, which arms the Place tool with the shape.
import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { eligibleForPoint } from '../../core/defaults';
import {
  buildGeneratedSubDoc,
  SHAPES,
  type GenFill,
  type GenOrient,
  type ShapeDef,
  type ShapeParam,
} from '../../core/generators';
import { hexToRgb, rgbToHex } from '../../core/palette';
import type { RGB } from '../../core/types';
import { arm } from '../../state/place';
import {
  costPreview,
  liveRequestSig,
  loadPreset,
  presetsSig,
  savePreset,
  setColorMode,
  setParam,
  setShape,
  updateInput,
  updateRequest,
} from '../../state/generators';
import { settingsSig } from '../../state/settings';
import { catalogSig, docSig } from '../../state/store';
import { PartPicker, type PickChoice } from '../widgets/PartPicker';

const SHAPE_LIST: readonly ShapeDef[] = Object.values(SHAPES);
const FILL_LABEL: Readonly<Record<GenFill, string>> = {
  solid: 'Solid',
  shell: 'Shell',
  frame: 'Frame',
  outline: 'Outline',
};
const ORIENTS: readonly { id: GenOrient; label: string }[] = [
  { id: 'fixed', label: 'Fixed' },
  { id: 'outward', label: 'Outward' },
  { id: 'tangent', label: 'Tangent' },
];
const WHITE: RGB = [255, 255, 255];

/** The number a field holds, or null while it is empty. */
function numberOf(text: string): number | null {
  if (text === '') return null;
  const v = Number(text);
  return Number.isFinite(v) ? v : null;
}

/**
 * One shape parameter: a number (whole numbers for `int`) or text. The visible label is the parameter key in
 * Title Case (`major` reads "Major", as the plan has it); the fuller `ShapeParam.label` is the field's tooltip.
 */
function ParamField({ def, value }: { def: ShapeParam; value: number | string }): JSX.Element {
  const id = `gen-param-${def.key}`;
  const name = def.key.charAt(0).toUpperCase() + def.key.slice(1);
  return (
    <div class="gen-field">
      <label for={id}>{name}</label>
      {def.kind === 'text' ? (
        <input
          id={id}
          type="text"
          title={def.label}
          value={String(value)}
          onInput={(e) => setParam(def.key, e.currentTarget.value)}
        />
      ) : (
        <input
          id={id}
          type="number"
          title={def.label}
          step={def.kind === 'int' ? 1 : 'any'}
          min={def.min}
          max={def.max}
          value={Number(value)}
          onInput={(e) => {
            const v = numberOf(e.currentTarget.value);
            if (v !== null) setParam(def.key, def.kind === 'int' ? Math.round(v) : v);
          }}
        />
      )}
    </div>
  );
}

type PickSlot = 'element' | 'host';

export function GeneratorsPanel(): JSX.Element {
  const cat = catalogSig.value;
  const doc = docSig.value;
  const req = liveRequestSig.value;
  const { limits } = settingsSig.value;
  const presets = presetsSig.value;
  const [picker, setPicker] = useState<{
    slot: PickSlot;
    anchor: { x: number; y: number };
  } | null>(null);
  const [presetName, setPresetName] = useState('');
  const preview = useMemo(
    () => cat && costPreview(doc, cat, cat.conventions, req, limits),
    [cat, doc, req, limits],
  );

  useEffect(() => {
    if (picker === null) return;
    // A press outside the picker closes it. The buttons that open it are exempt, so their click can move it.
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.part-picker, .gen-pick')) setPicker(null);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [picker]);

  if (!cat || !preview) {
    return (
      <div class="generators">
        <p class="empty">The part library is still loading.</p>
      </div>
    );
  }

  const def = SHAPES[req.shape];
  const c = req.color;
  const name = presetName.trim();

  const openPicker = (slot: PickSlot, at: HTMLElement) => {
    const r = at.getBoundingClientRect();
    setPicker({ slot, anchor: { x: r.left, y: r.bottom + 4 } });
  };
  const onPick = (choice: PickChoice): void => {
    if (picker === null || choice.kind !== 'part') return;
    updateRequest(picker.slot === 'element' ? { element: choice.type } : { host: choice.type });
    setPicker(null);
  };
  const generate = () => {
    const built = buildGeneratedSubDoc(req, cat, cat.conventions);
    if (built.ok) arm({ kind: 'generated', sub: built.sub });
  };

  return (
    <div class="generators">
      <div class="gen-shapes" role="group" aria-label="Shapes">
        {SHAPE_LIST.map((s) => (
          <button
            key={s.id}
            class="button small"
            aria-pressed={s.id === req.shape}
            onClick={() => setShape(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div class="gen-form">
        {def.params.map((p) => (
          <ParamField key={`${req.shape}.${p.key}`} def={p} value={req.input.params[p.key]} />
        ))}
        <div class="gen-field">
          <label for="gen-fill">Fill</label>
          <select
            id="gen-fill"
            value={req.input.fill}
            onChange={(e) => {
              const fill = def.fills.find((f) => f === e.currentTarget.value);
              if (fill) updateInput({ fill });
            }}
          >
            {def.fills.map((f) => (
              <option key={f} value={f}>
                {FILL_LABEL[f]}
              </option>
            ))}
          </select>
        </div>
        <div class="gen-field">
          <label for="gen-orient">Orientation</label>
          <select
            id="gen-orient"
            value={req.input.orient}
            onChange={(e) => {
              const orient = ORIENTS.find((o) => o.id === e.currentTarget.value)?.id;
              if (orient) updateInput({ orient });
            }}
          >
            {ORIENTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div class="gen-field">
          <label for="gen-spacing">Spacing</label>
          <input
            id="gen-spacing"
            type="number"
            step="any"
            min={0.01}
            value={req.input.spacing}
            onInput={(e) => {
              const spacing = numberOf(e.currentTarget.value);
              if (spacing !== null) updateInput({ spacing });
            }}
          />
        </div>
        <div class="gen-field">
          <span class="gen-label">Element</span>
          <button
            class="button small gen-pick"
            aria-haspopup="dialog"
            title="The part placed on each point"
            onClick={(e) => openPicker('element', e.currentTarget)}
          >
            {req.element}
          </button>
        </div>
        <div class="gen-field">
          <span class="gen-label">Host</span>
          <button
            class="button small gen-pick"
            aria-haspopup="dialog"
            title="The part the points sit on"
            onClick={(e) => openPicker('host', e.currentTarget)}
          >
            {req.host}
          </button>
        </div>
        <div class="gen-field">
          <label for="gen-color-mode">Color mode</label>
          <select
            id="gen-color-mode"
            value={c.mode}
            onChange={(e) => {
              const mode = e.currentTarget.value;
              if (mode === 'single' || mode === 'gradient' || mode === 'random') setColorMode(mode);
            }}
          >
            <option value="single">Single</option>
            <option value="gradient">Gradient</option>
            <option value="random">Random</option>
          </select>
        </div>
        {c.mode === 'single' && (
          <div class="gen-field">
            <label for="gen-color">Color</label>
            <input
              id="gen-color"
              type="color"
              value={rgbToHex(c.rgb)}
              onChange={(e) => {
                const rgb = hexToRgb(e.currentTarget.value);
                if (rgb) updateRequest({ color: { mode: 'single', rgb } });
              }}
            />
          </div>
        )}
        {c.mode === 'gradient' && (
          <>
            <div class="gen-field">
              <label for="gen-from">From</label>
              <input
                id="gen-from"
                type="color"
                value={rgbToHex(c.from)}
                onChange={(e) => {
                  const from = hexToRgb(e.currentTarget.value);
                  if (from) updateRequest({ color: { ...c, from } });
                }}
              />
            </div>
            <div class="gen-field">
              <label for="gen-to">To</label>
              <input
                id="gen-to"
                type="color"
                value={rgbToHex(c.to)}
                onChange={(e) => {
                  const to = hexToRgb(e.currentTarget.value);
                  if (to) updateRequest({ color: { ...c, to } });
                }}
              />
            </div>
            <div class="gen-field">
              <label for="gen-axis">Axis</label>
              <select
                id="gen-axis"
                value={c.axis}
                onChange={(e) => {
                  const axis = e.currentTarget.value;
                  if (axis === 'x' || axis === 'y' || axis === 'z') {
                    updateRequest({ color: { ...c, axis } });
                  }
                }}
              >
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="z">Z</option>
              </select>
            </div>
          </>
        )}
        {c.mode === 'random' && (
          <>
            {c.palette.map((rgb, i) => (
              <div class="gen-field" key={i}>
                <input
                  type="color"
                  aria-label={`Palette color ${i + 1}`}
                  value={rgbToHex(rgb)}
                  onChange={(e) => {
                    const next = hexToRgb(e.currentTarget.value);
                    if (next) {
                      updateRequest({
                        color: { ...c, palette: c.palette.map((x, j) => (j === i ? next : x)) },
                      });
                    }
                  }}
                />
                <button
                  class="button small"
                  aria-label={`Remove palette color ${i + 1}`}
                  disabled={c.palette.length === 1}
                  onClick={() =>
                    updateRequest({
                      color: { ...c, palette: c.palette.filter((_, j) => j !== i) },
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              class="button small"
              onClick={() => updateRequest({ color: { ...c, palette: [...c.palette, WHITE] } })}
            >
              Add color
            </button>
            <div class="gen-field">
              <label for="gen-seed">Seed</label>
              <input
                id="gen-seed"
                type="number"
                step={1}
                value={c.seed}
                onInput={(e) => {
                  const seed = numberOf(e.currentTarget.value);
                  if (seed !== null && Number.isInteger(seed)) {
                    updateRequest({ color: { ...c, seed } });
                  }
                }}
              />
            </div>
          </>
        )}
      </div>

      {preview.ok ? (
        <>
          <p class="gen-cost" role="status">
            {preview.cost.text}
          </p>
          {preview.cost.crossings.map((x) => (
            <p key={x} class="gen-warning">
              Crosses {x}
            </p>
          ))}
        </>
      ) : (
        <p class="gen-error" role="alert">
          {preview.error}
        </p>
      )}
      <button class="button primary" disabled={!preview.ok} onClick={generate}>
        Generate
      </button>

      <div class="gen-presets">
        <div class="gen-field">
          <label for="gen-preset-name">Preset name</label>
          <input
            id="gen-preset-name"
            type="text"
            value={presetName}
            onInput={(e) => setPresetName(e.currentTarget.value)}
          />
          <button
            class="button small"
            disabled={name === ''}
            onClick={() => {
              savePreset(name, req);
              setPresetName('');
            }}
          >
            Save
          </button>
        </div>
        <div class="gen-field">
          <label for="gen-preset-load">Load preset</label>
          <select
            id="gen-preset-load"
            value=""
            onChange={(e) => {
              loadPreset(e.currentTarget.value);
              e.currentTarget.value = '';
            }}
          >
            <option value="">Choose a preset</option>
            {Object.keys(presets).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {picker && (
        <PartPicker
          eligible={picker.slot === 'element' ? (type) => eligibleForPoint(cat, type) : () => true}
          anchor={picker.anchor}
          title={
            picker.slot === 'element' ? 'Element: placed on each point' : 'Host: carries the points'
          }
          onPick={onPick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
