import { readFileSync } from 'node:fs';
import { buildAssets, paintedGroups, withOrientation } from '../../scripts/build-assets';
import { workshopFrames } from '../../scripts/lib/catalog';

let built: ReturnType<typeof buildAssets> | null = null;
const build = () => (built ??= buildAssets({ root: '.', outDir: null }));

const close = (a: readonly number[], b: readonly number[]) =>
  a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(1e-3));

test('withOrientation adds the missing orientation props after the corpus keys', () => {
  expect(withOrientation(['OrientationY'])).toEqual([
    'OrientationY',
    'OrientationX',
    'OrientationZ',
  ]);
  expect(withOrientation([])).toEqual(['OrientationX', 'OrientationY', 'OrientationZ']);
  expect(withOrientation(['RGB', 'OrientationZ'])).toEqual([
    'RGB',
    'OrientationZ',
    'OrientationX',
    'OrientationY',
  ]);
});

test('builds the runtime catalog and mesh pack', async () => {
  const { catalog, manifest, bin } = await build();
  expect(Object.keys(catalog.parts)).toHaveLength(162);
  expect(manifest.meshes).toHaveLength(162);
  for (const def of Object.values(catalog.parts)) {
    expect(def.props).toEqual(
      expect.arrayContaining(['OrientationX', 'OrientationY', 'OrientationZ']),
    );
  }
  // The Part's captures win over the Workshop's frames, and agree with them.
  const P = catalog.parts.Part;
  const workshop = workshopFrames(
    readFileSync('vendor/grambys-workshop/Scripts/GrambyObjects/Part/Part.tscn', 'utf8'),
  );
  expect(P.sockets['6'].frameSource).toBe('captured');
  for (const [id, frame] of [
    ['6', [0, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]],
    ['1', [0, -0.5, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1]],
    ['2', [0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0]],
  ] as const) {
    close(P.sockets[id].frame, frame);
    close(workshop[id], frame);
  }
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

test('paint recolours the pieces the game paints, on parts that keep paint', async () => {
  const { catalog, manifest } = await build();
  const painted = (type: string) =>
    manifest.meshes[catalog.parts[type].mesh!.id].groups
      .filter((g) => g.paintable)
      .map((g) => g.subPart)
      .sort();
  // In game (2026-10-24): both Wire ends, a Splitter's base and every output disc, and a RemoteButton's
  // push button and disc take the colour. Buttons, Switches and EntitySensors go back to their own.
  expect(painted('Wire')).toEqual(['InputA', 'InputB']);
  expect(painted('Splitter_4')).toEqual(['Handle', 'Output1', 'Output2', 'Output3', 'Output4']);
  expect(painted('RemoteButton')).toEqual(['Button', 'Output']);
  for (const type of ['Button', 'Switch', 'EntitySensor']) {
    expect(catalog.parts[type].paintable).toBe(false);
    expect(painted(type)).toEqual([]);
  }
  expect(painted('Part')).toEqual(['Part']);
}, 30_000);

test('paintedGroups refuses a curated piece the mesh lacks', () => {
  const groups = [
    { subPart: 'Handle', triangles: 12 },
    { subPart: 'Output1', triangles: 4 },
  ];
  expect([...paintedGroups(groups, 'Splitter_1', ['Handle', 'Output1'])]).toEqual([0, 1]);
  expect([...paintedGroups(groups, 'Splitter_1', undefined)]).toEqual([0]);
  expect(() => paintedGroups(groups, 'Splitter_1', ['Output2'])).toThrow(/Splitter_1.*Output2/);
});
