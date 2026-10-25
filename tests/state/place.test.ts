// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { saveCurrent } from '../../src/state/library';
import { arm, disarm, placeFirstPart, placeSig, resolveSub } from '../../src/state/place';
import { selectionSig } from '../../src/state/selection';
import { updateSettings } from '../../src/state/settings';
import {
  baseCatalogSig,
  commit,
  docSig,
  historySig,
  loadDoc,
  redo,
  resetStoreForTests,
  undo,
  viewBus,
} from '../../src/state/store';
import { registerTool, toolSig, type ToolId } from '../../src/tools/manager';
import { MINI } from '../helpers/catalog';
import { docOf, part } from '../helpers/doc';
import { realCatalog } from '../helpers/real-catalog';

beforeEach(resetStoreForTests);

test('arming a part resolves a one-part sub-doc with auto color', async () => {
  baseCatalogSig.value = MINI;
  updateSettings({ autoColor: true, activeColor: [5, 6, 7] });
  const sub = await resolveSub({ kind: 'part', type: 'Part' });
  expect(sub.parts.get(1)!.props).toEqual({ RGB: [5, 6, 7] });
  updateSettings({ autoColor: false });
});

test('a creation resolves with its first root at the origin and the others where they were', async () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part')));
  commit('lay', (d) => {
    d.setLayout(1, [3, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    d.setLayout(2, [5, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
  const rec = await saveCurrent('Pair');
  const sub = await resolveSub({ kind: 'creation', id: rec.id });
  expect(sub.layout.get(1)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  expect(sub.layout.get(2)).toEqual([2, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
});

test('arm switches to the Place tool and disarm returns to the tool before', () => {
  const dummy = (id: ToolId) => ({ id, activate() {}, deactivate() {} });
  registerTool(dummy('select'));
  registerTool(dummy('connect'));
  registerTool(dummy('place'));
  toolSig.value = 'select';
  registerTool(dummy('connect'));
  arm({ kind: 'part', type: 'Part' });
  expect(toolSig.value).toBe('place');
  disarm();
  expect(placeSig.value).toBeNull();
  expect(toolSig.value).toBe('select');
});

test('the first part is centered, selected and disarmed before framing, in one undo step', () => {
  baseCatalogSig.value = MINI;
  updateSettings({ autoColor: true, activeColor: [5, 6, 7] });
  registerTool({ id: 'select', activate() {}, deactivate() {} });
  registerTool({ id: 'place', activate() {}, deactivate() {} });
  toolSig.value = 'select';
  arm({ kind: 'part', type: 'Part' });
  const framed: unknown[] = [];
  viewBus.on((e) => {
    framed.push({
      kind: e.kind,
      order: docSig.value.order,
      selected: [...selectionSig.value.parts],
      source: placeSig.value,
      tool: toolSig.value,
    });
  });

  expect(placeFirstPart('Part')).toBe(true);
  expect(docSig.value.parts.size).toBe(1);
  expect(docSig.value.parts.get(1)).toEqual({
    id: 1,
    type: 'Part',
    conns: [],
    props: { RGB: [5, 6, 7] },
    points: null,
  });
  expect(docSig.value.layout.get(1)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  expect(framed).toEqual([
    {
      kind: 'frame-selection',
      order: [1],
      selected: [1],
      source: null,
      tool: 'select',
    },
  ]);
  expect(historySig.value.past).toHaveLength(1);
  expect(undo()).toBe(true);
  expect(docSig.value.parts.size).toBe(0);
  expect(selectionSig.value.parts.size).toBe(0);
  expect(redo()).toBe(true);
  expect(docSig.value.parts.get(1)?.props).toEqual({ RGB: [5, 6, 7] });
  updateSettings({ autoColor: false });
});

test('first-part placement preserves native servo defaults', async () => {
  baseCatalogSig.value = await realCatalog();
  updateSettings({ autoColor: false });
  expect(placeFirstPart('Servo')).toBe(true);
  expect(docSig.value.parts.get(1)?.props).toEqual({
    Speed: 45,
    Rest: false,
    LimitEnabled: false,
    LimitAngle: 45,
    Rotation: 0,
  });
});

test('first-part placement refuses nonempty workspaces without changing placement or selection', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(7, 'Part')));
  arm({ kind: 'part', type: 'Connector' });
  const original = docSig.value;
  const source = placeSig.value;
  const events: string[] = [];
  viewBus.on((e) => events.push(e.kind));
  expect(placeFirstPart('Connector')).toBe(false);
  expect(docSig.value).toBe(original);
  expect(placeSig.value).toBe(source);
  expect(historySig.value.past).toHaveLength(0);
  expect(events).toEqual([]);
});

test('first-part placement refuses unloaded and unknown part types', () => {
  expect(placeFirstPart('Part')).toBe(false);
  baseCatalogSig.value = MINI;
  expect(placeFirstPart('Unknown')).toBe(false);
  expect(placeFirstPart('toString')).toBe(false);
  expect(docSig.value.parts.size).toBe(0);
  expect(historySig.value.past).toHaveLength(0);
});
