// Other properties (spec §13.3): a prop with no PropMeta, edited as JSON. Text that is not valid JSON is
// flagged and kept for editing, and is not written.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Json } from '../../core/types';

export interface JsonFieldProps {
  readonly id: string;
  readonly value: Json;
  onCommit(value: Json): void;
}

/** Whether a parsed value is `Json`: every number finite, since `JSON.stringify` writes NaN and Infinity as null. */
function isJson(v: unknown): v is Json {
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(isJson);
  if (typeof v === 'object' && v !== null) return Object.values(v).every(isJson);
  return v === null || typeof v === 'string' || typeof v === 'boolean';
}

export function JsonField({ id, value, onCommit }: JsonFieldProps): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = JSON.stringify(value, null, 2);

  return (
    <div class="json-field">
      <textarea
        id={id}
        class="json"
        rows={Math.min(8, shown.split('\n').length)}
        value={draft ?? shown}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => {
          if (draft === null) return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(draft);
          } catch (err) {
            setError(`Not valid JSON: ${(err as Error).message}`);
            return;
          }
          if (!isJson(parsed)) {
            setError('Numbers must be finite.');
            return;
          }
          setError(null);
          setDraft(null);
          if (JSON.stringify(parsed) !== JSON.stringify(value)) onCommit(parsed);
        }}
      />
      {error !== null && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
