import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { Icon } from '../icons';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusables = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];

/** A modal dialog: Esc and the backdrop close it, Tab stays inside, and focus returns on close. */
export function Dialog({
  title,
  open,
  onClose,
  children,
  footer,
}: {
  title: string;
  open: boolean;
  onClose(): void;
  children: ComponentChildren;
  footer?: ComponentChildren;
}): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    (focusables(bodyRef.current!)[0] ?? ref.current!).focus();
    return () => previous?.focus?.();
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Tab') {
      const items = focusables(ref.current!);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      class="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={ref}
        onKeyDown={onKeyDown}
      >
        <header class="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button class="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </header>
        <div class="dialog-body" ref={bodyRef}>
          {children}
        </div>
        {footer && <footer class="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}
