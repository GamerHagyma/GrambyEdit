// @vitest-environment jsdom
// Transforms of one piece of a multi-piece part (D25): sessions, gizmo placement and preview.
import { Matrix4, Vector3 } from 'three';
import { bodyWorld, computePoses, piecePivot } from '../../src/core/pose';
import type { Doc } from '../../src/core/types';
import { select, selectionSig, selectPiece } from '../../src/state/selection';
import { baseCatalogSig, docSig, loadDoc, resetStoreForTests, undo } from '../../src/state/store';
import { toastsSig } from '../../src/state/toasts';
import {
  beginSession,
  cancelSession,
  finishSession,
  gizmoPlacement,
  previewSession,
} from '../../src/tools/transform';
import { setViewport, type ViewportContext } from '../../src/viewport/context';
import { docOf, mount, part, pt, sock } from '../helpers/doc';
import { realCatalog } from '../helpers/real-catalog';
import { fakeViewport } from '../helpers/viewport';

const up = (x: number) => [x, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
const near = (a: Matrix4, b: Matrix4) =>
  a.elements.forEach((v, k) => expect(v).toBeCloseTo(b.elements[k], 6));

// A Wire on two points of a Part: body A (0) by socket 1, body B (1, the lead) by socket 3. A Light
// hangs from body B's socket 4.
const wired = (): Doc =>
  docOf(
    part(1, 'Part', [], {}, [pt('{u1}', [...up(0)]), pt('{u2}', [...up(1)])]),
    part(2, 'Wire', [mount('3', 1, '{u1}'), mount('1', 1, '{u2}')]),
    part(3, 'Light', [sock('1', 2, '4')]),
  );

beforeEach(async () => {
  resetStoreForTests();
  baseCatalogSig.value = await realCatalog();
  setViewport(fakeViewport());
});
afterEach(() => setViewport(null));

const posesOf = async (doc: Doc) => {
  const cat = await realCatalog();
  return computePoses(doc, cat, cat.conventions);
};

test("the gizmo sits on a selected piece's pivot, not the part's origin", async () => {
  const cat = await realCatalog();
  const doc = wired();
  const poses = await posesOf(doc);
  const sel = {
    parts: new Set([2]),
    pieces: new Map([[2, 0]]),
    points: new Set<never>(),
    active: 2,
  };
  const at = gizmoPlacement(doc, poses, sel, 'median', 'world', cat)!.position;
  const want = piecePivot(cat, 'Wire', 0)!
    .clone()
    .applyMatrix4(bodyWorld(poses, 2, 0)!);
  expect(at.distanceTo(want)).toBeLessThan(1e-9);
  // Without the catalog, the part counts whole.
  const whole = gizmoPlacement(doc, poses, sel, 'median', 'world')!.position;
  expect(whole.distanceTo(new Vector3().setFromMatrixPosition(poses.world.get(2)!))).toBeLessThan(
    1e-9,
  );
});

test('a piece session moves that body and what hangs from it, and commits one entry', async () => {
  loadDoc(wired());
  const before = await posesOf(docSig.value);
  selectPiece(2, 0, 'replace');
  const s = beginSession()!;
  expect(s.ids).toEqual([2]);
  expect([...s.pieces.keys()]).toEqual([2]);
  // The Light hangs from body B, which stays.
  expect(s.moving.has(3)).toBe(false);
  expect(s.moving.has(2)).toBe(false);
  finishSession(s, { kind: 'move', offset: new Vector3(0, 0, 2) });
  const after = await posesOf(docSig.value);
  near(
    bodyWorld(after, 2, 0)!,
    new Matrix4().makeTranslation(0, 0, 2).multiply(bodyWorld(before, 2, 0)!),
  );
  near(bodyWorld(after, 2, 1)!, bodyWorld(before, 2, 1)!);
  near(after.world.get(3)!, before.world.get(3)!);
  expect(undo()).toBe(true);
  expect(docSig.value.parts.get(1)).toEqual(wired().parts.get(1));
  expect(docSig.value.parts.get(2)).toEqual(wired().parts.get(2));
});

test('the preview draws only the moving piece', async () => {
  const calls: [number, number][] = [];
  const layer = {
    setPreview: () => {},
    setBodyPreview: (id: number, body: number) => calls.push([id, body]),
  } as unknown as NonNullable<ViewportContext['layer']>;
  setViewport(fakeViewport({ layer }));
  loadDoc(wired());
  selectPiece(2, 0, 'replace');
  const s = beginSession()!;
  previewSession(s, { kind: 'move', offset: new Vector3(1, 0, 0) });
  cancelSession(s);
  expect(calls).toEqual([
    [2, 0],
    [2, 0],
  ]);
});

test('a Wire end wired to a Button moves with the Button, without a refusal', async () => {
  const doc = docOf(
    part(1, 'Part'),
    part(2, 'Button', [sock('3', 1, '6')]),
    part(3, 'Wire', [sock('1', 2, '2')]),
  );
  loadDoc(doc);
  select([2], 'replace');
  selectPiece(3, 0, 'add');
  expect(selectionSig.value.pieces.get(3)).toBe(0);
  const s = beginSession()!;
  expect(s.ids).toEqual([2]);
  const toasts = toastsSig.value.length;
  finishSession(s, { kind: 'move', offset: new Vector3(1, 0, 0) });
  expect(toastsSig.value.length).toBe(toasts);
  expect(docSig.value.parts.get(3)).toEqual(doc.parts.get(3));
});

test('moving the lead previews and commits both ends of a self-stacked Wire', async () => {
  const doc = docOf(
    part(1, 'Part', [], {}, [pt('{anchor}', [...up(0)])]),
    part(2, 'Wire', [mount('3', 1, '{anchor}'), mount('1', 2, '{stack}')], {}, [
      pt('{stack}', [...up(0)]),
    ]),
  );
  loadDoc(doc);
  const before = await posesOf(doc);
  const previews = new Map<number, Matrix4>();
  const layer = {
    setPreview: () => {},
    setBodyPreview: (_id: number, body: number, m: Matrix4) => previews.set(body, m.clone()),
  } as unknown as NonNullable<ViewportContext['layer']>;
  setViewport(fakeViewport({ layer }));
  selectPiece(2, 1, 'replace');
  const s = beginSession()!;
  const delta = { kind: 'move', offset: new Vector3(2, 0, 0) } as const;
  previewSession(s, delta);
  for (const body of [0, 1]) {
    expect(previews.has(body)).toBe(true);
    near(
      previews.get(body)!,
      new Matrix4().makeTranslation(2, 0, 0).multiply(bodyWorld(before, 2, body)!),
    );
  }
  finishSession(s, delta);
  const after = await posesOf(docSig.value);
  for (const body of [0, 1]) near(bodyWorld(after, 2, body)!, previews.get(body)!);
});
