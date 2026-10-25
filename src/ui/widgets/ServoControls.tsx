import type { JSX } from 'preact';
import { useLayoutEffect, useState } from 'preact/hooks';
import type { PartId } from '../../core/types';
import type { ServoDirection } from '../../core/servo-simulation';
import { servoPreviewSig } from '../../state/servo-preview';
import { activateServo, releaseServo } from '../../state/servo-simulation';

export function ServoControls({ id }: { readonly id: PartId }): JSX.Element {
  const [sustain, setSustain] = useState(false);
  const preview = servoPreviewSig.value;
  const direction = preview?.id === id ? preview.direction : 0;
  useLayoutEffect(
    () => () => {
      if (servoPreviewSig.peek()?.id === id) releaseServo();
    },
    [id],
  );
  const button = (
    directionValue: Exclude<ServoDirection, 0>,
    label: string,
    color: string,
  ): JSX.Element => (
    <button
      type="button"
      class={`button servo-activation ${color}`}
      aria-label={label}
      aria-pressed={direction === directionValue}
      onPointerDown={(e) => {
        if (e.button !== 0 || sustain) return;
        e.preventDefault();
        // Commit a numeric field before disabling it for the preview, so this run uses the edit.
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && focused !== e.currentTarget) focused.blur();
        e.currentTarget.setPointerCapture(e.pointerId);
        activateServo(id, directionValue, false);
      }}
      onPointerUp={() => {
        if (!sustain) releaseServo(directionValue);
      }}
      onPointerCancel={() => releaseServo(directionValue)}
      onLostPointerCapture={() => {
        if (!sustain) releaseServo(directionValue);
      }}
      onClick={() => {
        if (sustain) activateServo(id, directionValue, true);
      }}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (!e.repeat) activateServo(id, directionValue, sustain);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (!sustain) releaseServo(directionValue);
        }
      }}
      onBlur={() => {
        if (!sustain) releaseServo(directionValue);
      }}
    >
      {`${color === 'red' ? 'Red' : 'Blue'} ${directionValue < 0 ? '−' : '+'}`}
    </button>
  );
  return (
    <section class="properties-section servo-controls" role="group" aria-label="Simulate">
      <h3>Simulate</h3>
      <div class="servo-buttons">
        {button(1, 'Red — positive', 'red')}
        {button(-1, 'Blue — negative', 'blue')}
      </div>
      <label class="servo-sustain">
        <input
          type="checkbox"
          checked={sustain}
          onChange={(e) => {
            releaseServo();
            setSustain(e.currentTarget.checked);
          }}
        />
        Sustain
      </label>
      <p class="muted">
        {sustain
          ? 'Click a direction to toggle it on or off.'
          : 'Hold a direction to rotate; release to stop.'}
      </p>
      {preview?.id === id && (
        <button type="button" class="button small" onClick={() => releaseServo()}>
          Stop
        </button>
      )}
    </section>
  );
}
