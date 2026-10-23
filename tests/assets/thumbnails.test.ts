import 'fake-indexeddb/auto';
import { setThumbnailRenderer, thumbnailUrl } from '../../src/assets/thumbnails';

test('renders each type once per version', async () => {
  const r = vi.fn(async () => new Blob(['x']));
  setThumbnailRenderer(r);
  await thumbnailUrl('Part', 'v1');
  await thumbnailUrl('Part', 'v1');
  await thumbnailUrl('Part', 'v2');
  expect(r).toHaveBeenCalledTimes(2);
});
test('a failed render is not remembered, so the next call retries', async () => {
  const r = vi
    .fn<(type: string) => Promise<Blob>>()
    .mockRejectedValueOnce(new Error('no GPU'))
    .mockResolvedValue(new Blob(['y']));
  setThumbnailRenderer(r);
  await expect(thumbnailUrl('Connector', 'v9')).rejects.toThrow('no GPU');
  await expect(thumbnailUrl('Connector', 'v9')).resolves.toMatch(/^blob:/);
});
