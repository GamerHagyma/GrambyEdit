// @vitest-environment jsdom
import { IDENTITY_CF } from '../../src/core/cframe';
import { DEFAULT_CONVENTIONS } from '../../src/core/conventions';
import { insertSubDoc } from '../../src/core/ops/clipboard';
import { transact } from '../../src/core/ops/transact';
import { buildGeneratedSubDoc, type GenRequest } from '../../src/core/generators';
import { EMPTY_POSES } from '../../src/core/pose';
import { codeSize } from '../../src/core/size';
import { Matrix4, Vector3 } from 'three';
import { matrix4ToCf } from '../../src/core/cframe';
import { DEFAULT_LIMITS, EMPTY_DOC, type Doc } from '../../src/core/types';
import { posesSig } from '../../src/state/derived';
import {
  clearGenHost,
  costPreview,
  generate,
  genCostSig,
  genHostPickSig,
  genHostSig,
  genPreviewSig,
  genRequestSig,
  liveRequestSig,
  loadPreset,
  loadPresets,
  pickGenHost,
  presetsSig,
  resetGeneratorsForTests,
  savePreset,
  setParam,
  setShape,
  updateInput,
} from '../../src/state/generators';
import { placeSig } from '../../src/state/place';
import { selectionSig } from '../../src/state/selection';
import { updateSettings } from '../../src/state/settings';
import { baseCatalogSig, docSig, loadDoc, resetStoreForTests } from '../../src/state/store';
import { pickSig } from '../../src/tools/pick';
import { MINI } from '../helpers/catalog';
import { chainDoc, docOf, part } from '../helpers/doc';

beforeEach(resetStoreForTests);
beforeEach(() => {
  localStorage.clear();
  resetGeneratorsForTests();
});

/** A line of `length` at spacing 1: `length + 1` elements, and the host. */
function lineOf(length: number): GenRequest {
  return {
    ...genRequestSig.value,
    shape: 'line',
    input: { params: { length }, fill: 'solid', orient: 'fixed', spacing: 1 },
  };
}

/** The code characters of an empty build once `req` is inserted at the origin. */
function codeCharsWith(req: GenRequest): number {
  const built = buildGeneratedSubDoc(req, MINI, DEFAULT_CONVENTIONS);
  if (!built.ok) throw new Error(built.error);
  const { doc } = transact(EMPTY_DOC, 'measure', (d) =>
    insertSubDoc(d, MINI, DEFAULT_CONVENTIONS, EMPTY_POSES, built.sub, { root: IDENTITY_CF }),
  );
  return codeSize(doc).base64Chars;
}

test('cost preview text and threshold crossings', () => {
  const r = costPreview(
    EMPTY_DOC,
    MINI,
    DEFAULT_CONVENTIONS,
    {
      ...genRequestSig.value,
      shape: 'line',
      input: { params: { length: 9 }, fill: 'solid', orient: 'fixed', spacing: 1 },
    },
    DEFAULT_LIMITS,
  );
  if (!r.ok) throw new Error(r.error);
  expect(r.cost.addParts).toBe(11);
  expect(r.cost.text).toMatch(
    /^\+11 parts · \+[\d,]+ chars · code 0\.00% → \d+\.\d\d% · parts 0 → 11$/,
  );
  const near = costPreview(
    chainDoc(7_995),
    MINI,
    DEFAULT_CONVENTIONS,
    {
      ...genRequestSig.value,
      shape: 'line',
      input: { params: { length: 9 }, fill: 'solid', orient: 'fixed', spacing: 1 },
    },
    DEFAULT_LIMITS,
  );
  expect(near.ok && near.cost.crossings).toEqual(['part soft cap']);
});

test('a build that crosses both code limits lists 75% then 100%', () => {
  // One character short of the build's size: the build passes 75% and 100%.
  const codeChars = codeCharsWith(lineOf(9)) - 1;
  const r = costPreview(EMPTY_DOC, MINI, DEFAULT_CONVENTIONS, lineOf(9), {
    ...DEFAULT_LIMITS,
    codeChars,
  });
  expect(r.ok && r.cost.crossings).toEqual(['code 75%', 'code 100%']);
});

test('the 75% code threshold alone is crossed when the build reaches it exactly', () => {
  const codeChars = Math.floor((4 * codeCharsWith(lineOf(9))) / 3);
  const r = costPreview(EMPTY_DOC, MINI, DEFAULT_CONVENTIONS, lineOf(9), {
    ...DEFAULT_LIMITS,
    codeChars,
  });
  expect(r.ok && r.cost.crossings).toEqual(['code 75%']);
});

test('the part warning is crossed when the build passes 16,000 parts', () => {
  const r = costPreview(chainDoc(15_995), MINI, DEFAULT_CONVENTIONS, lineOf(9), DEFAULT_LIMITS);
  expect(r.ok && r.cost.crossings).toEqual(['part warning']);
});

test('a request that cannot be previewed says why', () => {
  const none = costPreview(
    EMPTY_DOC,
    MINI,
    DEFAULT_CONVENTIONS,
    { ...lineOf(9), input: { ...lineOf(9).input, spacing: 0 } },
    DEFAULT_LIMITS,
  );
  expect(none.ok ? '' : none.error).toMatch(/no elements/);
  const root = costPreview(
    EMPTY_DOC,
    MINI,
    DEFAULT_CONVENTIONS,
    { ...lineOf(9), element: 'Chassis' },
    DEFAULT_LIMITS,
  );
  expect(root.ok ? '' : root.error).toMatch(/cannot be mounted on a point/);
});

test('switching shape resets its parameters and keeps a fill the new shape allows', () => {
  setShape('box');
  expect(genRequestSig.value.input.params).toEqual({ width: 6, height: 6, depth: 6 });
  expect(genRequestSig.value.input.fill).toBe('solid');
  updateInput({ fill: 'shell' });
  setParam('width', 9);
  setShape('cylinder');
  expect(genRequestSig.value.input).toEqual({
    params: { radius: 3, height: 6 },
    fill: 'shell',
    orient: 'fixed',
    spacing: 1,
  });
  setParam('radius', 9);
  setShape('cylinder');
  expect(genRequestSig.value.input.params).toEqual({ radius: 9, height: 6 });
});

test('the live request takes its precision from Settings as it is now', () => {
  updateSettings({ genPosDecimals: 2, genRotDecimals: 3 });
  expect(liveRequestSig.value.posDecimals).toBe(2);
  expect(liveRequestSig.value.rotDecimals).toBe(3);
  updateSettings({ genPosDecimals: 4, genRotDecimals: 5 });
});

test('a saved preset loads back as the same request', () => {
  setShape('torus');
  savePreset('Donut', genRequestSig.value);
  expect(presetsSig.value.Donut).toEqual(genRequestSig.value);
  expect(loadPresets()).toEqual({ Donut: genRequestSig.value });
  setShape('box');
  loadPreset('Donut');
  expect(genRequestSig.value.shape).toBe('torus');
});

test('stored presets with a bad shape, colour, parameter or fill are dropped', () => {
  const good = genRequestSig.value;
  localStorage.setItem(
    'grambyedit:genPresets',
    JSON.stringify({
      good,
      unknownShape: { ...good, shape: 'pyramid' },
      badColor: { ...good, color: { mode: 'single', rgb: [300, 0, 0] } },
      badParam: { ...good, input: { ...good.input, params: { radius: 'big' } } },
      badFill: { ...good, input: { ...good.input, fill: 'frame' } },
    }),
  );
  expect(Object.keys(loadPresets())).toEqual(['good']);
});

test('stored presets that are not an object read as none', () => {
  localStorage.setItem('grambyedit:genPresets', '[1, 2]');
  expect(loadPresets()).toEqual({});
});

/** A Connector at (2, 3, 4): the part the shape is generated onto. */
const hostDoc = (type = 'Connector'): Doc => ({
  ...docOf(part(1, type)),
  layout: new Map([[1, matrix4ToCf(new Matrix4().makeTranslation(2, 3, 4))]]),
});

test('a pick in the build chooses the host', () => {
  baseCatalogSig.value = MINI;
  loadDoc(hostDoc());
  pickGenHost();
  pickSig.value!.onPick({
    part: 1,
    body: 0,
    point: new Vector3(),
    normal: new Vector3(0, 1, 0),
    subPart: 'Connector',
    distance: 1,
  });
  expect(genHostPickSig.value).toEqual({ part: 1, type: 'Connector' });
  clearGenHost();
  expect(genHostSig.value).toBeNull();
});

test('a shape generated onto a picked part adds no host and hangs from new points on it', () => {
  baseCatalogSig.value = MINI;
  loadDoc(hostDoc());
  genHostPickSig.value = { part: 1, type: 'Connector' };
  // The default ring: 31 elements, without the extra Connector a placed shape brings.
  const cost = genCostSig.value;
  if (!cost?.ok) throw new Error('no cost');
  expect(cost.cost.addParts).toBe(31);
  const preview = genPreviewSig.value!;
  generate();
  expect(placeSig.value).toBeNull();
  const doc = docSig.value;
  expect(doc.order).toHaveLength(32);
  expect(doc.parts.get(1)!.points!.size).toBe(31);
  expect([...selectionSig.value.parts]).toEqual(doc.order.slice(1));
  expect(genHostPickSig.value).toBeNull();
  // The preview showed each element where Generate put it.
  preview.doc.order.forEach((id, k) => {
    const shown = preview.poses.world.get(id)!.elements;
    const placed = posesSig.value.world.get(doc.order[k + 1])!.elements;
    shown.forEach((v, i) => expect(v).toBeCloseTo(placed[i], 6));
  });
});

test('without a picked host, Generate hands the shape to the Place tool', () => {
  baseCatalogSig.value = MINI;
  generate();
  expect(placeSig.value?.kind).toBe('generated');
});

test('a picked host that is gone, or is now another type, is ignored', () => {
  baseCatalogSig.value = MINI;
  loadDoc(hostDoc());
  genHostPickSig.value = { part: 1, type: 'Connector' };
  expect(genHostSig.value?.id).toBe(1);
  expect(genPreviewSig.value).not.toBeNull();
  loadDoc(hostDoc('Part'));
  expect(genHostSig.value).toBeNull();
  expect(genPreviewSig.value).toBeNull();
  loadDoc(EMPTY_DOC);
  expect(genHostSig.value).toBeNull();
  expect(genCostSig.value?.ok && genCostSig.value.cost.addParts).toBe(32);
});
