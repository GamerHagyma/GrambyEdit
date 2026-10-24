// @vitest-environment jsdom
import { Vector2, Vector3 } from 'three';
import { hoverSig } from '../../src/state/selection';
import { statusHintSig } from '../../src/state/ui';
import { registerTool, setTool, toolSig, type Tool, type ToolId } from '../../src/tools/manager';
import { cancelPick, createPickTool, pickSig, startPick } from '../../src/tools/pick';
import { pickPart, type Hit } from '../../src/viewport/raycast';
import { setViewport } from '../../src/viewport/context';
import { fakeViewport } from '../helpers/viewport';

vi.mock('../../src/viewport/raycast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  pickPart: vi.fn(() => null),
}));

const dummy = (id: ToolId): Tool => ({ id, activate() {}, deactivate() {} });
const hit = (part: number): Hit => ({
  part,
  body: 0,
  point: new Vector3(),
  normal: new Vector3(0, 1, 0),
  subPart: 'Part',
  distance: 1,
});
const pointer = (kind: 'down' | 'move' | 'up', x = 10, button = 0) => ({
  kind,
  button,
  x,
  y: 10,
  ndc: new Vector2(),
  shift: false,
  ctrl: false,
  alt: false,
});
const click = (tool: Tool, x = 10) => {
  tool.onPointer!(pointer('down', x));
  tool.onPointer!(pointer('up', x));
};

const tool = createPickTool();
beforeAll(() => {
  registerTool(tool);
  for (const id of ['select', 'move', 'surface'] as const) registerTool(dummy(id));
});
beforeEach(() => {
  setTool('select');
  vi.mocked(pickPart).mockReturnValue(null);
});

test('a click on a part answers the pick and goes back to the tool from before', () => {
  const onPick = vi.fn();
  setTool('move');
  startPick({ prompt: 'Pick a part', onPick });
  expect(toolSig.value).toBe('pick');
  expect(statusHintSig.value).toBe('Pick a part');

  vi.mocked(pickPart).mockReturnValue(hit(7));
  tool.onPointer!(pointer('move', 10, -1));
  expect(hoverSig.value).toBe(7);
  click(tool);
  expect(onPick).toHaveBeenCalledTimes(1);
  expect(onPick.mock.calls[0][0].part).toBe(7);
  expect(toolSig.value).toBe('move');
  expect(statusHintSig.value).toBeNull();
  expect(hoverSig.value).toBeNull();
  expect(pickSig.value).toBeNull();
});

test('a pick can hand over to another tool', () => {
  startPick({ prompt: 'Pick the parent', onPick: () => {}, then: 'surface' });
  vi.mocked(pickPart).mockReturnValue(hit(1));
  click(tool);
  expect(toolSig.value).toBe('surface');
});

test('empty space and drags pick nothing; Esc cancels', () => {
  const onPick = vi.fn();
  startPick({ prompt: 'Pick a part', onPick });
  click(tool);
  expect(toolSig.value).toBe('pick');
  vi.mocked(pickPart).mockReturnValue(hit(1));
  tool.onPointer!(pointer('down', 10));
  tool.onPointer!(pointer('up', 30));
  expect(onPick).not.toHaveBeenCalled();
  expect(tool.onKey!(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
  expect(toolSig.value).toBe('select');
  expect(onPick).not.toHaveBeenCalled();
});

test('choosing another tool mid-pick drops the pick and keeps that tool', () => {
  const onPick = vi.fn();
  startPick({ prompt: 'Pick a part', onPick });
  setTool('move');
  expect(pickSig.value).toBeNull();
  cancelPick();
  expect(toolSig.value).toBe('move');
});

test('the view shows the picker cursor while a pick waits, and drops it when the pick ends', () => {
  const vp = fakeViewport();
  setViewport(vp);
  try {
    startPick({ prompt: 'Pick a part', onPick: () => {} });
    expect(vp.canvas.classList.contains('picking')).toBe(true);
    cancelPick();
    expect(vp.canvas.classList.contains('picking')).toBe(false);

    startPick({ prompt: 'Pick a part', onPick: () => {} });
    vi.mocked(pickPart).mockReturnValue(hit(3));
    click(tool);
    expect(vp.canvas.classList.contains('picking')).toBe(false);
  } finally {
    setViewport(null);
  }
});
