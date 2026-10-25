import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { isTypingTarget } from '../../state/keymap';
import {
  activeReferenceIdSig,
  activeReferenceSig,
  addReferenceFile,
  addReferenceUrl,
  pasteReference,
  referenceControlsCollapsedSig,
  referenceErrorSig,
  referenceFloatingSig,
  referencesSig,
  referenceViews,
  removeReference,
  type ReferenceImage,
} from '../../state/references';
import { showInspectorTab } from '../../state/ui';

function ImageView({ image }: { image: ReferenceImage }): JSX.Element {
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState(() => referenceViews.get(image.id) ?? { scale: 1, x: 0, y: 0 });
  const area = useRef<HTMLDivElement>(null);
  const element = useRef<HTMLImageElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; view: typeof view } | null>(null);
  const constrain = (next: typeof view): typeof view => {
    const scale = Math.max(1, Math.min(8, next.scale));
    const size = area.current?.getBoundingClientRect();
    const image = element.current;
    if (!size?.width || !size.height || !image?.naturalWidth || !image.naturalHeight)
      return { ...next, scale };
    const fitted = Math.min(size.width / image.naturalWidth, size.height / image.naturalHeight);
    const x = Math.max(0, (image.naturalWidth * fitted * scale - size.width) / 2);
    const y = Math.max(0, (image.naturalHeight * fitted * scale - size.height) / 2);
    return { scale, x: Math.max(-x, Math.min(x, next.x)), y: Math.max(-y, Math.min(y, next.y)) };
  };
  useLayoutEffect(() => {
    referenceViews.set(image.id, view);
  }, [image.id, view]);
  useLayoutEffect(() => {
    const resize = () => setView((v) => constrain(v));
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    if (area.current) observer?.observe(area.current);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);
  const zoom = (factor: number) => setView((v) => constrain({ ...v, scale: v.scale * factor }));
  const endDrag = (e: PointerEvent) => {
    if (drag.current?.pointer !== e.pointerId) return;
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };
  if (failed)
    return (
      <p class="reference-load-error" role="alert">
        Could not load this image. Check the direct image URL or choose another file.
      </p>
    );
  return (
    <>
      <div class="reference-navigation" aria-label="Image zoom controls">
        <button
          class="button"
          aria-label="Zoom out reference"
          disabled={view.scale <= 1}
          onClick={() => zoom(1 / 1.25)}
        >
          −
        </button>
        <output aria-label="Reference zoom">{Math.round(view.scale * 100)}%</output>
        <button
          class="button"
          aria-label="Zoom in reference"
          disabled={view.scale >= 8}
          onClick={() => zoom(1.25)}
        >
          +
        </button>
        <button
          class="button"
          aria-label="Fit reference image"
          onClick={() => {
            drag.current = null;
            setView({ scale: 1, x: 0, y: 0 });
          }}
        >
          Fit
        </button>
      </div>
      <div
        class="reference-image-area"
        ref={area}
        role="group"
        tabIndex={0}
        aria-label="Reference image navigation"
        title="Scroll to zoom; drag to pan"
        style={{ cursor: view.scale > 1 ? 'grab' : 'default' }}
        onWheel={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 200 : 1);
          zoom(Math.exp(-Math.max(-2000, Math.min(2000, delta)) * 0.002));
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || view.scale <= 1 || drag.current) return;
          e.preventDefault();
          e.currentTarget.focus({ preventScroll: true });
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, view };
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start || start.pointer !== e.pointerId) return;
          setView(
            constrain({
              ...view,
              x: start.view.x + e.clientX - start.x,
              y: start.view.y + e.clientY - start.y,
            }),
          );
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <img
          class="reference-image"
          ref={element}
          src={image.src}
          alt={`Reference: ${image.name}`}
          referrerPolicy="no-referrer"
          draggable={false}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          onLoad={() => setView((v) => constrain(v))}
          onError={() => setFailed(true)}
        />
      </div>
    </>
  );
}

function ReferenceContent(): JSX.Element {
  const [url, setUrl] = useState('');
  const collapsed = referenceControlsCollapsedSig.value;
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
      <div class="reference-toolbar">
        <button
          class="button"
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} reference controls`}
          aria-expanded={!collapsed}
          onClick={() => {
            referenceControlsCollapsedSig.value = !collapsed;
          }}
        >
          {collapsed ? '▸' : '▾'} <span>Image controls</span>
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
      </div>
      {!collapsed && (
        <>
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
            {active && (
              <button class="button" onClick={() => removeReference(active.id)}>
                Remove image
              </button>
            )}
          </div>
        </>
      )}
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
      {!collapsed && referencesSig.value.length > 0 && (
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

type Corner = 'top left' | 'top right' | 'bottom left' | 'bottom right';
const corners: readonly Corner[] = ['top left', 'top right', 'bottom left', 'bottom right'];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Keeps controls reachable even after the browser window becomes smaller. */
function fit(bounds: Bounds): Bounds {
  const mx = Math.min(8, Math.max(0, (window.innerWidth - 1) / 2));
  const my = Math.min(8, Math.max(0, (window.innerHeight - 1) / 2));
  const width = Math.min(Math.max(240, bounds.width), Math.max(1, window.innerWidth - mx * 2));
  const height = Math.min(Math.max(240, bounds.height), Math.max(1, window.innerHeight - my * 2));
  return {
    width,
    height,
    x: clamp(bounds.x, mx, window.innerWidth - width - mx),
    y: clamp(bounds.y, my, window.innerHeight - height - my),
  };
}

/** Clamp the dragged edges instead of moving the opposite corner at a boundary. */
function resizeBounds(bounds: Bounds, corner: Corner, dx: number, dy: number): Bounds {
  const mx = Math.min(8, Math.max(0, (window.innerWidth - 1) / 2));
  const my = Math.min(8, Math.max(0, (window.innerHeight - 1) / 2));
  const minWidth = Math.min(240, window.innerWidth - mx * 2);
  const minHeight = Math.min(240, window.innerHeight - my * 2);
  const right = bounds.x + bounds.width,
    bottom = bounds.y + bounds.height;
  const x = corner.includes('left') ? clamp(bounds.x + dx, mx, right - minWidth) : bounds.x;
  const y = corner.includes('top') ? clamp(bounds.y + dy, my, bottom - minHeight) : bounds.y;
  return {
    x,
    y,
    width: corner.includes('left')
      ? right - x
      : clamp(bounds.width + dx, minWidth, window.innerWidth - mx - x),
    height: corner.includes('top')
      ? bottom - y
      : clamp(bounds.height + dy, minHeight, window.innerHeight - my - y),
  };
}

/** Always mounted beside Shell, so the pinned reference survives changing inspector tabs. */
export function ReferenceWindow(): JSX.Element | null {
  const [bounds, setBounds] = useState(() =>
    fit({ x: window.innerWidth - 720, y: 80, width: 400, height: 420 }),
  );
  const drag = useRef<{
    mode: 'move' | Corner;
    pointer: number;
    x: number;
    y: number;
    bounds: Bounds;
  } | null>(null);
  useEffect(() => {
    const resize = () => {
      drag.current = null;
      setBounds((b) => fit(b));
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  if (!referenceFloatingSig.value) return null;

  const handles = (mode: 'move' | Corner) => ({
    onPointerDown(e: PointerEvent) {
      if (e.button !== 0 || drag.current) return;
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
        start.mode === 'move'
          ? fit({ ...start.bounds, x: start.bounds.x + dx, y: start.bounds.y + dy })
          : resizeBounds(start.bounds, start.mode, dx, dy),
      );
    },
    onPointerUp(e: PointerEvent) {
      if (drag.current?.pointer !== e.pointerId) return;
      drag.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    },
    onPointerCancel(e: PointerEvent) {
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
        mode === 'move'
          ? fit({ ...b, x: b.x + dx * step, y: b.y + dy * step })
          : resizeBounds(b, mode, dx * step, dy * step),
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
      {corners.map((corner) => (
        <button
          key={corner}
          class={`reference-resize reference-resize-${corner.replace(' ', '-')}`}
          aria-label={`Resize reference window ${corner}`}
          title="Drag to resize; arrow keys also resize"
          {...handles(corner)}
        >
          ◢
        </button>
      ))}
    </section>
  );
}
