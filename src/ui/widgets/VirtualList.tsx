// A windowed list: only the rows in view are rendered, so a 16K-row tree stays fast.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

/** Rows drawn beyond each edge of the window, so a quick scroll shows no gap. */
const OVERSCAN = 8;

/**
 * Renders the rows in view. Every row is `rowHeight` px tall. The window comes from `height`, not from
 * measuring the DOM, so a caller that cannot measure its container passes a default.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  render,
  height,
}: {
  items: readonly T[];
  rowHeight: number;
  render(item: T, index: number): JSX.Element;
  height: number;
}): JSX.Element {
  const [scrollTop, setScrollTop] = useState(0);
  // Clamped, so a list that shrinks cannot leave the window past its last row.
  const offset = Math.min(scrollTop, Math.max(0, items.length * rowHeight - height));
  const first = Math.max(0, Math.floor(offset / rowHeight) - OVERSCAN);
  const last = Math.min(items.length, Math.ceil((offset + height) / rowHeight) + OVERSCAN);
  const rows: JSX.Element[] = [];
  for (let i = first; i < last; i++) {
    rows.push(
      <div
        key={i}
        class="virtual-row"
        style={{ top: `${i * rowHeight}px`, height: `${rowHeight}px` }}
      >
        {render(items[i], i)}
      </div>,
    );
  }
  return (
    <div
      class="virtual-list"
      style={{ height: `${height}px` }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div class="virtual-spacer" style={{ height: `${items.length * rowHeight}px` }}>
        {rows}
      </div>
    </div>
  );
}
