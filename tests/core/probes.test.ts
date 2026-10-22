import { socketProbes, calibrationProbes, probeUuid } from '../../src/core/probes';
import { parseShareText } from '../../src/core/share';
import { decode } from '../../src/core/codec';
import { validate } from '../../src/core/rules';
import { DEFAULT_LIMITS } from '../../src/core/types';
import { realCatalog } from '../helpers/real-catalog';
const entries = (code: string) => {
  const r = decode(code);
  if (!r.ok) throw new Error('bad');
  return r.value as any[];
};

test('Splitter_2 parent probe puts a colored ShortStick on sockets 4, 6, 10', async () => {
  const p = socketProbes(await realCatalog(), 'Splitter_2').find(
    (x) => x.id === 'Splitter_2:parent:1',
  )!;
  const e = entries(p.code);
  expect(e[0]).toEqual(['Splitter_2', [], []]);
  expect(e.slice(1).map((x) => x[1][0])).toEqual([
    ['2', '4', 1],
    ['2', '6', 1],
    ['2', '10', 1],
  ]);
  expect(e[1]).toEqual(['ShortStick', [['2', '4', 1]], { RGB: [220, 50, 47] }]);
  expect(p.legend.map((l) => [l.socket, l.color!.name])).toEqual([
    ['4', 'red'],
    ['6', 'orange'],
    ['10', 'yellow'],
  ]);
});
test('Chassis parent sockets split into four codes of eight', async () =>
  expect(
    socketProbes(await realCatalog(), 'Chassis')
      .filter((p) => p.id.includes(':parent:'))
      .map((p) => p.legend.length),
  ).toEqual([8, 8, 8, 8]));
test('child probe mounts each copy by one child socket onto a grey cube', async () => {
  const e = entries(
    socketProbes(await realCatalog(), 'Switch').find((x) => x.id === 'Switch:child:1')!.code,
  );
  expect(e[1]).toEqual(['Part', [['1', probeUuid(0), 1]], { RGB: [128, 128, 128] }]);
  expect(e[2]).toEqual(['Switch', [['1', '6', 2]], []]);
  expect(e[4]).toEqual(['Switch', [['3', '6', 4]], []]);
});
test('every probe imports and validates without errors', async () => {
  const cat = await realCatalog();
  for (const type of [
    'Part',
    'Connector',
    'Gate-AND',
    'Splitter_4',
    'Chassis',
    'Wire',
    'Base',
    'Switch',
  ])
    for (const p of [...socketProbes(cat, type), ...calibrationProbes(cat)]) {
      const r = parseShareText(p.code);
      expect(r.ok, p.id).toBe(true);
      if (r.ok)
        expect(
          validate(r.doc, cat, DEFAULT_LIMITS, p.code.length).filter((i) => i.severity === 'error'),
          p.id,
        ).toEqual([]);
    }
});
test('calibration probes P1–P6', async () =>
  expect(calibrationProbes(await realCatalog()).map((p) => p.id)).toEqual([
    'P1',
    'P2',
    'P3',
    'P4',
    'P5',
    'P6',
  ]));
