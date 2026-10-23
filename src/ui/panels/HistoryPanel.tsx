// The undo history (spec §13.6 and the Task 31 list): every state since the file opened. A click jumps to that state.
import type { JSX } from 'preact';
import { batch } from '@preact/signals';
import { historySig, redo, undo } from '../../state/store';

/**
 * Row r is the state after r edits. Row 0 is Opened, the state before the first entry; the past
 * follows oldest first; the future follows with the next redo first, greyed.
 */
export function HistoryPanel(): JSX.Element {
  const { past, future } = historySig.value;
  const rows = [
    { label: 'Opened', future: false },
    ...past.map((p) => ({ label: p.label, future: false })),
    ...[...future].reverse().map((p) => ({ label: p.label, future: true })),
  ];
  const current = past.length;

  const jumpTo = (row: number): void => {
    const steps = row - historySig.value.past.length;
    batch(() => {
      for (let i = 0; i < -steps; i++) undo();
      for (let i = 0; i < steps; i++) redo();
    });
  };

  return (
    <ol class="history">
      {rows.map((row, r) => (
        <li key={r}>
          <button
            class={row.future ? 'history-row future' : 'history-row'}
            aria-current={r === current ? 'step' : undefined}
            onClick={() => jumpTo(r)}
          >
            {row.label}
          </button>
        </li>
      ))}
    </ol>
  );
}
