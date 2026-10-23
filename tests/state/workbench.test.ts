import 'fake-indexeddb/auto';
import { baseCatalogSig, catalogSig, resetStoreForTests } from '../../src/state/store';
import {
  captureSocket,
  captureProgress,
  clearSocket,
  exportSocketFile,
  importSocketFile,
  candidateSpots,
} from '../../src/state/workbench';
import { loadSocketOverrides } from '../../src/storage/sockets';
import { emptySocketGeometry, parseSocketGeometry } from '../../src/core/socket-geometry';
import { MINI } from '../helpers/catalog';

beforeEach(() => {
  resetStoreForTests();
  baseCatalogSig.value = MINI;
});
test('a capture overrides the effective catalog at once and persists', async () => {
  await captureSocket('Connector', '5', [0, -0.2, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1]);
  expect(catalogSig.value!.parts.Connector.sockets['5'].frameSource).toBe('captured');
  expect((await loadSocketOverrides()).parts.Connector.sockets['5'].cframe[1]).toBe(-0.2);
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
