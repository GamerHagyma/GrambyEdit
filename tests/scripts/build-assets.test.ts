import { buildAssets } from '../../scripts/build-assets';

const close = (a: readonly number[], b: readonly number[]) =>
  a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(1e-3));

test('builds the runtime catalog and mesh pack', async () => {
  const { catalog, manifest, bin } = await buildAssets({ root: '.', outDir: null });
  expect(Object.keys(catalog.parts)).toHaveLength(132);
  expect(manifest.meshes).toHaveLength(120);
  const P = catalog.parts.Part;
  expect(P.sockets['6'].frameSource).toBe('workshop');
  close(P.sockets['6'].frame, [0, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  close(P.sockets['1'].frame, [0, -0.5, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1]);
  close(P.sockets['2'].frame, [0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0]);
  expect(catalog.parts.Switch.sockets['2'].role).toBe('output');
  expect(catalog.parts.Wire.sockets['3'].role).toBe('conductor');
  expect(catalog.parts.Base.sockets['5']).toMatchObject({ role: 'socket', name: 'Top' });
  expect(catalog.parts.Chassis.defaultMount).toBeNull();
  expect(catalog.parts['Gate-AND'].defaultMount).toBe('4');
  expect(catalog.parts.Roof.mainPartName).toBe('Roof');
  expect(Object.keys(catalog.parts.Roof.subParts)).toContain('Glass');
  expect(catalog.pairs['Connector.5>Connector.4']).toBe(5619);
  expect(catalog.pairs['Part.1>Part.6']).toBe(1073);
  expect(catalog.parts.Switch.tooltip).toBe('Activates its output until switched off');
  expect(manifest.meshes[P.mesh!.id]).toMatchObject({ type: 'Part', indexCount: 36 });
  expect(bin.byteLength).toBe(manifest.sections.indices[0] + manifest.sections.indices[1]);
}, 30_000);
