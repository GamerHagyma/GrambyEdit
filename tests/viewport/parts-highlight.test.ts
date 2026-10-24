import { Texture } from 'three';
import { DEFAULT_CONVENTIONS } from '../../src/core/conventions';
import { computePoses } from '../../src/core/pose';
import {
  FLAG_HOVERED,
  FLAG_PAINTED,
  FLAG_SELECTED,
  PartsLayer,
} from '../../src/viewport/parts-layer';
import { chainDoc, docOf, part } from '../helpers/doc';
import { texturedAssets } from '../helpers/textured-assets';

/** The textured fixture with `Part` split into two bodies: Left (body 0) and Right (body 1). */
function twoBodyAssets() {
  const fixture = texturedAssets();
  const def = fixture.catalog.parts.Part;
  return {
    ...fixture,
    textures: new Map([['textures/right.png', new Texture()]]),
    catalog: {
      ...fixture.catalog,
      parts: {
        ...fixture.catalog.parts,
        Part: {
          ...def,
          bodies: [
            {
              name: 'Left',
              sockets: [],
              anchor: [-1.5, 0.5, 0] as const,
              pivot: [0, 0, 0] as const,
            },
            {
              name: 'Right',
              sockets: [],
              anchor: [1.5, 0.5, 0] as const,
              pivot: [0, 0, 0] as const,
            },
          ],
        },
      },
    },
  };
}

/** The flag bits of a slot in one body's mesh. */
const bitsOf = (layer: PartsLayer, body: number, slot: number): number =>
  layer.meshes()[body].geometry.getAttribute('aFlags').getX(slot);

test('a piece highlight lights only its body', () => {
  const assets = twoBodyAssets();
  const layer = new PartsLayer(assets);
  const doc = docOf(part(1, 'Part'));
  layer.sync(doc, computePoses(doc, assets.catalog, DEFAULT_CONVENTIONS), new Set(), true);
  expect(layer.meshes()).toHaveLength(2);
  layer.highlight(new Set([1]), null, 1, new Map([[1, 1]]));
  expect(bitsOf(layer, 0, 0) & FLAG_SELECTED).toBe(0);
  expect(bitsOf(layer, 1, 0) & FLAG_SELECTED).toBe(FLAG_SELECTED);
});

test('a whole part highlight lights every body', () => {
  const assets = twoBodyAssets();
  const layer = new PartsLayer(assets);
  const doc = docOf(part(1, 'Part'));
  layer.sync(doc, computePoses(doc, assets.catalog, DEFAULT_CONVENTIONS), new Set(), true);
  layer.highlight(new Set([1]), null, 1);
  expect(bitsOf(layer, 0, 0) & FLAG_SELECTED).toBe(FLAG_SELECTED);
  expect(bitsOf(layer, 1, 0) & FLAG_SELECTED).toBe(FLAG_SELECTED);
});

test('a hover on one body lights that body only', () => {
  const assets = twoBodyAssets();
  const layer = new PartsLayer(assets);
  const doc = docOf(part(1, 'Part'));
  layer.sync(doc, computePoses(doc, assets.catalog, DEFAULT_CONVENTIONS), new Set(), true);
  layer.highlight(new Set(), 1, null, new Map(), 0);
  expect(bitsOf(layer, 0, 0) & FLAG_HOVERED).toBe(FLAG_HOVERED);
  expect(bitsOf(layer, 1, 0) & FLAG_HOVERED).toBe(0);
});

test('a painted part keeps its paint bit on both bodies', () => {
  const assets = twoBodyAssets();
  const layer = new PartsLayer(assets);
  const doc = docOf(part(1, 'Part', [], { RGB: [255, 0, 0] }));
  layer.sync(doc, computePoses(doc, assets.catalog, DEFAULT_CONVENTIONS), new Set(), true);
  expect(bitsOf(layer, 0, 0) & FLAG_PAINTED).toBe(FLAG_PAINTED);
  expect(bitsOf(layer, 1, 0) & FLAG_PAINTED).toBe(FLAG_PAINTED);
});

test('a piece highlight survives the layer growing', () => {
  const assets = twoBodyAssets();
  const layer = new PartsLayer(assets);
  const first = docOf(part(1, 'Part'));
  layer.sync(first, computePoses(first, assets.catalog, DEFAULT_CONVENTIONS), new Set(), true);
  layer.highlight(new Set([1]), null, 1, new Map([[1, 1]]));
  const grown = chainDoc(40);
  layer.sync(grown, computePoses(grown, assets.catalog, DEFAULT_CONVENTIONS), new Set(), true);
  expect(layer.meshes()[0].count).toBe(40);
  expect(bitsOf(layer, 0, 0) & FLAG_SELECTED).toBe(0);
  expect(bitsOf(layer, 1, 0) & FLAG_SELECTED).toBe(FLAG_SELECTED);
});

test('a piece index past the last body lights the whole part', () => {
  const assets = twoBodyAssets();
  const layer = new PartsLayer(assets);
  const doc = docOf(part(1, 'Part'));
  layer.sync(doc, computePoses(doc, assets.catalog, DEFAULT_CONVENTIONS), new Set(), true);
  layer.highlight(new Set([1]), null, 1, new Map([[1, 5]]));
  expect(bitsOf(layer, 0, 0) & FLAG_SELECTED).toBe(FLAG_SELECTED);
  expect(bitsOf(layer, 1, 0) & FLAG_SELECTED).toBe(FLAG_SELECTED);
});
