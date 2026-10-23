// The command palette (spec §13.10, F3 or Ctrl+Shift+P): every command, fuzzy-filtered by label, run with Enter or a click.
import type { JSX } from 'preact';
import { useEffect, useId, useState } from 'preact/hooks';
import { allCommands, runCommand, type Command } from '../../state/commands';
import { keysFor } from '../../state/keymap';
import { settingsSig } from '../../state/settings';
import { Dialog } from '../layout/Dialog';
import { fuzzyScore } from '../widgets/fuzzy';

/** The commands whose label matches `query`, best first. An empty query matches all, in registry order. */
function matches(query: string): Command[] {
  return allCommands()
    .map((command) => ({ command, score: fuzzyScore(query, command.label) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.command);
}

function PaletteList({ onRun }: { onRun(): void }): JSX.Element {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const scheme = settingsSig.value.cameraScheme;
  const shown = matches(query);
  const optionId = (i: number) => `${listId}-${i}`;

  // Keeps the highlighted row visible as the arrows move through a long list.
  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  // Closed first: the command may open another dialog, which closing afterwards would shut.
  const run = (command: Command) => {
    if (command.enabled !== undefined && !command.enabled()) return;
    onRun();
    runCommand(command.id);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const last = shown.length - 1;
      setActive((a) => Math.max(0, Math.min(last, a + dir)));
    } else if (e.key === 'Enter' && shown[active] !== undefined) {
      e.preventDefault();
      run(shown[active]);
    }
  };

  return (
    <>
      <input
        type="search"
        class="palette-search"
        aria-label="Search commands"
        aria-controls={listId}
        aria-activedescendant={shown.length > 0 ? optionId(active) : undefined}
        value={query}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} class="palette" role="listbox">
        {shown.map((command, i) => {
          const key = keysFor(command.id, scheme)[0];
          const disabled = command.enabled !== undefined && !command.enabled();
          return (
            <li
              key={command.id}
              id={optionId(i)}
              class="palette-row"
              role="option"
              aria-selected={i === active}
              aria-disabled={disabled}
              onClick={() => run(command)}
            >
              <span class="palette-label">{command.label}</span>
              {key !== undefined && <kbd>{key}</kbd>}
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p class="empty">No matching commands</p>}
    </>
  );
}

/** Every command with its key in the current scheme. The list is built fresh each time the palette opens. */
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): JSX.Element | null {
  return (
    <Dialog title="Command palette" open={open} onClose={onClose}>
      <PaletteList onRun={onClose} />
    </Dialog>
  );
}
