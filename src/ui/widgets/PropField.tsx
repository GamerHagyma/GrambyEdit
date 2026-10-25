// One property row (spec §13.3): the label, the widget for its PropMeta, the applies-to note and Reset.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Catalog } from '../../core/catalog-types';
import { propApplies, setProp, UNSET } from '../../core/ops/props';
import type { PropRow } from '../../core/propview';
import type { Json, PartId, RGB } from '../../core/types';
import { commit } from '../../state/store';
import { Icon } from '../icons';
import { ColorField } from './ColorField';
import { KeyCapture } from './KeyCapture';
import { NumberScrub } from './NumberScrub';

export interface PropFieldProps {
  readonly cat: Catalog;
  readonly row: PropRow;
  /** The selected parts, in export order. */
  readonly ids: readonly PartId[];
}

const isRgb = (v: Json | undefined): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((c) => typeof c === 'number');

/** A string or multi-line text prop, committed on blur (Enter also commits a single line). */
function TextValue({
  id,
  value,
  multiline,
  placeholder,
  onCommit,
}: {
  readonly id: string;
  readonly value: Json | undefined;
  readonly multiline: boolean;
  readonly placeholder: string;
  onCommit(text: string): void;
}): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  const committed = typeof value === 'string' ? value : null;
  const shown = draft ?? committed ?? '';
  const finish = (): void => {
    if (draft !== null && draft !== committed) onCommit(draft);
    setDraft(null);
  };
  return multiline ? (
    <textarea
      id={id}
      class="text-value"
      rows={3}
      value={shown}
      placeholder={placeholder}
      onInput={(e) => setDraft(e.currentTarget.value)}
      onBlur={finish}
    />
  ) : (
    <input
      id={id}
      class="text-value"
      type="text"
      value={shown}
      placeholder={placeholder}
      onInput={(e) => setDraft(e.currentTarget.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

export function PropField({ cat, row, ids }: PropFieldProps): JSX.Element {
  const { key, meta, value, mixed, applies, total } = row;
  const { label } = meta;
  const id = `prop-${key}`;
  const placeholder = mixed
    ? 'mixed'
    : meta.default === undefined
      ? 'default'
      : `default ${String(meta.default)}`;

  const write = (next: Json): void => {
    // A value that every applicable part already holds is no edit, so it records nothing.
    if (value !== undefined && JSON.stringify(value) === JSON.stringify(next)) return;
    commit(`Set ${label}`, (d) => {
      setProp(d, cat, ids, key, next);
    });
  };
  const reset = (): void => {
    commit(`Reset ${label}`, (d) => {
      setProp(d, cat, ids, key, UNSET);
    });
  };
  // Each applicable part turns from its own value, so the differences in a mixed selection survive.
  const turn = (delta: number): void => {
    commit(`Set ${label}`, (d) => {
      for (const partId of ids) {
        const part = d.get(partId);
        if (!part || !propApplies(cat, part, key)) continue;
        const current = Object.hasOwn(part.props, key) ? part.props[key] : undefined;
        setProp(d, cat, [partId], key, (typeof current === 'number' ? current : 0) + delta);
      }
    });
  };

  const widget = (): JSX.Element => {
    switch (meta.widget) {
      case 'bool':
        return (
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            ref={(el) => {
              if (el) el.indeterminate = mixed;
            }}
            onChange={(e) => write(e.currentTarget.checked)}
          />
        );
      case 'number':
      case 'int':
      case 'orientation':
        return (
          <div class="number-row">
            <NumberScrub
              id={id}
              value={typeof value === 'number' ? value : null}
              placeholder={placeholder}
              step={meta.step ?? 1}
              min={meta.min}
              max={meta.max}
              integer={meta.widget === 'int'}
              onCommit={write}
            />
            {meta.widget === 'orientation' && (
              <>
                <button
                  type="button"
                  class="button small"
                  aria-label={`${label} −90`}
                  onClick={() => turn(-90)}
                >
                  −90
                </button>
                <button
                  type="button"
                  class="button small"
                  aria-label={`${label} +90`}
                  onClick={() => turn(90)}
                >
                  +90
                </button>
              </>
            )}
          </div>
        );
      case 'string':
      case 'text':
        return (
          <TextValue
            id={id}
            value={value}
            multiline={meta.widget === 'text'}
            placeholder={placeholder}
            onCommit={write}
          />
        );
      case 'rgb':
        return (
          <ColorField
            id={id}
            label={label}
            value={isRgb(value) ? value : null}
            placeholder={placeholder}
            onCommit={(rgb: RGB) => write([...rgb])}
          />
        );
      case 'key':
        return (
          <KeyCapture
            id={id}
            value={typeof value === 'string' ? value : null}
            placeholder={placeholder}
            onCommit={write}
          />
        );
      default:
        return <span class="muted">{JSON.stringify(value)}</span>;
    }
  };

  return (
    <div class="prop-row" title={meta.description}>
      <div class="prop-head">
        <label for={id} class="prop-label">
          {label}
        </label>
        {applies < total && (
          <span class="prop-applies muted">{`applies to ${applies} of ${total}`}</span>
        )}
        {(value !== undefined || mixed) && (
          <button type="button" class="button small" onClick={reset}>
            <Icon name="undo" size={14} /> Reset
          </button>
        )}
      </div>
      {widget()}
    </div>
  );
}
