import {
  poseAnchors,
  poseDescendants,
  poseParent,
  topoPose,
  component,
  wouldCreatePoseCycle,
  roots,
} from '../../src/core/graph';
import { docOf, part, sock } from '../helpers/doc';
test('poseDescendants follows first connections only', () => {
  const d = docOf(
    part(1, 'Connector'),
    part(2, 'Connector', [sock('5', 1, '1')]),
    part(3, 'Wire', [sock('1', 2, '1'), sock('3', 4, '2')]),
    part(4, 'Gate-AND', [sock('4', 1, '2')]),
  );
  expect([...poseDescendants(d, 1)].sort()).toEqual([2, 3, 4]);
  expect([...poseDescendants(d, 2)]).toEqual([3]);
  expect(roots(d)).toEqual([1]);
});
test('cycles get pseudo-roots and terminate', () => {
  const cyc = docOf(part(1, 'Part', [sock('1', 2, '6')]), part(2, 'Part', [sock('1', 1, '6')]));
  expect(topoPose(cyc)).toEqual({ order: [1, 2], pseudoRoots: [1] });
  expect(
    wouldCreatePoseCycle(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')])), 1, 2),
  ).toBe(true);
});
test('component floods joint-connected parts that match', () => {
  const d = docOf(
    part(1, 'Part', [], { RGB: [1, 1, 1] }),
    part(2, 'Part', [sock('1', 1, '6')], { RGB: [1, 1, 1] }),
    part(3, 'Part', [sock('1', 2, '6')], { RGB: [9, 9, 9] }),
    part(4, 'Part', [sock('1', 3, '6')], { RGB: [1, 1, 1] }),
  );
  const same = (p: any) => JSON.stringify(p.props.RGB) === '[1,1,1]';
  expect([...component(d, 1, same)].sort()).toEqual([1, 2]);
});
test('the pose conn is the first socket or point conn: raw conns never pose', () => {
  const d = docOf(
    part(1, 'Part'),
    part(2, 'Part', [
      { self: '1', target: { kind: 'raw', triple: ['1', '6', 2] } },
      sock('1', 1, '6'),
    ]),
  );
  expect(poseParent(d, 2)).toBe(1);
  expect(roots(d)).toEqual([1]);
});
test('a pose conn to a missing part leaves the part a pseudo-root, not a root', () => {
  const d = docOf(part(1, 'Part', [sock('1', 9, '6')]));
  expect(roots(d)).toEqual([]);
  expect(topoPose(d)).toEqual({ order: [1], pseudoRoots: [1] });
});
test('a tail hanging off a loop is posed from one pseudo-root', () => {
  const d = docOf(
    part(1, 'Part', [sock('1', 2, '6')]),
    part(2, 'Part', [sock('1', 3, '6')]),
    part(3, 'Part', [sock('1', 1, '6')]),
    part(4, 'Part', [sock('1', 1, '6')]),
  );
  expect(topoPose(d).pseudoRoots).toEqual([1]);
  expect(topoPose(d).order.sort()).toEqual([1, 2, 3, 4]);
});

test('a loop island with a joint into the posed build is anchored, not a pseudo-root', () => {
  // 2 and 3 pose off each other; 2 also has a joint onto the root 1.
  const d = docOf(
    part(1, 'Part'),
    part(2, 'Part', [sock('3', 3, '2'), sock('1', 1, '6')]),
    part(3, 'Part', [sock('1', 2, '6')]),
  );
  const p = topoPose(d);
  expect(p.pseudoRoots).toEqual([]);
  expect([...poseAnchors(d)]).toEqual([[2, 1]]);
  expect(p.order).toEqual([1, 2, 3]);
  expect([...poseDescendants(d, 1)].sort()).toEqual([2, 3]);
});
