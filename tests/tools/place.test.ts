// @vitest-environment jsdom
import { Vector2 } from 'three';
import { recentsSig } from '../../src/state/favourites';
import { arm, placeSig } from '../../src/state/place';
import { baseCatalogSig, docSig, historySig, resetStoreForTests } from '../../src/state/store';
import { createPlaceTool } from '../../src/tools/place';
import { registerTool, setTool, toolPointer, toolSig } from '../../src/tools/manager';
import { MINI } from '../helpers/catalog';
import { fakeViewport } from '../helpers/viewport';
import { setViewport } from '../../src/viewport/context';
import { shiftSocketSig, socketFocusSig } from '../../src/state/socket-focus';

beforeEach(() => {
  resetStoreForTests();
  baseCatalogSig.value = MINI;
  for (const id of ['select', 'move'] as const)
    registerTool({ id, activate() {}, deactivate() {} });
  registerTool(createPlaceTool());
  setTool('select');
});

afterEach(() => {
  setTool('select');
  shiftSocketSig.value = false;
  socketFocusSig.value = null;
});

test('a right click ends part placement and selects Select even if placement began from Move', () => {
  setTool('move');
  arm({ kind: 'part', type: 'Part' });
  expect(toolSig.value).toBe('place');
  toolPointer({
    kind: 'up',
    button: 2,
    x: 10,
    y: 10,
    ndc: new Vector2(),
    shift: false,
    ctrl: false,
    alt: false,
  });
  expect(toolSig.value).toBe('select');
  expect(placeSig.value).toBeNull();
  expect(docSig.value.order).toEqual([]);
  expect(historySig.value.past).toEqual([]);
});

test('a right click also cancels a generated shape before it is placed', () => {
  arm({ kind: 'generated', sub: docSig.value });
  toolPointer({
    kind: 'up',
    button: 2,
    x: 10,
    y: 10,
    ndc: new Vector2(),
    shift: false,
    ctrl: false,
    alt: false,
  });
  expect(toolSig.value).toBe('select');
  expect(placeSig.value).toBeNull();
});

test('a part armed in an empty build becomes recent when actually placed', async () => {
  recentsSig.value = [];
  const viewport = fakeViewport();
  setViewport(viewport);
  try {
    arm({ kind: 'part', type: 'Part' });
    await Promise.resolve();
    toolPointer({
      kind: 'up',
      button: 0,
      x: 400,
      y: 300,
      ndc: new Vector2(),
      shift: false,
      ctrl: false,
      alt: false,
    });
    expect(docSig.value.parts.size).toBe(1);
    expect(recentsSig.value).toEqual(['Part']);
  } finally {
    setViewport(null);
    viewport.canvas.parentElement?.remove();
  }
});
test('Shift carrying refuses ground fallback; releasing Shift permits placement again', async () => {
  setViewport(fakeViewport());
  arm({ kind: 'part', type: 'Part' });
  await Promise.resolve();
  toolPointer({
    kind: 'up',
    button: 0,
    x: 400,
    y: 300,
    ndc: new Vector2(),
    shift: true,
    ctrl: false,
    alt: false,
  });
  expect(docSig.value.parts.size).toBe(0);
  toolPointer({
    kind: 'up',
    button: 0,
    x: 400,
    y: 300,
    ndc: new Vector2(),
    shift: false,
    ctrl: false,
    alt: false,
  });
  expect(docSig.value.parts.size).toBe(1);
  setViewport(null);
});
