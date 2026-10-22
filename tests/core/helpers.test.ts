import { DEFAULT_LIMITS, EMPTY_DOC } from '../../src/core/types';
import { pairKey } from '../../src/core/catalog-types';
import { docOf, part, mount, pt, chainDoc } from '../helpers/doc';
import { MINI } from '../helpers/catalog';
import { corpusCodes } from '../fixtures/corpus';

test('constants', () => {
  expect(DEFAULT_LIMITS).toEqual({ codeChars: 8_000_000, partSoftCap: 8_000, partWarn: 16_000 });
  expect(EMPTY_DOC.order).toEqual([]);
  expect(EMPTY_DOC.nextId).toBe(1);
  expect(pairKey('Splitter_2', '3', 'Switch', '2')).toBe('Splitter_2.3>Switch.2');
});
test('docOf and chainDoc', () => {
  const d = docOf(part(1, 'Base', [], {}, [pt('{a}')]), part(2, 'Switch', [mount('3', 1, '{a}')]));
  expect(d.order).toEqual([1, 2]);
  expect(d.nextId).toBe(3);
  expect(d.parts.get(2)!.conns[0].target).toEqual({ kind: 'point', part: 1, uuid: '{a}' });
  expect(chainDoc(3).parts.get(3)!.conns).toEqual([
    { self: '1', target: { kind: 'socket', part: 2, socket: '6' } },
  ]);
});
test('MINI applies the role fixes and the outward Part frames', () => {
  expect(MINI.parts.Switch.sockets['2'].role).toBe('output');
  expect(MINI.parts.Wire.sockets['1'].role).toBe('conductor');
  expect(MINI.parts.Part.sockets['6'].frame).toEqual([0, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  expect(MINI.parts.Chassis.defaultMount).toBeNull();
});
test('corpus fixture holds the 185 parseable codes', () => expect(corpusCodes()).toHaveLength(185));
