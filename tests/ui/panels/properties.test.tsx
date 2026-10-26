// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/preact';
import { Properties } from '../../../src/ui/panels/Properties';
import {
  baseCatalogSig,
  docSig,
  historySig,
  loadDoc,
  resetStoreForTests,
} from '../../../src/state/store';
import { select, selectModeSig, selectionSig } from '../../../src/state/selection';
import { docOf, part, pt, sock } from '../../helpers/doc';
import { MINI } from '../../helpers/catalog';
import { realCatalog } from '../../helpers/real-catalog';
import { parseShareText, toShareCode } from '../../../src/core/share';
import { Matrix4 } from 'three';
import { matrix4ToCf } from '../../../src/core/cframe';
import { copyFrame } from '../../../src/core/symmetry';
import { committedPosesSig } from '../../../src/state/derived';
import { chooseSymmetryAnchor, clearSymmetry, applySymmetry } from '../../../src/state/symmetry';

beforeEach(() => {
  resetStoreForTests();
  clearSymmetry();
});
afterEach(clearSymmetry);

test('Orientation fields mirror an existing counterpart in the same edit', () => {
  baseCatalogSig.value = MINI;
  loadDoc({
    ...docOf(part(1, 'Part'), part(2, 'Part')),
    layout: new Map([[2, matrix4ToCf(new Matrix4().makeTranslation(2, 0, 0))]]),
  });
  select([1], 'replace');
  chooseSymmetryAnchor();
  select([2], 'replace');
  applySymmetry();
  const source = docSig.peek().order[2];
  select([source], 'replace');
  render(<Properties />);
  const x = screen.getByLabelText('Orientation X');
  fireEvent.input(x, { target: { value: '45' } });
  fireEvent.blur(x);
  const poses = committedPosesSig.peek(),
    wanted = copyFrame(new Matrix4().makeScale(-1, 1, 1), poses.world.get(source)!, 'Part');
  poses.world.get(2)!.elements.forEach((v, i) => expect(v).toBeCloseTo(wanted.elements[i], 7));
});

test.each(['Servo', 'Servo_Physics'])(
  '%s fields use canonical keys, accept >360 and keep Rotation',
  async (type) => {
    baseCatalogSig.value = await realCatalog();
    const sample = `[["${type}",[],{"Rotation":0,"LimitAngle":36.9,"Speed":47.2,"Rest":true,"LimitEnabled":true}]]`;
    const parsed = parseShareText(sample);
    if (!parsed.ok) throw new Error(parsed.message);
    loadDoc(parsed.doc);
    select([1], 'replace');
    const { container } = render(<Properties />);
    expect([...container.querySelectorAll('.prop-label')].map((el) => el.textContent)).toEqual([
      'Speed (°/s)',
      'Rest',
      'Limit enabled',
      'Limit angle (°)',
      'Rotation (°)',
    ]);
    expect(screen.queryByLabelText('Forwards')).toBeNull();
    expect(screen.getByRole('group', { name: 'Simulate' })).toBeTruthy();
    for (const [label, value] of [
      ['Speed (°/s)', '720.5'],
      ['Limit angle (°)', '1080'],
      ['Rotation (°)', '-47.2'],
    ]) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input.getAttribute('max')).toBeNull();
      fireEvent.input(input, { target: { value } });
      fireEvent.blur(input);
    }
    fireEvent.click(screen.getByLabelText('Rest'));
    fireEvent.click(screen.getByLabelText('Limit enabled'));
    const back = parseShareText(toShareCode(docSig.value));
    if (!back.ok) throw new Error(back.message);
    expect(back.doc.parts.get(1)!.props).toEqual({
      Rotation: -47.2,
      LimitAngle: 1080,
      Speed: 720.5,
      Rest: false,
      LimitEnabled: false,
    });
  },
);

test('mixed selection edits generic properties on non-servos only', async () => {
  baseCatalogSig.value = await realCatalog();
  loadDoc(docOf(part(1, 'Servo', [], { OrientationX: 100 }), part(2, 'Part')));
  select([1, 2], 'replace');
  render(<Properties />);
  const input = screen.getByLabelText('Orientation X');
  fireEvent.input(input, { target: { value: '45' } });
  fireEvent.blur(input);
  expect(docSig.value.parts.get(1)!.props.OrientationX).toBe(100);
  expect(docSig.value.parts.get(2)!.props.OrientationX).toBe(45);
});

test('editing Bullets on a mixed selection writes only to the mags', () => {
  baseCatalogSig.value = MINI;
  loadDoc(
    docOf(
      part(1, 'Mag', [], { Bullets: 10 }),
      part(2, 'Mag', [], { Bullets: 20 }),
      part(3, 'ShortStick'),
    ),
  );
  select([1, 2, 3], 'replace');
  render(<Properties />);
  expect(screen.getByText('applies to 2 of 3')).toBeTruthy();
  const input = screen.getByLabelText('Bullets') as HTMLInputElement;
  fireEvent.input(input, { target: { value: '30' } });
  fireEvent.blur(input);
  expect(docSig.value.parts.get(1)!.props.Bullets).toBe(30);
  expect(docSig.value.parts.get(2)!.props.Bullets).toBe(30);
  expect(docSig.value.parts.get(3)!.props).toEqual({});
});

test('a single selection lists its connections with the pose badge', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Gate-AND'), part(2, 'Wire', [sock('1', 1, '1'), sock('3', 1, '2')])));
  select([2], 'replace');
  render(<Properties />);
  expect(screen.getAllByText(/Gate-AND #1/)).toHaveLength(2);
  expect(screen.getByText('pose')).toBeTruthy();
});

test('clicking a type chip narrows the selection to that type', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Mag'), part(2, 'Mag'), part(3, 'ShortStick')));
  select([1, 2, 3], 'replace');
  render(<Properties />);
  expect(screen.getByRole('group', { name: /parts? —/ }).textContent).toBe(
    '3 parts — 2 Mag, 1 ShortStick',
  );
  fireEvent.click(screen.getByRole('button', { name: '2 Mag' }));
  expect([...selectionSig.value.parts]).toEqual([1, 2]);
});

test('a type chip keeps only that type, even in attached mode', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Gate-AND'), part(2, 'Wire', [sock('1', 1, '1')]), part(3, 'Gate-NOT')));
  selectModeSig.value = 'attached';
  select([1, 3], 'replace');
  expect([...selectionSig.value.parts].sort()).toEqual([1, 2, 3]);
  render(<Properties />);
  fireEvent.click(screen.getByRole('button', { name: '1 Gate-AND' }));
  expect([...selectionSig.value.parts]).toEqual([1]);
});

test('Disconnect removes a joint that is not the pose', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Gate-AND'), part(2, 'Wire', [sock('1', 1, '1'), sock('3', 1, '2')])));
  select([2], 'replace');
  render(<Properties />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[1]);
  expect(docSig.value.parts.get(2)!.conns).toEqual([sock('1', 1, '1')]);
});

test('Disconnect on the pose joint hands the pose to the other joint', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Gate-AND'), part(2, 'Wire', [sock('1', 1, '1'), sock('3', 1, '2')])));
  select([2], 'replace');
  render(<Properties />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[0]);
  expect(docSig.value.parts.get(2)!.conns).toEqual([sock('3', 1, '2')]);
});

test('Make pose joint moves that joint to the front', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Gate-AND'), part(2, 'Wire', [sock('1', 1, '1'), sock('3', 1, '2')])));
  select([2], 'replace');
  render(<Properties />);
  fireEvent.click(screen.getByRole('button', { name: 'Make pose joint' }));
  expect(docSig.value.parts.get(2)!.conns.map((c) => c.self)).toEqual(['3', '1']);
});

test('the key capture writes the next key as its Roblox name', () => {
  baseCatalogSig.value = {
    ...MINI,
    propMeta: { ...MINI.propMeta, ActivationKey: { widget: 'key', label: 'Activation Key' } },
  };
  loadDoc(docOf(part(1, 'Light', [], { ActivationKey: 'LeftShift' })));
  select([1], 'replace');
  render(<Properties />);
  fireEvent.click(screen.getByLabelText('Activation Key'));
  fireEvent.keyDown(window, { code: 'KeyW' });
  expect(docSig.value.parts.get(1)!.props.ActivationKey).toBe('W');
  // Capturing the key a part already holds is no edit, so no undo entry is recorded.
  const before = historySig.value;
  fireEvent.click(screen.getByLabelText('Activation Key'));
  fireEvent.keyDown(window, { code: 'KeyW' });
  expect(historySig.value).toBe(before);
});

test('the orientation buttons turn each part by 90 degrees from its own value', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'ShortStick', [], { OrientationX: 10 }), part(2, 'ShortStick')));
  select([1, 2], 'replace');
  render(<Properties />);
  fireEvent.click(screen.getByRole('button', { name: 'Orientation X +90' }));
  expect(docSig.value.parts.get(1)!.props.OrientationX).toBe(100);
  expect(docSig.value.parts.get(2)!.props.OrientationX).toBe(90);
});

test('dragging a number moves one step per 4 px and commits once on release', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'ShortStick', [], { OrientationX: 0 })));
  select([1], 'replace');
  render(<Properties />);
  const input = screen.getByLabelText('Orientation X') as HTMLInputElement;
  fireEvent.pointerDown(input, { clientX: 100, button: 0 });
  fireEvent.pointerMove(window, { clientX: 108 });
  expect(docSig.value.parts.get(1)!.props.OrientationX).toBe(0);
  expect(input.value).toBe('90');
  fireEvent.pointerUp(window);
  // Orientation steps by 45 degrees (the catalog's step): two steps of 4 px each.
  expect(docSig.value.parts.get(1)!.props.OrientationX).toBe(90);
});

test('other properties edit as JSON; invalid text is flagged and not written', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Mag', [], { Mystery: [1, 2] })));
  select([1], 'replace');
  render(<Properties />);
  const field = screen.getByLabelText('Mystery') as HTMLTextAreaElement;
  fireEvent.input(field, { target: { value: '[1, 2' } });
  fireEvent.blur(field);
  expect(docSig.value.parts.get(1)!.props.Mystery).toEqual([1, 2]);
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.input(field, { target: { value: '[3]' } });
  fireEvent.blur(field);
  expect(docSig.value.parts.get(1)!.props.Mystery).toEqual([3]);
});

test('a single selection shows its entry, code cost and approximate-position flag', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Gate-AND'), part(2, 'Wire', [sock('1', 1, '1')])));
  select([2], 'replace');
  render(<Properties />);
  expect(screen.getByText('#2')).toBeTruthy();
  expect(screen.getByText('≈ approximate position')).toBeTruthy();
  expect(screen.getByText(/^\d+ chars$/)).toBeTruthy();
});

test('a host lists its points', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Base', [], {}, [pt('{p1}', undefined, 'Arm')])));
  select([1], 'replace');
  render(<Properties />);
  expect(screen.getByText('Arm')).toBeTruthy();
});
