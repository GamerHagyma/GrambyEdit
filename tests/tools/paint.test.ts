// @vitest-environment jsdom
import { Vector2 } from 'three';
import type { ToolPointer } from '../../src/tools/manager';
import {
  brushRadiusSig,
  createPaintTool,
  fillMatchSig,
  paintModeSig,
  paintTargets,
  recentColorsSig,
  type PaintPickers,
} from '../../src/tools/paint';
import { settingsSig, updateSettings } from '../../src/state/settings';
import {
  baseCatalogSig,
  docSig,
  historySig,
  loadDoc,
  resetStoreForTests,
} from '../../src/state/store';
import { toastsSig } from '../../src/state/toasts';
import { docOf, part, sock } from '../helpers/doc';
import { MINI } from '../helpers/catalog';

beforeEach(() => {
  resetStoreForTests();
  localStorage.clear();
  baseCatalogSig.value = MINI;
  paintModeSig.value = 'click';
  fillMatchSig.value = 'color';
  brushRadiusSig.value = 24;
  updateSettings({ activeColor: [163, 162, 165], autoColor: false, xray: false });
});

test('fill floods joint-connected parts of the same color only', () => {
  const d = docOf(part(1, 'Part', [], { RGB: [1, 1, 1] }), part(2, 'Part', [sock('1', 1, '6')], { RGB: [1, 1, 1] }),
    part(3, 'Part', [sock('1', 2, '6')], { RGB: [9, 9, 9] }), part(4, 'Part', [sock('1', 3, '6')], { RGB: [1, 1, 1] }));
  expect(paintTargets(d, 'fill', 1, 'color').sort()).toEqual([1, 2]);
  expect(paintTargets(d, 'fill', 1, 'type').sort()).toEqual([1, 2, 3, 4]);
  expect(paintTargets(d, 'branch', 2, 'color').sort()).toEqual([2, 3, 4]);
});

test('a missing hit paints nothing', () => {
  expect(paintTargets(docOf(), 'click', 9, 'any')).toEqual([]);
});

/** A pointer event at (x, y) with the left button and no modifiers, unless `extra` says otherwise. */
function pointer(kind: ToolPointer['kind'], x: number, y: number, extra: Partial<ToolPointer> = {}): ToolPointer {
  return { kind, button: 0, x, y, ndc: new Vector2(), shift: false, ctrl: false, alt: false, ...extra };
}

/** Pickers that find nothing unless a test overrides them. */
function pickers(over: Partial<PaintPickers> = {}): PaintPickers {
  return { part: () => null, inRect: () => new Set(), inDisc: () => new Set(), ...over };
}

test('a click paints one part as one commit', () => {
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part')));
  updateSettings({ activeColor: [10, 20, 30] });
  const tool = createPaintTool(pickers({ part: () => 1 }));
  tool.onPointer?.(pointer('down', 5, 5));
  tool.onPointer?.(pointer('up', 5, 5));
  expect(docSig.value.parts.get(1)!.props.RGB).toEqual([10, 20, 30]);
  expect(docSig.value.parts.get(2)!.props.RGB).toBeUndefined();
  expect(historySig.value.past.map((p) => p.label)).toEqual(['Paint 1 parts']);
});

test('a click on a part that cannot take paint commits nothing and says so', () => {
  loadDoc(docOf(part(1, 'Gate-AND')));
  const tool = createPaintTool(pickers({ part: () => 1 }));
  tool.onPointer?.(pointer('down', 0, 0));
  tool.onPointer?.(pointer('up', 0, 0));
  expect(historySig.value.past).toHaveLength(0);
  expect(toastsSig.value.at(-1)!.message).toBe("Skipped 1 parts that can't be painted.");
});

test('fill paints the joint-connected run of the clicked color as one commit', () => {
  loadDoc(
    docOf(
      part(1, 'Part', [], { RGB: [1, 1, 1] }),
      part(2, 'Part', [sock('1', 1, '6')], { RGB: [1, 1, 1] }),
      part(3, 'Part', [sock('1', 2, '6')], { RGB: [9, 9, 9] }),
    ),
  );
  paintModeSig.value = 'fill';
  updateSettings({ activeColor: [4, 4, 4] });
  const tool = createPaintTool(pickers({ part: () => 1 }));
  tool.onPointer?.(pointer('down', 0, 0));
  tool.onPointer?.(pointer('up', 0, 0));
  expect(docSig.value.parts.get(1)!.props.RGB).toEqual([4, 4, 4]);
  expect(docSig.value.parts.get(2)!.props.RGB).toEqual([4, 4, 4]);
  expect(docSig.value.parts.get(3)!.props.RGB).toEqual([9, 9, 9]);
  expect(historySig.value.past.map((p) => p.label)).toEqual(['Paint 2 parts']);
});

test('alt-click picks the part color without painting', () => {
  loadDoc(docOf(part(1, 'Part', [], { RGB: [5, 6, 7] })));
  const tool = createPaintTool(pickers({ part: () => 1 }));
  tool.onPointer?.(pointer('down', 0, 0, { alt: true }));
  tool.onPointer?.(pointer('up', 0, 0, { alt: true }));
  expect(settingsSig.value.activeColor).toEqual([5, 6, 7]);
  expect(historySig.value.past).toHaveLength(0);
});

test('alt-click on a part without a color says so and keeps the active color', () => {
  loadDoc(docOf(part(1, 'Gate-AND')));
  const tool = createPaintTool(pickers({ part: () => 1 }));
  tool.onPointer?.(pointer('down', 0, 0, { alt: true }));
  expect(settingsSig.value.activeColor).toEqual([163, 162, 165]);
  expect(toastsSig.value.at(-1)!.message).toBe('That part has no color.');
});

test('box paints what its rectangle holds, seen through walls with X-ray', () => {
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part'), part(3, 'Part')));
  paintModeSig.value = 'box';
  updateSettings({ activeColor: [1, 2, 3], xray: true });
  const inRect = vi.fn(() => new Set<number>([1, 2]));
  const tool = createPaintTool(pickers({ inRect }));
  tool.onPointer?.(pointer('down', 0, 0));
  tool.onPointer?.(pointer('move', 40, 40));
  tool.onPointer?.(pointer('up', 40, 40));
  expect(inRect).toHaveBeenCalledWith({ x0: 0, y0: 0, x1: 40, y1: 40 }, 'xray');
  expect(docSig.value.parts.get(1)!.props.RGB).toEqual([1, 2, 3]);
  expect(docSig.value.parts.get(3)!.props.RGB).toBeUndefined();
  expect(historySig.value.past.map((p) => p.label)).toEqual(['Paint 2 parts']);
});

test('a box press that does not move paints nothing', () => {
  loadDoc(docOf(part(1, 'Part')));
  paintModeSig.value = 'box';
  const inRect = vi.fn(() => new Set<number>([1]));
  const tool = createPaintTool(pickers({ inRect }));
  tool.onPointer?.(pointer('down', 10, 10));
  tool.onPointer?.(pointer('up', 11, 10));
  expect(inRect).not.toHaveBeenCalled();
  expect(historySig.value.past).toHaveLength(0);
});

test('brush collects discs during the stroke and commits once on release', () => {
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part')));
  paintModeSig.value = 'brush';
  updateSettings({ activeColor: [9, 9, 9] });
  const inDisc = vi
    .fn()
    .mockReturnValueOnce(new Set([1]))
    .mockReturnValueOnce(new Set([2]));
  const tool = createPaintTool(pickers({ inDisc }));
  tool.onPointer?.(pointer('down', 10, 10));
  tool.onPointer?.(pointer('move', 20, 10));
  expect(historySig.value.past).toHaveLength(0);
  tool.onPointer?.(pointer('up', 20, 10));
  expect(inDisc).toHaveBeenNthCalledWith(1, { x: 10, y: 10 }, 24);
  expect(inDisc).toHaveBeenNthCalledWith(2, { x: 20, y: 10 }, 24);
  expect(docSig.value.parts.get(1)!.props.RGB).toEqual([9, 9, 9]);
  expect(docSig.value.parts.get(2)!.props.RGB).toEqual([9, 9, 9]);
  expect(historySig.value.past.map((p) => p.label)).toEqual(['Paint 2 parts']);
});

test('painting records the color as the newest recent color', () => {
  loadDoc(docOf(part(1, 'Part')));
  updateSettings({ activeColor: [10, 20, 30] });
  const tool = createPaintTool(pickers({ part: () => 1 }));
  tool.onPointer?.(pointer('down', 0, 0));
  tool.onPointer?.(pointer('up', 0, 0));
  expect(recentColorsSig.value[0]).toEqual([10, 20, 30]);
  expect(JSON.parse(localStorage.getItem('grambyedit:recentColors')!)[0]).toEqual([10, 20, 30]);
});

test('stored recent colors keep only valid, unique triples', async () => {
  localStorage.setItem(
    'grambyedit:recentColors',
    JSON.stringify([[1, 2, 3], 'x', [1, 2, 3], [300, 0, 0], [4, 5, 6]]),
  );
  vi.resetModules();
  const fresh = await import('../../src/tools/paint');
  expect(fresh.recentColorsSig.value).toEqual([[1, 2, 3], [4, 5, 6]]);
});
