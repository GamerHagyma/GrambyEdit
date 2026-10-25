import { packSnapshot, unpackSnapshot } from '../../src/net/snapshot-codec';
test('large snapshots compress and round trip while normal changes stay unchanged', async () => {
  const value = { type: 'snapshot', rev: 5, doc: { value: 'hello 🛠️'.repeat(10000) } };
  const packed = await packSnapshot(value);
  expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify(value).length / 10);
  expect(await unpackSnapshot(packed)).toEqual(value);
  const delta = { type: 'update', ops: [['v', 1, 'Speed', [90]]] };
  expect(await packSnapshot(delta)).toBe(delta);
});
test('invalid or decompression-bomb envelopes are rejected before installation', async () => {
  await expect(
    unpackSnapshot({ type: 'compressed', encoding: 'gzip', bytes: 999999999, data: 'AA==' }),
  ).rejects.toThrow();
  const packed = (await packSnapshot({ type: 'snapshot', data: 'x'.repeat(100000) })) as Record<
    string,
    unknown
  >;
  await expect(unpackSnapshot({ ...packed, bytes: 10 })).rejects.toThrow();
});
