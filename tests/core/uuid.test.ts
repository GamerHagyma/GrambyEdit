import { newUuid, isUuid } from '../../src/core/uuid';
test('newUuid gives distinct braced uuids', () => {
  const all = new Set(Array.from({ length: 1000 }, newUuid));
  expect(all.size).toBe(1000);
  for (const u of all) {
    expect(u).toHaveLength(38);
    expect(isUuid(u)).toBe(true);
  }
  expect(isUuid('{uuid1}')).toBe(false);
  expect(isUuid('{83dc86a4-3a11-4c20-8b4e-5ecf518b40d0}')).toBe(true);
});
