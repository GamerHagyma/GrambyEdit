import { SphereBVH } from '../../src/viewport/bvh';

test('candidates equal brute force for 2,000 spheres and 100 rays', () => {
  let s = 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 100 - 50;
  const items = Array.from({ length: 2000 }, (_, id) => ({
    id,
    center: [r(), r(), r()] as const,
    radius: 0.5 + Math.abs(r()) / 50,
  }));
  const bvh = new SphereBVH(items);
  for (let k = 0; k < 100; k++) {
    const o = [r(), r(), r()] as const,
      d0 = [r(), r(), r()],
      n = Math.hypot(...d0);
    const d = [d0[0] / n, d0[1] / n, d0[2] / n] as const;
    const brute = items
      .filter((it) => {
        const oc = [it.center[0] - o[0], it.center[1] - o[1], it.center[2] - o[2]];
        const t = Math.max(0, oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2]);
        const p = [
          o[0] + d[0] * t - it.center[0],
          o[1] + d[1] * t - it.center[1],
          o[2] + d[2] * t - it.center[2],
        ];
        return Math.hypot(...p) <= it.radius;
      })
      .map((it) => it.id)
      .sort((a, b) => a - b);
    expect(bvh.rayCandidates(o, d).sort((a, b) => a - b)).toEqual(brute);
  }
});
test('an empty tree and a single item', () => {
  expect(new SphereBVH([]).rayCandidates([0, 0, 0], [1, 0, 0])).toEqual([]);
  const one = new SphereBVH([{ id: 7, center: [5, 0, 0], radius: 1 }]);
  expect(one.rayCandidates([0, 0, 0], [1, 0, 0])).toEqual([7]);
  expect(one.rayCandidates([0, 0, 0], [-1, 0, 0])).toEqual([]);
  expect(one.rayCandidates([5, 0.5, 0], [0, 1, 0])).toEqual([7]);
});
