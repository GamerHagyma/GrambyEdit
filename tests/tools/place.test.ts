// @vitest-environment jsdom
import { Vector2 } from 'three';
import { arm, placeSig } from '../../src/state/place';
import { baseCatalogSig, docSig, historySig, resetStoreForTests } from '../../src/state/store';
import { createPlaceTool } from '../../src/tools/place';
import { registerTool, setTool, toolPointer, toolSig } from '../../src/tools/manager';
import { MINI } from '../helpers/catalog';

beforeEach(() => {
  resetStoreForTests();
  baseCatalogSig.value = MINI;
  for (const id of ['select', 'move'] as const) registerTool({ id, activate() {}, deactivate() {} });
  registerTool(createPlaceTool());
  setTool('select');
});

afterEach(() => setTool('select'));

test('a right click ends part placement and selects Select even if placement began from Move', () => {
  setTool('move');
  arm({ kind: 'part', type: 'Part' });
  expect(toolSig.value).toBe('place');
  toolPointer({ kind: 'up', button: 2, x: 10, y: 10, ndc: new Vector2(), shift: false, ctrl: false, alt: false });
  expect(toolSig.value).toBe('select');
  expect(placeSig.value).toBeNull();
  expect(docSig.value.order).toEqual([]);
  expect(historySig.value.past).toEqual([]);
});

test('a right click also cancels a generated shape before it is placed', () => {
  arm({ kind: 'generated', sub: docSig.value });
  toolPointer({ kind: 'up', button: 2, x: 10, y: 10, ndc: new Vector2(), shift: false, ctrl: false, alt: false });
  expect(toolSig.value).toBe('select');
  expect(placeSig.value).toBeNull();
});
