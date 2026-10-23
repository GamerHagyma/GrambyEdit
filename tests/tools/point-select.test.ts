// @vitest-environment jsdom
import { Vector2, Vector3 } from 'three';
import { runCommand } from '../../src/state/commands';
import { selectionSig, selectPoints } from '../../src/state/selection';
import { addPoint } from '../../src/core/ops/points';
import {
  baseCatalogSig,
  commit,
  docSig,
  loadDoc,
  resetStoreForTests,
  undo,
} from '../../src/state/store';
import { startModal } from '../../src/tools/modal';
import { createSelectTool } from '../../src/tools/select';
import { setViewport } from '../../src/viewport/context';
import type { PointsLayer } from '../../src/viewport/points-layer';
import { MINI } from '../helpers/catalog';
import { docOf, part, pt } from '../helpers/doc';
import { fakeViewport } from '../helpers/viewport';

const press = (code: string, key: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));
const pointer = (kind: 'down' | 'up') => ({
  kind,
  button: 0,
  x: 400,
  y: 300,
  ndc: new Vector2(0, 0),
  shift: false,
  ctrl: false,
  alt: false,
});

beforeEach(() => {
  resetStoreForTests();
  // One point marker drawn at the origin, which the camera looks at: the screen centre.
  const shown = [{ host: 1, uuid: '{a}', world: new Vector3() }];
  setViewport(fakeViewport({ points: { shown: () => shown } as unknown as PointsLayer }));
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Base', [], {}, [pt('{a}', undefined, 'Base')])));
});
afterEach(() => setViewport(null));

test('a click on a point marker selects the point', () => {
  const tool = createSelectTool();
  tool.onPointer!(pointer('down'));
  tool.onPointer!(pointer('up'));
  expect([...selectionSig.value.points]).toEqual(['1:{a}']);
  expect(selectionSig.value.parts.size).toBe(0);
});

test('G moves a selected point; typing 2 and Enter shifts it 2 studs along X', () => {
  selectPoints(['1:{a}'], 'replace');
  expect(runCommand('transform.grab')).toBe(true);
  press('Digit2', '2');
  press('Enter', 'Enter');
  const cf = docSig.value.parts.get(1)!.points!.get('{a}')!.cframe;
  expect(cf.slice(0, 3)).toEqual([2, 0, 0]);
});

test("undoing a point's creation drops it from the selection and G has nothing to move", () => {
  loadDoc(docOf(part(1, 'Base')));
  let uuid = '';
  commit('Add point', (d) => {
    uuid = addPoint(d, 1, [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 'Base');
  });
  selectPoints([`1:${uuid}`], 'replace');
  expect(undo()).toBe(true);
  expect(selectionSig.value.points.size).toBe(0);
  expect(startModal('move')).toBe(false);
});
