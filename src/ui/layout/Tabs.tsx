import type { JSX } from 'preact';

/** A tab strip; arrow keys move between tabs. */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { id: string; label: string }[];
  active: string;
  onChange(id: string): void;
}): JSX.Element {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = tabs.findIndex((t) => t.id === active);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
  };
  return (
    <div class="tabs" role="tablist" onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          class={t.id === active ? 'tab active' : 'tab'}
          aria-selected={t.id === active}
          tabIndex={t.id === active ? 0 : -1}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
