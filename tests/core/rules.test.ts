import {
  canBeChild,
  canBeParent,
  canTakeChild,
  isSignalJoint,
  pieceSockets,
  validate,
} from '../../src/core/rules';
import { docOf, part, sock, mount, pt } from '../helpers/doc';
import { MINI } from '../helpers/catalog';
import { DEFAULT_LIMITS } from '../../src/core/types';
import type { Limits } from '../../src/core/types';
import { importCode } from '../helpers/import';
import { realCatalog } from '../helpers/real-catalog';
import { corpusCodes } from '../fixtures/corpus';

test('the v5 tear: a mount on Splitter_2 self9 blocks sock10', () => {
  const d = docOf(
    part(1, 'Base', [], {}, [pt('{u}')]),
    part(2, 'Splitter_2', [mount('9', 1, '{u}')]),
  );
  expect(canBeParent(d, MINI, 2, '10')).toEqual({
    ok: false,
    code: 'piece-mounted',
    message:
      'Socket 10 is unavailable: piece C of this Splitter_2 is consumed by its ephemeral mount on socket 9.',
  });
  expect(canBeParent(d, MINI, 2, '6').ok).toBe(true);
});
test('ordinary joints on both faces of a piece are allowed; a mount needs its whole piece', () => {
  const d = docOf(
    part(1, 'Gate-AND'),
    part(2, 'Wire', [sock('1', 1, '1')]),
    part(3, 'Light', [sock('1', 2, '2')]),
  );
  expect(
    canBeParent(docOf(part(1, 'Gate-AND'), part(2, 'Wire', [sock('1', 1, '1')])), MINI, 2, '2').ok,
  ).toBe(true);
  expect(canBeChild(d, MINI, 2, '3', 'joint').ok).toBe(true);
  expect(
    canBeChild(
      docOf(part(1, 'Wire'), part(2, 'Light', [sock('1', 1, '2')])),
      MINI,
      1,
      '1',
      'mount',
    ),
  ).toMatchObject({ ok: false, code: 'piece-busy' });
});
test('one mate per circle, and points take one child', () => {
  const d = docOf(
    part(1, 'Part', [], {}, [pt('{p}')]),
    part(2, 'Part', [sock('1', 1, '6')]),
    part(3, 'Part', [mount('1', 1, '{p}')]),
  );
  expect(canBeParent(d, MINI, 1, '6')).toMatchObject({ ok: false, code: 'socket-used' });
  expect(canTakeChild(d, 1, '{p}')).toMatchObject({ ok: false, code: 'point-used' });
});
test('validate reports structural errors by code', () => {
  const d = docOf(
    part(1, 'Splitter_2', [], {}, [pt('{u}')]),
    part(2, 'Splitter_2', [mount('9', 1, '{u}')]),
    part(3, 'Light', [sock('1', 2, '10')]),
    part(4, 'Light', [mount('1', 1, '{nope}')]),
    part(5, 'Mystery'),
  );
  const codes = validate(d, MINI, DEFAULT_LIMITS, 100).map((i) => i.code);
  expect(codes).toEqual(expect.arrayContaining(['E-TEAR', 'E-UUID', 'W-TYPE-UNKNOWN']));
});
test('the real corpus has no E-MATE or E-TEAR', async () => {
  const cat = await realCatalog();
  for (const code of corpusCodes()) {
    const bad = validate(importCode(code), cat, DEFAULT_LIMITS, code.length).filter(
      (i) => i.code === 'E-MATE' || i.code === 'E-TEAR',
    );
    expect(bad).toEqual([]);
  }
}, 60_000);
test('the real corpus raises no E-REF, self-joints included', async () => {
  const cat = await realCatalog();
  for (const code of corpusCodes()) {
    expect(
      validate(importCode(code), cat, DEFAULT_LIMITS, code.length).filter(
        (i) => i.code === 'E-REF',
      ),
    ).toEqual([]);
  }
}, 60_000);
test('a self-joint is I-SELF-JOINT, never E-REF, and uses both of its sockets', () => {
  const d = docOf(
    part(1, 'Splitter_2', [{ self: '5', target: { kind: 'raw', triple: [5, 4, 1] } }]),
  );
  const codes = validate(d, MINI, DEFAULT_LIMITS, 0).map((i) => i.code);
  expect(codes).toContain('I-SELF-JOINT');
  expect(codes).not.toContain('E-REF');
  expect(canBeParent(d, MINI, 1, '4')).toMatchObject({ ok: false, code: 'socket-used' });
});
test('any other raw conn, or a conn to a missing part, is E-REF', () => {
  const raw = docOf(
    part(1, 'Splitter_2', [{ self: '5', target: { kind: 'raw', triple: ['5', '4', 7] } }]),
  );
  expect(validate(raw, MINI, DEFAULT_LIMITS, 0).find((i) => i.code === 'E-REF')).toMatchObject({
    severity: 'error',
    parts: [1],
  });
  const dangling = docOf(part(1, 'Light', [sock('1', 9, '6')]));
  expect(validate(dangling, MINI, DEFAULT_LIMITS, 0).map((i) => i.code)).toContain('E-REF');
});
test('issue messages name the type and its 1-based index', () => {
  const d = docOf(
    part(1, 'Light'),
    part(2, 'Mystery'),
    part(3, 'Splitter_2', [{ self: '5', target: { kind: 'raw', triple: [5, 4, 3] } }]),
  );
  const issues = validate(d, MINI, DEFAULT_LIMITS, 0);
  expect(issues.find((i) => i.code === 'W-TYPE-UNKNOWN')?.message).toBe(
    'Unknown part type "Mystery" (#2): kept as-is, drawn as a placeholder.',
  );
  expect(issues.find((i) => i.code === 'I-SELF-JOINT')?.message).toBe(
    'Splitter_2 (#3) has 1 joint(s) to its own sockets: kept as-is.',
  );
});
test('two inputs joined is I-ROLE', () => {
  const d = docOf(part(1, 'Splitter_2'), part(2, 'Light', [sock('1', 1, '4')]));
  expect(validate(d, MINI, DEFAULT_LIMITS, 0).find((i) => i.code === 'I-ROLE')?.message).toBe(
    'Socket 1 of Light (#2) and socket 4 of Splitter_2 (#1) are both inputs.',
  );
});
test('two joints on one socket are E-MATE', () => {
  const d = docOf(
    part(1, 'Part'),
    part(2, 'Part', [sock('1', 1, '6')]),
    part(3, 'Part', [sock('1', 1, '6')]),
  );
  expect(validate(d, MINI, DEFAULT_LIMITS, 0).find((i) => i.code === 'E-MATE')).toMatchObject({
    parts: [1],
    message: 'Part (#1) has 2 joints on socket 6.',
  });
});
test('a loop of first connections is W-CYCLE', () => {
  const cyc = docOf(part(1, 'Part', [sock('1', 2, '6')]), part(2, 'Part', [sock('1', 1, '6')]));
  expect(validate(cyc, MINI, DEFAULT_LIMITS, 0).find((i) => i.code === 'W-CYCLE')?.parts).toEqual([
    1, 2,
  ]);
});
test('unused points are info; a point with two children is E-POINT-SHARED', () => {
  const d = docOf(
    part(1, 'Base', [], {}, [pt('{u}'), pt('{v}')]),
    part(2, 'Light', [mount('1', 1, '{u}')]),
    part(3, 'Light', [mount('1', 1, '{u}')]),
  );
  const codes = validate(d, MINI, DEFAULT_LIMITS, 0).map((i) => i.code);
  expect(codes).toEqual(expect.arrayContaining(['I-POINT-UNUSED', 'E-POINT-SHARED']));
});
test('whole-build issues: code limit, part limit and the anchor rule', () => {
  const parts = Array.from({ length: 201 }, (_, i) => part(i + 1, 'Part'));
  const codes = (limits: Limits, length: number) =>
    validate(docOf(...parts), MINI, limits, length).map((i) => i.code);
  expect(codes(DEFAULT_LIMITS, 9_000_000)).toContain('E-CODE-LIMIT');
  expect(codes({ ...DEFAULT_LIMITS, partSoftCap: 200 }, 100)).toContain('W-PART-LIMIT');
  expect(codes(DEFAULT_LIMITS, 100)).toContain('I-NO-ANCHOR');
});
test('pieceSockets lists a whole piece, or the socket alone', () => {
  expect(pieceSockets(MINI.parts.Splitter_2, '9')).toEqual(['9', '10']);
  expect(pieceSockets(MINI.parts.Light, '1')).toEqual(['1']);
  expect(pieceSockets(undefined, '7')).toEqual(['7']);
});
test('isSignalJoint: output with input, and conductors with any signal socket', () => {
  expect(isSignalJoint(MINI, 'Light', '1', 'Splitter_2', '6')).toBe(true);
  expect(isSignalJoint(MINI, 'Light', '1', 'Splitter_2', '4')).toBe(false);
  expect(isSignalJoint(MINI, 'Wire', '1', 'Splitter_2', '4')).toBe(true);
  expect(isSignalJoint(MINI, 'Mag', '1', 'Splitter_2', '6')).toBe(false);
});

test('an anchored loop island raises no W-CYCLE', () => {
  const d = docOf(
    part(1, 'Part'),
    part(2, 'Part', [sock('3', 3, '2'), sock('1', 1, '6')]),
    part(3, 'Part', [sock('1', 2, '6')]),
  );
  expect(validate(d, MINI, DEFAULT_LIMITS, 0).map((i) => i.code)).not.toContain('W-CYCLE');
});
