// @vitest-environment jsdom
// Exercise the real drag tools and history; only camera picking is controlled here.
import { Vector2, Vector3 } from 'three';
import { bodyWorld, computePoses } from '../../src/core/pose';
import { parseShareText, toShareCode } from '../../src/core/share';
import { selectPiece, select } from '../../src/state/selection';
import { baseCatalogSig, docSig, loadDoc, resetStoreForTests, undo } from '../../src/state/store';
import { createTransformTool, reattachSig, transformStateSig } from '../../src/tools/transform';
import { setViewport } from '../../src/viewport/context';
import { pickPart, pickPoint, pickSocketWhere, type Hit } from '../../src/viewport/raycast';
import { docOf, mount, part, pt, sock } from '../helpers/doc';
import { realCatalog } from '../helpers/real-catalog';
import { fakeViewport } from '../helpers/viewport';
import { shiftSocketSig, socketFocusSig } from '../../src/state/socket-focus';

vi.mock('../../src/viewport/raycast', () => ({
  pickPart: vi.fn(),
  pickPoint: vi.fn(() => null),
  pickSocketWhere: vi.fn(),
  cursorRay: () => null,
}));

const hit = (body: number): Hit => ({
  part: 2,
  body,
  point: new Vector3(0, 0.8, 0),
  normal: new Vector3(0, 1, 0),
  subPart: 'Wire',
  distance: 1,
});
const pointer = (kind: 'down' | 'move' | 'up', x: number) => ({
  kind,
  x,
  y: 100,
  ndc: new Vector2(),
  button: 0,
  shift: false,
  ctrl: false,
  alt: false,
});

beforeEach(async () => {
  resetStoreForTests();
  baseCatalogSig.value = await realCatalog();
  setViewport(fakeViewport());
  vi.mocked(pickPoint).mockReturnValue(null);
  vi.mocked(pickSocketWhere).mockReturnValue(null);
  vi.mocked(pickPart).mockReturnValue(hit(0));
  transformStateSig.value = 'idle';
});
afterEach(() => {
  setViewport(null);
  reattachSig.value = null;
  shiftSocketSig.value = false;
  socketFocusSig.value = null;
});

test.each(['select', 'move'] as const)(
  '%s reattaches ordinary single-piece parts and carries independent selections rigidly',
  async (id) => {
    loadDoc({
      ...docOf(part(1, 'Part'), part(2, 'Part'), part(3, 'Part')),
      layout: new Map([
        [2, [2, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]],
        [3, [4, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]],
      ]),
    });
    select([2, 3], 'replace');
    const tool = createTransformTool(id);
    tool.onPointer!(pointer('down', 100));
    vi.mocked(pickSocketWhere).mockImplementation((_p, accept) =>
      accept({ part: 1, socket: '6' }) ? { part: 1, socket: '6' } : null,
    );
    vi.mocked(pickPart).mockReturnValue(null);
    tool.onPointer!(pointer('move', 120));
    expect(reattachSig.value?.moving.has(3)).toBe(true);
    tool.onPointer!(pointer('up', 120));
    expect(docSig.value.parts.get(2)!.conns[0].target).toEqual({
      kind: 'socket',
      part: 1,
      socket: '6',
    });
    const cat = await realCatalog(),
      poses = computePoses(docSig.value, cat, cat.conventions);
    expect(poses.world.get(3)!.elements[12] - poses.world.get(2)!.elements[12]).toBeCloseTo(2);
    undo();
    expect(docSig.value.parts.get(2)!.conns).toEqual([]);
  },
);

test('ordinary part center yields the Move gizmo to reattachment', () => {
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part')));
  select([2], 'replace');
  const cancel = vi.fn();
  setViewport(fakeViewport({ gizmo: { busy: () => true, axis: () => 'XYZ', cancel } as never }));
  const tool = createTransformTool('move');
  tool.onPointer!(pointer('down', 100));
  expect(cancel).toHaveBeenCalled();
  vi.mocked(pickSocketWhere).mockImplementation((_p, accept) =>
    accept({ part: 1, socket: '6' }) ? { part: 1, socket: '6' } : null,
  );
  tool.onPointer!(pointer('move', 120));
  tool.onPointer!(pointer('up', 120));
  expect(docSig.value.parts.get(2)!.conns[0].target).toEqual({
    kind: 'socket',
    part: 1,
    socket: '6',
  });
});
test('deleting a pressed part before its drag starts safely drops the press', () => {
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part')));
  select([2], 'replace');
  const tool = createTransformTool('select');
  tool.onPointer!(pointer('down', 100));
  loadDoc(docOf(part(1, 'Part')));
  expect(() => tool.onPointer!(pointer('move', 120))).not.toThrow();
});

test.each(['select', 'move'] as const)(
  '%s drags a selected Wire end onto its own other socket',
  async (id) => {
    const doc = docOf(
      part(1, 'Part'),
      part(2, 'Wire', [sock('3', 3, '2')]),
      part(3, 'Button', [sock('3', 1, '6')]),
    );
    loadDoc(doc);
    selectPiece(2, 0, 'replace');
    const tool = createTransformTool(id);
    tool.onPointer!(pointer('down', 100));
    vi.mocked(pickSocketWhere).mockImplementation((_ndc, accept) =>
      accept({ part: 2, socket: '4' }) ? { part: 2, socket: '4' } : null,
    );
    vi.mocked(pickPart).mockReturnValue(null);
    tool.onPointer!(pointer('move', 120));
    expect(reattachSig.value!.moving.has(2)).toBe(false);
    tool.onPointer!(pointer('up', 120));
    expect(docSig.value.parts.get(2)!.conns).toEqual([sock('3', 3, '2'), sock('1', 2, '4')]);
    const cat = await realCatalog();
    const poses = computePoses(docSig.value, cat, cat.conventions);
    const back = parseShareText(toShareCode(docSig.value));
    if (!back.ok) throw new Error(back.message);
    expect(bodyWorld(computePoses(back.doc, cat, cat.conventions), 2, 0)!.elements).toEqual(
      bodyWorld(poses, 2, 0)!.elements,
    );
    expect(undo()).toBe(true);
    expect(docSig.value.parts.get(2)).toEqual(doc.parts.get(2));
  },
);

test('a surface drag looks through the moving body and stacks on the stationary body', async () => {
  loadDoc(docOf(part(1, 'Part', [], {}, [pt('{p}')]), part(2, 'Wire', [mount('3', 1, '{p}')])));
  const tool = createTransformTool('select');
  tool.onPointer!(pointer('down', 100));
  vi.mocked(pickPart).mockImplementation((_ndc, skip, skipBody) =>
    !skip?.has(2) && skipBody?.part === 2 && skipBody.body === 0 ? hit(1) : null,
  );
  tool.onPointer!(pointer('move', 120));
  tool.onPointer!(pointer('up', 120));
  expect(docSig.value.parts.get(2)!.conns[1]).toMatchObject({
    self: '1',
    target: { kind: 'point', part: 2 },
  });
  expect(docSig.value.parts.get(2)!.points!.size).toBe(1);
});

test('a piece cannot drop onto a socket of that same piece', () => {
  const doc = docOf(
    part(1, 'Part'),
    part(2, 'Wire', [sock('3', 3, '2')]),
    part(3, 'Button', [sock('3', 1, '6')]),
  );
  loadDoc(doc);
  const tool = createTransformTool('select');
  tool.onPointer!(pointer('down', 100));
  vi.mocked(pickSocketWhere).mockImplementation((_ndc, accept) =>
    accept({ part: 2, socket: '2' }) ? { part: 2, socket: '2' } : null,
  );
  vi.mocked(pickPart).mockReturnValue(null);
  tool.onPointer!(pointer('move', 120));
  tool.onPointer!(pointer('up', 120));
  expect(docSig.value).toBe(doc);
});

test('Escape cancels a self-stack drag without changing the document', () => {
  const doc = docOf(
    part(1, 'Part'),
    part(2, 'Wire', [sock('3', 3, '2')]),
    part(3, 'Button', [sock('3', 1, '6')]),
  );
  loadDoc(doc);
  const tool = createTransformTool('select');
  tool.onPointer!(pointer('down', 100));
  vi.mocked(pickSocketWhere).mockImplementation((_ndc, accept) =>
    accept({ part: 2, socket: '4' }) ? { part: 2, socket: '4' } : null,
  );
  tool.onPointer!(pointer('move', 120));
  expect(tool.onKey!(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
  expect(docSig.value).toBe(doc);
  expect(reattachSig.value).toBeNull();
  expect(transformStateSig.value).toBe('idle');
});
