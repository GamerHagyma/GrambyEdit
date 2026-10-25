// @vitest-environment jsdom
import {
  activateServo,
  advanceServoSimulation,
  releaseServo,
  startServoLifecycle,
  cancelServoSimulation,
} from '../../src/state/servo-simulation';
import {
  servoPreviewSig,
  withServoPreview,
  servoSustainEnabled,
} from '../../src/state/servo-preview';
import {
  docSig,
  loadDoc,
  historySig,
  undo,
  commit,
  resetStoreForTests,
} from '../../src/state/store';
import { select } from '../../src/state/selection';
import { inspectorTabSig } from '../../src/state/ui';
import { docOf, part } from '../helpers/doc';
let stop: () => void;
beforeEach(() => {
  resetStoreForTests();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  loadDoc(docOf(part(1, 'Servo', [], { Rest: false })));
  select([1], 'replace');
  inspectorTabSig.value = 'properties';
  stop = startServoLifecycle();
});
afterEach(() => {
  stop();
  cancelServoSimulation();
  vi.unstubAllGlobals();
});
test('frames share exact preview angle, and release commits once with undo', () => {
  const original = docSig.value;
  activateServo(1, 1, false);
  advanceServoSimulation(0.25);
  advanceServoSimulation(0.1);
  expect(withServoPreview(original).parts.get(1)!.props.Rotation).toBe(15.75);
  expect(docSig.value).toBe(original);
  expect(historySig.value.past).toHaveLength(0);
  releaseServo(1);
  expect(servoPreviewSig.value).toBeNull();
  expect(docSig.value.parts.get(1)!.props.Rotation).toBe(15.75);
  expect(historySig.value.past).toHaveLength(1);
  undo();
  expect(docSig.value.parts.get(1)!.props.Rotation).toBeUndefined();
});
test('red/blue switch direction; an old release does not stop the new direction; sustain toggles', () => {
  activateServo(1, -1, false);
  advanceServoSimulation(0.2);
  activateServo(1, 1, false);
  releaseServo(-1);
  expect(servoPreviewSig.value?.direction).toBe(1);
  advanceServoSimulation(0.1);
  expect(servoPreviewSig.value?.angle).toBe(-4.5);
  activateServo(1, 1, true);
  expect(servoPreviewSig.value).toBeNull();
  expect(docSig.value.parts.get(1)!.props.Rotation).toBe(-4.5);
});
test('Rest returns to zero at configured speed with no per-frame undo entries', () => {
  loadDoc(docOf(part(1, 'Servo_Physics', [], { Rest: true })));
  select([1], 'replace');
  activateServo(1, 1, false);
  advanceServoSimulation(0.5);
  releaseServo();
  expect(servoPreviewSig.value?.direction).toBe(0);
  advanceServoSimulation(0.25);
  expect(servoPreviewSig.value?.angle).toBe(11.25);
  advanceServoSimulation(0.25);
  expect(servoPreviewSig.value).toBeNull();
  expect(historySig.value.past).toHaveLength(0);
});
test('real edits and New/import cancel stale angles rather than writing over the new doc', () => {
  activateServo(1, 1, false);
  advanceServoSimulation(0.2);
  commit('Edit', (d) => d.set({ ...d.get(1)!, props: { Rest: false, Speed: 99 } }));
  expect(servoPreviewSig.value).toBeNull();
  expect(docSig.value.parts.get(1)!.props.Speed).toBe(99);
  expect(historySig.value.past).toHaveLength(1);
  activateServo(1, 1, false);
  loadDoc(docOf(part(1, 'Part')));
  advanceServoSimulation(1);
  expect(servoPreviewSig.value).toBeNull();
  expect(docSig.value.parts.get(1)!.type).toBe('Part');
  expect(historySig.value.past).toHaveLength(0);
});
test('blur releases sustained activation but inspector tab changes keep it running', () => {
  activateServo(1, 1, true);
  advanceServoSimulation(0.2);
  window.dispatchEvent(new Event('blur'));
  expect(servoPreviewSig.value).toBeNull();
  activateServo(1, -1, true);
  advanceServoSimulation(0.1);
  inspectorTabSig.value = 'reference';
  expect(servoPreviewSig.value?.direction).toBe(-1);
  advanceServoSimulation(0.1);
  expect(servoPreviewSig.value?.angle).toBeCloseTo(0);
});

test('replacing the workspace with the same document object cancels its active preview', () => {
  const original = docSig.value;
  activateServo(1, 1, false);
  advanceServoSimulation(0.2);
  loadDoc(original);
  expect(servoPreviewSig.value).toBeNull();
  expect(historySig.value.past).toHaveLength(0);
});

test('sustained rotation and preference survive selection changes; explicit release still stops', () => {
  loadDoc(docOf(part(1, 'Servo'), part(2, 'Part')));
  select([1], 'replace');
  activateServo(1, 1, true);
  advanceServoSimulation(0.2);
  select([2], 'replace');
  expect(servoPreviewSig.value?.direction).toBe(1);
  advanceServoSimulation(0.2);
  expect(servoPreviewSig.value?.angle).toBe(18);
  select([1], 'replace');
  expect(servoSustainEnabled(1)).toBe(true);
  releaseServo();
  expect(servoPreviewSig.value).toBeNull();
  expect(docSig.value.parts.get(1)!.props.Rotation).toBe(18);
});

test('momentary activation still releases on deselection and Sustain clears on workspace replacement', () => {
  loadDoc(docOf(part(1, 'Servo'), part(2, 'Part')));
  select([1], 'replace');
  activateServo(1, 1, false);
  advanceServoSimulation(0.1);
  select([2], 'replace');
  expect(servoPreviewSig.value).toBeNull();
  select([1], 'replace');
  activateServo(1, 1, true);
  expect(servoSustainEnabled(1)).toBe(true);
  loadDoc(docOf(part(1, 'Servo')));
  expect(servoPreviewSig.value).toBeNull();
  expect(servoSustainEnabled(1)).toBe(false);
});
