import { pairKey } from '../../src/core/catalog-types';
import { orientWire, wireVerdict } from '../../src/tools/connect';
import { MINI } from '../helpers/catalog';
import { docOf, part, sock } from '../helpers/doc';

const end = (part: number, type: string, socket: string) => ({ part, type, socket });

test('the child end of a wire is whichever socket is child-side', () => {
  const wire = end(1, 'Wire', '3');
  const gate = end(2, 'Gate-AND', '2');
  expect(orientWire(MINI, wire, gate)).toEqual({ child: wire, parent: gate });
  expect(orientWire(MINI, gate, wire)).toEqual({ child: wire, parent: gate });
  expect(orientWire(MINI, end(2, 'Gate-AND', '1'), end(1, 'Wire', '2'))).toBeNull();
});

test('two either-side sockets: corpus frequency decides, then the drag start is the child', () => {
  const s = { ...MINI.parts.Wire.sockets['1'], side: 'both' as const };
  const cat = {
    ...MINI,
    parts: {
      ...MINI.parts,
      A: { ...MINI.parts.Wire, type: 'A', sockets: { '1': s } },
      B: { ...MINI.parts.Wire, type: 'B', sockets: { '1': s } },
    },
  };
  const a = end(1, 'A', '1');
  const b = end(2, 'B', '1');
  expect(orientWire(cat, a, b)).toEqual({ child: a, parent: b });
  const counted = { ...cat, pairs: { [pairKey('B', '1', 'A', '1')]: 5 } };
  expect(orientWire(counted, a, b)).toEqual({ child: b, parent: a });
});

test('a wire onto a used socket is refused with the rule message', () => {
  const doc = docOf(part(1, 'Gate-AND'), part(2, 'Wire', [sock('3', 1, '2')]), part(3, 'Wire'));
  expect(wireVerdict(doc, MINI, end(3, 'Wire', '3'), end(1, 'Gate-AND', '3')).verdict.ok).toBe(true);
  const used = wireVerdict(doc, MINI, end(3, 'Wire', '3'), end(1, 'Gate-AND', '2')).verdict;
  expect(used).toMatchObject({ ok: false, code: 'socket-used' });
  expect(wireVerdict(doc, MINI, end(3, 'Wire', '1'), end(3, 'Wire', '4')).verdict).toMatchObject({
    ok: false,
    code: 'self-target',
  });
});
