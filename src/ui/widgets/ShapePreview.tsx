// The Generators panel's shape preview (spec §13.9): the shape drawn small into its own canvas, turning
// slowly about the vertical. Spin stops the turning; dragging the picture turns and tilts it by hand.
// The shape loads 150 ms after it last changed, so a run of edits to one number loads it once.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Doc } from '../../core/types';
import { loadPref, savePref } from '../../storage/prefs';
import {
  drawShapePreview,
  loadShapePreview,
  START_VIEW,
  type PreviewView,
} from '../../viewport/shape-preview';

/** How long the shape must stay unchanged before it is loaded. */
const LOAD_MS = 150;
/** Turning speed, radians a second: once round in 12 s. */
const SPIN = (2 * Math.PI) / 12;
/** Radians per pixel dragged. */
const DRAG = 0.01;
/** The view tilts no closer to straight up or down than this. */
const POLE = (80 * Math.PI) / 180;

/** The shape `sub` drawn into the canvas; blank for no shape. */
export function ShapePreview({ sub }: { sub: Doc | null }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const [spin, setSpin] = useState(() => loadPref<unknown>('genPreviewSpin', true) !== false);
  const view = useRef<PreviewView>(START_VIEW);
  const drag = useRef<{ x: number; y: number; from: PreviewView } | null>(null);
  const draw = () => {
    if (ref.current) drawShapePreview(ref.current, view.current);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadShapePreview(sub);
      draw();
    }, LOAD_MS);
    return () => clearTimeout(timer);
  }, [sub]);

  // Turns a little every frame, except while the picture is held.
  useEffect(() => {
    if (!spin) return;
    let frame = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (last !== null && !drag.current) {
        const { yaw, pitch } = view.current;
        view.current = { yaw: yaw + (SPIN * (now - last)) / 1000, pitch };
      }
      last = now;
      draw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spin]);

  const onPointerDown = (e: JSX.TargetedPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, from: view.current };
  };
  const onPointerMove = (e: JSX.TargetedPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    // The near side follows the cursor: dragging left swings the camera right, up dips it.
    view.current = {
      yaw: d.from.yaw - (e.clientX - d.x) * DRAG,
      pitch: Math.min(POLE, Math.max(-POLE, d.from.pitch + (e.clientY - d.y) * DRAG)),
    };
    draw();
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div class="gen-preview-box">
      <canvas
        ref={ref}
        class="gen-preview"
        width={240}
        height={150}
        role="img"
        aria-label="Shape preview"
        title="Drag to turn the shape"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <label class="gen-preview-spin">
        <input
          type="checkbox"
          checked={spin}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            setSpin(on);
            savePref('genPreviewSpin', on);
          }}
        />
        Spin
      </label>
    </div>
  );
}
