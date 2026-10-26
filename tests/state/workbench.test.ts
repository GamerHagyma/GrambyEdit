import 'fake-indexeddb/auto';
import {
  baseCatalogSig,
  catalogSig,
  socketOverridesSig,
  resetStoreForTests,
} from '../../src/state/store';
import {
  captureSocket,
  captureProgress,
  clearSocket,
  exportSocketFile,
  importSocketFile,
  candidateSpots,
  resetSocketOverrides,
} from '../../src/state/workbench';
import { loadSocketOverrides } from '../../src/storage/sockets';
import { emptySocketGeometry, parseSocketGeometry } from '../../src/core/socket-geometry';
import { MINI } from '../helpers/catalog';
import { idbPut, idbGet } from '../../src/storage/idb';
import * as socketDb from '../../src/storage/idb';

beforeEach(() => {
  resetStoreForTests();
  baseCatalogSig.value = MINI;
});
test('a capture overrides the effective catalog at once and persists', async () => {
  await captureSocket('Connector', '5', [0, -0.2, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1]);
  expect(catalogSig.value!.parts.Connector.sockets['5'].frameSource).toBe('captured');
  expect((await loadSocketOverrides()).parts.Connector.sockets['5'].cframe[1]).toBe(-0.2);
});

test('reset removes captures from every namespace and restores the shipped catalog', async () => {
  await captureSocket('Part', '6', [9, 9, 9, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  await idbPut('sockets', { custom: true }, 'overrides:old-space');
  await resetSocketOverrides();
  expect(socketOverridesSig.value.parts).toEqual({});
  expect(catalogSig.value!.parts.Part.sockets['6'].frame).toEqual(
    MINI.parts.Part.sockets['6'].frame,
  );
  expect((await loadSocketOverrides()).parts).toEqual({});
  expect(await idbGet('sockets', 'overrides:old-space')).toBeUndefined();
});

test('a capture overlapping reset cannot resurrect old overrides after reload', async () => {
  await captureSocket('Part', '6', [9, 9, 9, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const reset = resetSocketOverrides();
  await expect(
    captureSocket('Connector', '5', [2, 2, 2, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  ).rejects.toThrow(/reset in progress/);
  await reset;
  expect(socketOverridesSig.peek().parts).toEqual({});
  expect((await loadSocketOverrides()).parts).toEqual({});
});

test('a failed reset preserves overrides and allows later edits', async () => {
  await captureSocket('Part', '6', [9, 9, 9, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const before = socketOverridesSig.peek();
  const clear = vi
    .spyOn(socketDb, 'idbClear')
    .mockRejectedValueOnce(new Error('Storage unavailable'));
  try {
    await expect(resetSocketOverrides()).rejects.toThrow('Storage unavailable');
    expect(socketOverridesSig.peek()).toBe(before);
    await captureSocket('Connector', '5', [2, 2, 2, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(socketOverridesSig.peek().parts.Connector).toBeDefined();
  } finally {
    clear.mockRestore();
  }
});
test('progress is sorted by corpus usage', () =>
  expect(captureProgress(MINI, emptySocketGeometry())[0]).toEqual({
    type: 'Connector',
    captured: 0,
    total: 6,
    corpusCount: 11484,
  }));
test('export parses back; import reports bad files', async () => {
  expect(
    parseSocketGeometry(JSON.parse(exportSocketFile(emptySocketGeometry(), new Date('2026-10-23'))))
      .ok,
  ).toBe(true);
  expect(await importSocketFile('{"format":"x"}')).toEqual({
    ok: false,
    error: 'format must be "grambyedit-sockets"',
  });
  expect(await importSocketFile('not json')).toMatchObject({ ok: false });
});
test('Part candidates include the +X face frame', () =>
  expect(candidateSpots(MINI, 'Part')).toContainEqual({
    label: 'Face +X',
    cframe: [0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0],
  }));
test('clearing a capture restores the approximate frame', async () => {
  await captureSocket('Connector', '5', [0, -0.2, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1]);
  await clearSocket('Connector', '5');
  expect(catalogSig.value!.parts.Connector.sockets['5'].frameSource).toBe('approx');
  expect((await loadSocketOverrides()).parts.Connector).toBeUndefined();
});
test('captures are rounded so exported files stay clean', async () => {
  await captureSocket('Part', '6', [0, 0.50000001, 0, 1, 0, 0, 0, 1, 1e-9, 0, -1e-9, 1]);
  expect((await loadSocketOverrides()).parts.Part.sockets['6'].cframe).toEqual([
    0, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1,
  ]);
});

test('new-space captures persist separately and never reactivate legacy measurements', async () => {
  const space = 'roblox-primary-part-v1';
  const legacy = emptySocketGeometry();
  legacy.parts.Part = { sockets: { '6': { cframe: [99, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] } } };
  await importSocketFile(JSON.stringify(legacy));
  baseCatalogSig.value = { ...MINI, socketGeometrySpace: space };
  const frame = [0, -0.25, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1] as const;
  await captureSocket('Connector', '5', frame);
  expect(socketOverridesSig.value.parts.Part).toBeUndefined();
  expect(catalogSig.value!.parts.Connector.sockets['5'].frame).toEqual(frame);
  expect((await loadSocketOverrides()).parts.Part.sockets['6'].cframe[0]).toBe(99);
  expect((await loadSocketOverrides(space)).parts.Connector.sockets['5'].cframe).toEqual(frame);
  expect(await importSocketFile(JSON.stringify(legacy))).toMatchObject({ ok: false });
});
