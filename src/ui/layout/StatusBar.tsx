import type { ComponentChildren, JSX } from 'preact';

export function StatusBar({ children }: { children: ComponentChildren }): JSX.Element {
  return <footer class="status-bar">{children}</footer>;
}
