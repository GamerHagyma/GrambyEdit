// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { saveCurrent } from '../../src/state/library';
import { arm, disarm, placeSig, resolveSub } from '../../src/state/place';
import { updateSettings } from '../../src/state/settings';
import { baseCatalogSig, commit, loadDoc, resetStoreForTests } from '../../src/state/store';
import { registerTool, toolSig, type ToolId } from '../../src/tools/manager';
import { MINI } from '../helpers/catalog';
import { docOf, part } from '../helpers/doc';

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
