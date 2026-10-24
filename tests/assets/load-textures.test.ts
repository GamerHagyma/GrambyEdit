import { SRGBColorSpace, Texture, TextureLoader } from 'three';
import { loadAssets } from '../../src/assets/load';
import { MINI } from '../helpers/catalog';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFiles(paths: string[]) {
  const manifest = {
    version: 'v 1',
    sections: {},
    meshes: [{ groups: paths.map((texture) => ({ texture })) }],
  };
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith('version.txt')) return { ok: true, text: async () => 'v 1' };
    if (url.includes('catalog.json'))
      return { ok: true, json: async () => ({ ...MINI, version: 'v 1' }) };
    if (url.includes('parts.json')) return { ok: true, json: async () => manifest };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
  });
  vi.stubGlobal('fetch', fetcher);
}

test('loads each texture once from the versioned asset directory with standard OBJ UV orientation', async () => {
  mockFiles(['textures/a.png', 'textures/a.png', 'textures/b.png']);
  const loader = vi
    .spyOn(TextureLoader.prototype, 'loadAsync')
    .mockImplementation(async () => new Texture());
  const assets = await loadAssets('/project/');
  expect(loader.mock.calls.map(([url]) => url)).toEqual([
    '/project/assets/textures/a.png?v=v%201',
    '/project/assets/textures/b.png?v=v%201',
  ]);
  expect(assets.textures?.size).toBe(2);
  for (const texture of assets.textures!.values()) {
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.flipY).toBe(true);
  }
});

test('texture failure names the missing asset and disposes other completed loads', async () => {
  mockFiles(['textures/good.png', 'textures/missing.png']);
  const good = new Texture<HTMLImageElement>();
  const dispose = vi.spyOn(good, 'dispose');
  vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async (url) => {
    if (url.includes('missing')) throw new Error('failed');
    return good;
  });
  await expect(loadAssets('/')).rejects.toThrow('textures/missing.png');
  expect(dispose).toHaveBeenCalledOnce();
});
