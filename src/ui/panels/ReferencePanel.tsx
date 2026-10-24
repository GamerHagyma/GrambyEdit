import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { isTypingTarget } from '../../state/keymap';
import {
  activeReferenceIdSig,
  activeReferenceSig,
  addReferenceFile,
  addReferenceUrl,
  pasteReference,
  referenceErrorSig,
  referenceFloatingSig,
  referencesSig,
  removeReference,
  type ReferenceImage,
} from '../../state/references';
import { showInspectorTab } from '../../state/ui';

function ImageView({ image }: { image: ReferenceImage }): JSX.Element {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <p class="reference-load-error" role="alert">
        Could not load this image. Check the direct image URL or choose another file.
      </p>
    );
  return (
    <img
      class="reference-image"
      src={image.src}
      alt={`Reference: ${image.name}`}
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

function ReferenceContent(): JSX.Element {
  const [url, setUrl] = useState('');
  const panel = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);
  const active = activeReferenceSig.value;
  const paste = (e: ClipboardEvent) => {
    const data = e.clipboardData;
    if (!data) return;
    const hasImage = [...data.files].some((file) => file.type.startsWith('image/'));
    if (!hasImage && isTypingTarget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    pasteReference(data);
  };
  return (
    <section
      class="reference-panel"
      ref={panel}
      aria-label="Reference images"
      tabIndex={0}
      data-reference-ui
      onPaste={paste}
      onCopy={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <p class="reference-help">
        Paste an image or image link here. References stay outside your build and last until you
        close this page.
      </p>
      <form
        class="reference-url"
        onSubmit={(e) => {
          e.preventDefault();
          if (addReferenceUrl(url)) setUrl('');
        }}
      >
        <input
          type="text"
          aria-label="Image URL"
          placeholder="https://…/image.png"
          value={url}
          onInput={(e) => setUrl(e.currentTarget.value)}
        />
        <button class="button" type="submit">
          Add image
        </button>
      </form>
      <div class="reference-actions">
        <input
          hidden
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          aria-label="Choose image files"
          onChange={(e) => {
            for (const file of e.currentTarget.files ?? []) addReferenceFile(file);
            e.currentTarget.value = '';
          }}
        />
        <button class="button" onClick={() => fileInput.current?.click()}>
          Choose image…
        </button>
        {!referenceFloatingSig.value && (
          <button
            class="button"
            aria-label="Pop out reference"
            onClick={() => {
              referenceFloatingSig.value = true;
            }}
          >
            Pop out ↗
          </button>
        )}
        {active && (
          <button class="button" onClick={() => removeReference(active.id)}>
            Remove image
          </button>
        )}
      </div>
      {referenceErrorSig.value && (
        <p role="alert" class="reference-load-error">
          {referenceErrorSig.value}
        </p>
      )}
      <div class="reference-view">
        {active ? (
          <ImageView key={active.id} image={active} />
        ) : (
          <p class="empty">
            Click here and press Ctrl+V to paste an image.
            <br />
            Or add an image URL above.
          </p>
        )}
      </div>
      {referencesSig.value.length > 0 && (
        <div class="reference-thumbnails" aria-label="Choose a reference">
          {referencesSig.value.map((image) => (
            <button
              key={image.id}
              class="reference-thumbnail"
              title={image.name}
              aria-label={`Show ${image.name}`}
              aria-pressed={active?.id === image.id}
              onClick={() => {
                activeReferenceIdSig.value = image.id;
                referenceErrorSig.value = null;
              }}
            >
              <img src={image.src} alt="" referrerPolicy="no-referrer" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function ReferencePanel(): JSX.Element {
  if (!referenceFloatingSig.value) return <ReferenceContent />;
  return (
    <div class="reference-docked-placeholder" data-reference-ui>
      <p>The reference window is pinned over the editor.</p>
      <button class="button" onClick={dockReference}>
        Dock reference
      </button>
    </div>
  );
}

function dockReference(): void {
  referenceFloatingSig.value = false;
  showInspectorTab('reference');
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Keeps controls reachable even after the browser window becomes smaller. */
function fit(bounds: Bounds): Bounds {
  const width = Math.min(Math.max(240, bounds.width), Math.max(1, window.innerWidth - 16));
  const height = Math.min(Math.max(240, bounds.height), Math.max(1, window.innerHeight - 16));
  return {
    width,
    height,
    x: Math.max(8, Math.min(bounds.x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(bounds.y, window.innerHeight - height - 8)),
  };
}

/** Always mounted beside Shell, so the pinned reference survives changing inspector tabs. */
export function ReferenceWindow(): JSX.Element | null {
  const [bounds, setBounds] = useState(() =>
    fit({ x: window.innerWidth - 720, y: 80, width: 400, height: 420 }),
  );
  const drag = useRef<{
    mode: 'move' | 'resize';
    pointer: number;
    x: number;
    y: number;
    bounds: Bounds;
  } | null>(null);
  useEffect(() => {
    const resize = () => setBounds((b) => fit(b));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  if (!referenceFloatingSig.value) return null;

  const handles = (mode: 'move' | 'resize') => ({
    onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).focus({ preventScroll: true });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { mode, pointer: e.pointerId, x: e.clientX, y: e.clientY, bounds };
    },
    onPointerMove(e: PointerEvent) {
      const start = drag.current;
      if (!start || start.pointer !== e.pointerId) return;
      const dx = e.clientX - start.x,
        dy = e.clientY - start.y;
      setBounds(
        fit(
          start.mode === 'move'
            ? { ...start.bounds, x: start.bounds.x + dx, y: start.bounds.y + dy }
            : { ...start.bounds, width: start.bounds.width + dx, height: start.bounds.height + dy },
        ),
      );
    },
    onPointerUp(e: PointerEvent) {
      if (drag.current?.pointer !== e.pointerId) return;
      drag.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    },
    onLostPointerCapture() {
      drag.current = null;
    },
    onKeyDown(e: KeyboardEvent) {
      const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      const dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (!dx && !dy) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      setBounds((b) =>
        fit(
          mode === 'move'
            ? { ...b, x: b.x + dx * step, y: b.y + dy * step }
            : { ...b, width: b.width + dx * step, height: b.height + dy * step },
        ),
      );
    },
  });
  return (
    <section
      class="reference-window"
      aria-label="Reference window"
      data-reference-ui
      style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
      onKeyDown={(e) => e.stopPropagation()}
      onCopy={(e) => e.stopPropagation()}
    >
      <header class="reference-window-bar">
        <button
          class="reference-drag"
          aria-label="Move reference window"
          title="Drag to move; arrow keys also move"
          {...handles('move')}
        >
          <span>Reference</span>
          <small>Pinned</small>
        </button>
        <button class="button" aria-label="Dock reference" onClick={dockReference}>
          Dock ↙
        </button>
      </header>
      <ReferenceContent />
      <button
        class="reference-resize"
        aria-label="Resize reference window"
        title="Drag to resize; arrow keys also resize"
        {...handles('resize')}
      >
        ◢
      </button>
    </section>
  );
}
