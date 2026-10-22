import { readFileSync } from 'node:fs';
import { CATEGORIES } from '../src/core/catalog-types';
const j = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const catalog = j('data/part_catalog.json').parts;
const schema = j('data/props_schema.json').props;

test('every catalog part has exactly one valid category', () => {
  const cats = j('data/curation/categories.json');
  expect(Object.keys(cats).sort()).toEqual(Object.keys(catalog).sort());
  for (const c of Object.values(cats)) expect(CATEGORIES).toContain(c);
});
test('prop meta covers every observed key with a type-compatible widget', () => {
  const meta = j('data/curation/prop-meta.json');
  for (const [key, s] of Object.entries<any>(schema)) {
    if (key === 'EphemeralAttachments') continue;
    const w = meta[key]?.widget;
    expect(w, key).toBeDefined();
    const types = Object.keys(s.json_types);
    if (types.includes('bool')) expect(w, key).toBe('bool');
    if (types.includes('str')) expect(['string', 'key', 'text'], key).toContain(w);
  }
  expect(meta.RGB.widget).toBe('rgb');
  expect(meta.OrientationY).toMatchObject({ widget: 'orientation', step: 45 });
  expect(meta.DelayDeactivation.label).toBe('Delay Deactivation');
});
test('roles-fix is exactly the spec §5.4 table', () =>
  expect(j('data/curation/roles-fix.json')).toEqual({
    Switch: { 2: 'output' },
    Button: { 2: 'output' },
    RemoteButton: { 2: 'output' },
    Splitter_4: { 1: 'output', 2: 'output', 3: 'input', 4: 'input' },
    Wire: { 1: 'conductor', 2: 'conductor', 3: 'conductor', 4: 'conductor' },
    Looper: { 1: 'output' },
  }));
