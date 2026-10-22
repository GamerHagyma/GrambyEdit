import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import { loadPref, savePref } from '../../storage/prefs';
import { Icon } from '../icons';

const MIN = 200;
const MAX = 560;

interface DockPref {
  width: number;
  collapsed: boolean;
}

/** A side panel that collapses to a strip and resizes by its inner edge; both persist per side. */
export function Dock({
  side,
  label,
  children,
}: {
  side: 'left' | 'right';
  label: string;
  children: ComponentChildren;
}): JSX.Element {
  const key = `dock:${side}`;
  const [pref, setPref] = useState<DockPref>(() => {
    const p = loadPref<Partial<DockPref>>(key, {});
    const width = typeof p.width === 'number' ? Math.min(MAX, Math.max(MIN, p.width)) : 280;
    return { width, collapsed: p.collapsed === true };
  });
  const update = (next: DockPref) => {
    setPref(next);
    savePref(key, next);
  };

  const startResize = (e: PointerEvent) => {
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const w0 = pref.width;
    let width = w0;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      width = Math.min(MAX, Math.max(MIN, w0 + (side === 'left' ? dx : -dx)));
      setPref((p) => ({ ...p, width }));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      update({ width, collapsed: false });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  const toggle = (
    <button
      class="icon-button dock-toggle"
      aria-label={pref.collapsed ? `Show ${label}` : `Hide ${label}`}
      aria-expanded={!pref.collapsed}
      onClick={() => update({ ...pref, collapsed: !pref.collapsed })}
    >
      <Icon name={side === 'left' ? 'panel-left' : 'panel-right'} />
    </button>
  );

  if (pref.collapsed) return <aside class={`dock dock-${side} collapsed`}>{toggle}</aside>;
  return (
    <aside class={`dock dock-${side}`} style={{ width: `${pref.width}px` }} aria-label={label}>
      <div class="dock-bar">{toggle}</div>
      <div class="dock-body">{children}</div>
      <div
        class="dock-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label}`}
        onPointerDown={startResize}
      />
    </aside>
  );
}
