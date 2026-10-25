// A run previews frames, then remembers its final angle with one undoable edit.
import { effect } from '@preact/signals';
import { isServo, servoSettings, stepServo, type ServoDirection } from '../core/servo-simulation';
import type { PartId } from '../core/types';
import { cancelModal } from '../tools/modal';
import { cancelPick } from '../tools/pick';
import { setTool } from '../tools/manager';
import { disarm } from './place';
import { selectionSig } from './selection';
import { servoPreviewSig } from './servo-preview';
import { commit, docSig, workspaceVersionSig } from './store';
import { committedPosesSig } from './derived';
import { POSE_CYCLE } from '../core/pose';
import { toast } from './toasts';
import { inspectorTabSig } from './ui';

let frame = 0;
let lastTime: number | null = null;
function cancelFrame(): void {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  lastTime = null;
}
export function cancelServoSimulation(): void {
  cancelFrame();
  servoPreviewSig.value = null;
}
export function finishServoSimulation(): void {
  const preview = servoPreviewSig.peek();
  cancelServoSimulation();
  if (!preview || preview.doc !== docSig.peek() || preview.workspace !== workspaceVersionSig.peek())
    return;
  const part = preview.doc.parts.get(preview.id)!;
  if (servoSettings(part.props).Rotation === preview.angle) return;
  commit('Simulate servo', (d) =>
    d.set({ ...part, props: { ...part.props, Rotation: preview.angle } }),
  );
}
function requestStep(): void {
  if (frame || !servoPreviewSig.peek()) return;
  frame = requestAnimationFrame((time) => {
    frame = 0;
    const dt = lastTime === null ? 0 : Math.min(0.1, (time - lastTime) / 1000);
    lastTime = time;
    advanceServoSimulation(dt);
    const p = servoPreviewSig.peek();
    if (p) {
      const s = servoSettings(p.doc.parts.get(p.id)!.props);
      // At a limit or with zero speed, wait for input instead of requesting idle frames.
      if (stepServo(p.angle, p.direction, s, 0.01) !== p.angle) requestStep();
      else lastTime = null;
    }
  });
}
/** Also used by deterministic tests: time is supplied rather than read here. */
export function advanceServoSimulation(dt: number): void {
  const p = servoPreviewSig.peek();
  if (!p) return;
  if (p.doc !== docSig.peek() || p.workspace !== workspaceVersionSig.peek()) {
    cancelServoSimulation();
    return;
  }
  const s = servoSettings(p.doc.parts.get(p.id)!.props);
  const angle = stepServo(p.angle, p.direction, s, dt);
  if (angle !== p.angle) servoPreviewSig.value = { ...p, angle };
  if (p.direction === 0 && (!s.Rest || angle === 0 || s.Speed === 0)) finishServoSimulation();
}
export function activateServo(
  id: PartId,
  direction: Exclude<ServoDirection, 0>,
  sustain: boolean,
): void {
  let p = servoPreviewSig.peek();
  if (p && (p.id !== id || p.doc !== docSig.peek())) {
    finishServoSimulation();
    p = null;
  }
  const doc = docSig.peek(),
    part = doc.parts.get(id);
  if (!part || !isServo(part.type)) return;
  if ((committedPosesSig.value.flags.get(id) ?? 0) & POSE_CYCLE) {
    toast('This servo is on an attachment cycle. Resolve it in Issues before simulating.', 'warn');
    return;
  }
  if (!p) {
    cancelModal();
    cancelPick();
    disarm();
    setTool('select');
  }
  const next = sustain && p?.direction === direction ? 0 : direction;
  servoPreviewSig.value = {
    workspace: workspaceVersionSig.peek(),
    doc,
    id,
    angle: p?.angle ?? servoSettings(part.props).Rotation,
    direction: next,
  };
  advanceServoSimulation(0);
  requestStep();
}
/** Ignore releases from an older direction when a newer button has taken over. */
export function releaseServo(direction?: Exclude<ServoDirection, 0>): void {
  const p = servoPreviewSig.peek();
  if (!p || (direction !== undefined && p.direction !== direction)) return;
  if (p.direction !== 0) servoPreviewSig.value = { ...p, direction: 0 };
  advanceServoSimulation(0);
  requestStep();
}
/** Installed once by App; an ordinary edit/undo/import cancels a stale preview. */
export function startServoLifecycle(): () => void {
  const stop = effect(() => {
    const doc = docSig.value,
      workspace = workspaceVersionSig.value,
      p = servoPreviewSig.value,
      selected = selectionSig.value.parts,
      tab = inspectorTabSig.value;
    if (!p) return;
    if (p.doc !== doc || p.workspace !== workspace) {
      cancelServoSimulation();
      return;
    }
    if (p.direction !== 0 && (selected.size !== 1 || !selected.has(p.id) || tab !== 'properties'))
      releaseServo();
  });
  const release = () => releaseServo();
  const visibility = () => {
    if (document.hidden) release();
  };
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    stop();
    window.removeEventListener('blur', release);
    document.removeEventListener('visibilitychange', visibility);
    cancelServoSimulation();
  };
}
