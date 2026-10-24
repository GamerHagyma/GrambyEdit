// Moving one piece of a multi-piece part (D25): it always ends up stored on a point.
import { Matrix4, Vector3 } from 'three';
import { cfToMatrix4 } from '../../../src/core/cframe';
import {
  pieceBodies,
  bodyDescendants,
  retargetBody,
  transformPiece,
  type PoseTarget,
} from '../../../src/core/ops/move';
import { transact } from '../../../src/core/ops/transact';
import { bodyWorld, computePoses, piecePivot } from '../../../src/core/pose';
import { parseShareText, toShareCode } from '../../../src/core/share';
import type { CFrame12, Conn, Doc, Verdict } from '../../../src/core/types';
import { docOf, mount, part, pt, sock } from '../../helpers/doc';
import { realCatalog } from '../../helpers/real-catalog';

const up = (x: number, z = 0): CFrame12 => [x, 0.5, z, 1, 0, 0, 0, 1, 0, 0, 0, 1];
const near = (a: Matrix4, b: Matrix4) =>
  a.elements.forEach((v, k) => expect(v).toBeCloseTo(b.elements[k], 6));

/** Moves `body` of part `id` by `delta`: the new doc, the verdict, and the bodies before and after. */
async function move(doc: Doc, id: number, body: number, delta: Matrix4) {
  const cat = await realCatalog();
  const poses = computePoses(doc, cat, cat.conventions);
  let verdict: Verdict = { ok: true };
  const r = transact(doc, 'Move 1 piece', (d) => {
    verdict = transformPiece(d, cat, cat.conventions, poses, id, body, delta);
  });
  const after = computePoses(r.doc, cat, cat.conventions);
  return {
    ...r,
    verdict,
    before: (b: number) => bodyWorld(poses, id, b)!.clone(),
    after: (b: number) => bodyWorld(after, id, b)!.clone(),
  };
}

// A Wire's body A (0) has sockets 1–2, body B (1) sockets 3–4.
const wireOnPoints = () =>
  docOf(
    part(1, 'Part', [], {}, [pt('{u1}', up(0)), pt('{u2}', up(1))]),
    part(2, 'Wire', [mount('3', 1, '{u1}'), mount('1', 1, '{u2}')]),
  );

test('P1: a Wire end on a point moves alone, through its point', async () => {
  const delta = new Matrix4().makeTranslation(2, 0, 0);
  const r = await move(wireOnPoints(), 2, 0, delta);
  expect(r.verdict.ok).toBe(true);
  near(r.after(0), delta.clone().multiply(r.before(0)));
  near(r.after(1), r.before(1));
  expect(r.doc.parts.get(1)!.points!.size).toBe(2);
});

test('P1: a turn about the piece pivot turns only that piece', async () => {
  const cat = await realCatalog();
  const doc = wireOnPoints();
  const poses = computePoses(doc, cat, cat.conventions);
  const c = piecePivot(cat, 'Wire', 0)!
    .clone()
    .applyMatrix4(bodyWorld(poses, 2, 0)!);
  const delta = new Matrix4()
    .makeTranslation(c.x, c.y, c.z)
    .multiply(new Matrix4().makeRotationZ(Math.PI / 2))
    .multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  const r = await move(doc, 2, 0, delta);
  near(r.after(0), delta.clone().multiply(r.before(0)));
  near(r.after(1), r.before(1));
});

test('P2: a loose Wire end gets a point on the part its lead hangs from, and stays after a reload', async () => {
  const cat = await realCatalog();
  const doc = docOf(
    part(1, 'Part', [], {}, [pt('{u1}', up(0))]),
    part(2, 'Wire', [mount('3', 1, '{u1}')]),
  );
  const delta = new Matrix4().makeTranslation(0, 1, 0);
  const r = await move(doc, 2, 0, delta);
  expect(r.verdict.ok).toBe(true);
  expect(r.doc.parts.get(1)!.points!.size).toBe(2);
  const conns = r.doc.parts.get(2)!.conns;
  expect(conns).toHaveLength(2);
  expect(conns[1]).toMatchObject({ self: '1', target: { kind: 'point', part: 1 } });
  near(r.after(0), delta.clone().multiply(r.before(0)));
  near(r.after(1), r.before(1));
  // Export and import: the end is where it was dropped.
  const back = parseShareText(toShareCode(r.doc));
  if (!back.ok) throw new Error(back.message);
  near(bodyWorld(computePoses(back.doc, cat, cat.conventions), 2, 0)!, r.after(0));
});

test('P3: a Button base on a structural socket becomes a point mount on the same parent', async () => {
  const cat = await realCatalog();
  const doc = docOf(part(1, 'Part'), part(2, 'Button', [sock('3', 1, '6')]));
  // The circle has no conn, so it moves with the base (D19).
  expect(pieceBodies(doc, cat, 2, 0)).toEqual([0, 1]);
  const delta = new Matrix4().makeTranslation(1, 0, 0);
  const r = await move(doc, 2, 0, delta);
  expect(r.verdict.ok).toBe(true);
  expect(r.doc.parts.get(2)!.conns).toEqual([
    { self: '3', target: { kind: 'point', part: 1, uuid: expect.any(String) } },
  ]);
  near(r.after(0), delta.clone().multiply(r.before(0)));
});

test('P4: a Wire end wired to a socket is refused, and nothing changes', async () => {
  const doc = docOf(
    part(1, 'Part'),
    part(2, 'Button', [sock('3', 1, '6')]),
    part(3, 'Wire', [sock('1', 2, '2')]),
  );
  const r = await move(doc, 3, 0, new Matrix4().makeTranslation(1, 0, 0));
  expect(r.verdict).toEqual({
    ok: false,
    code: 'piece-wired',
    message:
      'Wire #3 is wired to Button #2 at this piece. Drag the piece onto another socket to re-wire it.',
  });
  expect(r.patch).toBeNull();
});

test('P5: a Wire that hangs from nothing moves whole, through its layout', async () => {
  const cat = await realCatalog();
  const doc = docOf(part(1, 'Wire'));
  expect(pieceBodies(doc, cat, 1, 0)).toEqual([0, 1]);
  expect(pieceBodies(wireOnPoints(), cat, 2, 0)).toEqual([0]);
  const delta = new Matrix4().makeTranslation(0, 0, 3);
  const r = await move(doc, 1, 0, delta);
  expect(r.verdict.ok).toBe(true);
  near(r.after(0), delta.clone().multiply(r.before(0)));
  near(r.after(1), delta.clone().multiply(r.before(1)));
});

test('an unknown piece is refused', async () => {
  const r = await move(wireOnPoints(), 2, 5, new Matrix4());
  expect(r.verdict).toMatchObject({ ok: false, code: 'no-body' });
  expect(r.patch).toBeNull();
});

describe('a Wire end stacks on its own other end (user, 2026-10-25)', () => {
  /** Re-attaches `body` of the Wire (part 2) to `target` on its own part. */
  async function stack(doc: Doc, body: number, target: PoseTarget) {
    const cat = await realCatalog();
    const before = computePoses(doc, cat, cat.conventions);
    let verdict: Verdict = { ok: true };
    const r = transact(doc, 'Move Wire piece', (d) => {
      verdict = retargetBody(d, cat, before, 2, body, target);
    });
    return { ...r, verdict, before, poses: computePoses(r.doc, cat, cat.conventions), cat };
  }
  const onSocket = (socket: string, childSocket: string): PoseTarget => ({
    kind: 'socket',
    part: 2,
    socket,
    childSocket,
  });
  // Where a socket's frame is in the world.
  const at = (r: Awaited<ReturnType<typeof stack>>, body: number, socket: string) =>
    new Vector3().setFromMatrixPosition(
      bodyWorld(r.poses, 2, body)!
        .clone()
        .multiply(cfToMatrix4(r.cat.parts.Wire.sockets[socket].frame)),
    );
  // A Part with Buttons on top (3, 4); the Wire is part 2.
  const buttons = (...wire: Conn[]) =>
    docOf(
      part(1, 'Part', [], {}, [pt('{u1}', up(0))]),
      part(2, 'Wire', wire),
      part(3, 'Button', [sock('3', 1, '6')]),
      part(4, 'Button', [sock('3', 1, '2')]),
    );

  test("a loose end joins the other end's socket: its socket 1 sits on socket 4", async () => {
    const r = await stack(buttons(sock('3', 3, '2')), 0, onSocket('4', '1'));
    expect(r.verdict).toEqual({ ok: true });
    expect(r.doc.parts.get(2)!.conns).toEqual([sock('3', 3, '2'), sock('1', 2, '4')]);
    expect(at(r, 0, '1').distanceTo(at(r, 1, '4'))).toBeLessThan(1e-6);
  });

  test('the lead end can join the other one: that one leads from then on', async () => {
    const r = await stack(buttons(sock('3', 3, '2'), sock('1', 4, '2')), 1, onSocket('2', '3'));
    expect(r.verdict).toEqual({ ok: true });
    expect(r.doc.parts.get(2)!.conns).toEqual([sock('1', 4, '2'), sock('3', 2, '2')]);
    expect(at(r, 1, '3').distanceTo(at(r, 0, '2'))).toBeLessThan(1e-6);
  });

  test('refused onto an end that hangs from nothing, onto its own socket, or onto an end on a point', async () => {
    const placed = buttons(mount('3', 1, '{u1}'));
    const loose = await stack(placed, 1, onSocket('2', '3'));
    expect(loose.verdict).toMatchObject({ ok: false, code: 'self-target' });
    expect(loose.patch).toBeNull();
    expect((await stack(placed, 1, onSocket('4', '3'))).verdict).toMatchObject({
      ok: false,
      code: 'self-target',
    });
    // A point mount takes the whole piece in game (E-TEAR): its other socket is not free.
    expect((await stack(placed, 0, onSocket('4', '1'))).verdict).toMatchObject({
      ok: false,
      code: 'piece-mounted',
    });
  });

  test("a loose end dropped on the placed end's surface sits there, on a point of the Wire", async () => {
    const cat = await realCatalog();
    const doc = buttons(mount('3', 1, '{u1}'));
    const poses = computePoses(doc, cat, cat.conventions);
    const frame = bodyWorld(poses, 2, 1)!
      .clone()
      .multiply(new Matrix4().makeTranslation(0, 0.1, 0.2));
    const r = await stack(doc, 0, {
      kind: 'surface',
      part: 2,
      frame,
      partName: cat.parts.Wire.mainPartName,
      body: 1,
    });
    expect(r.verdict).toEqual({ ok: true });
    const conns = r.doc.parts.get(2)!.conns;
    expect(conns[0]).toEqual(mount('3', 1, '{u1}'));
    expect(conns[1]).toMatchObject({ self: '1', target: { kind: 'point', part: 2 } });
    expect(r.doc.parts.get(2)!.points!.size).toBe(1);
    expect(at(r, 0, '1').distanceTo(new Vector3().setFromMatrixPosition(frame))).toBeLessThan(1e-6);
    // The other end has not moved, and a reload keeps the stack.
    near(bodyWorld(r.poses, 2, 1)!, bodyWorld(poses, 2, 1)!);
    const back = parseShareText(toShareCode(r.doc));
    if (!back.ok) throw new Error(back.message);
    near(bodyWorld(computePoses(back.doc, cat, cat.conventions), 2, 0)!, bodyWorld(r.poses, 2, 0)!);
  });

  test('the lead carries a self-stacked end and cannot be stacked back onto it', async () => {
    const cat = await realCatalog();
    const doc = buttons(mount('3', 1, '{u1}'));
    const poses = computePoses(doc, cat, cat.conventions);
    const r = await stack(doc, 0, {
      kind: 'surface',
      part: 2,
      frame: bodyWorld(poses, 2, 1)!.clone(),
      partName: cat.parts.Wire.mainPartName,
      body: 1,
    });
    expect(new Set(pieceBodies(r.doc, cat, 2, 1))).toEqual(new Set([0, 1]));
    const loop = await stack(r.doc, 1, {
      kind: 'surface',
      part: 2,
      frame: bodyWorld(r.poses, 2, 0)!.clone(),
      partName: cat.parts.Wire.mainPartName,
      body: 0,
    });
    expect(loop.verdict).toMatchObject({ ok: false, code: 'self-target' });
    expect(loop.patch).toBeNull();
  });

  test('a lead cannot be reattached to a child carried on one of its points', async () => {
    const cat = await realCatalog();
    const doc = docOf(
      part(1, 'Part', [], {}, [pt('{u1}', up(0))]),
      part(2, 'Wire', [mount('3', 1, '{u1}')], {}, [
        pt('{child}', up(1), cat.parts.Wire.mainPartName),
      ]),
      part(3, 'Button', [mount('3', 2, '{child}')]),
    );
    expect(bodyDescendants(doc, cat, 2, 1).has(3)).toBe(true);
    const r = await stack(doc, 1, {
      kind: 'surface',
      part: 3,
      frame: new Matrix4(),
      partName: cat.parts.Button.mainPartName,
      body: 0,
    });
    expect(r.verdict).toMatchObject({ ok: false, code: 'pose-cycle' });
    expect(r.patch).toBeNull();
  });

  test('a body cannot attach to a dependent secondary end of another Wire', async () => {
    const doc = docOf(
      part(1, 'Part', [], {}, [pt('{a}', up(0)), pt('{b}', up(1))]),
      part(2, 'Wire', [mount('3', 1, '{a}')]),
      part(3, 'Wire', [mount('3', 1, '{b}'), sock('1', 2, '4')]),
    );
    const r = await stack(doc, 1, { kind: 'socket', part: 3, socket: '2', childSocket: '3' });
    expect(r.verdict).toMatchObject({ ok: false, code: 'pose-cycle' });
    expect(r.patch).toBeNull();
  });

  test('an external surface point depends on its host lead, even when another body was hit', async () => {
    const cat = await realCatalog();
    const doc = docOf(
      part(1, 'Part', [], {}, [pt('{a}', up(0)), pt('{b}', up(1))]),
      part(2, 'Wire', [mount('3', 1, '{a}')], {}, [pt('{q}', up(0), cat.parts.Wire.mainPartName)]),
      part(3, 'Wire', [mount('3', 2, '{q}'), mount('1', 1, '{b}')]),
    );
    const r = await stack(doc, 1, {
      kind: 'surface',
      part: 3,
      body: 0,
      frame: new Matrix4(),
      partName: cat.parts.Wire.mainPartName,
    });
    expect(r.verdict).toMatchObject({ ok: false, code: 'pose-cycle' });
    expect(r.patch).toBeNull();
  });

  test('a self-stack cannot loop through a part attached between its two ends', async () => {
    const cat = await realCatalog();
    const doc = docOf(
      part(1, 'Part', [], {}, [pt('{a}', up(0))]),
      part(2, 'Wire', [mount('3', 1, '{a}'), mount('1', 3, '{b}')], {}, [
        pt('{q}', up(0), cat.parts.Wire.mainPartName),
      ]),
      part(3, 'Button', [mount('3', 2, '{q}')], {}, [
        pt('{b}', up(0), cat.parts.Button.mainPartName),
      ]),
    );
    const r = await stack(doc, 1, {
      kind: 'surface',
      part: 2,
      body: 0,
      frame: new Matrix4(),
      partName: cat.parts.Wire.mainPartName,
    });
    expect(r.verdict).toMatchObject({ ok: false, code: 'pose-cycle' });
    expect(r.patch).toBeNull();
  });
});
