import { otherProps, robloxKeyName, selectionHeader, unionProps } from '../../src/core/propview';
import { MINI } from '../helpers/catalog';
import { docOf, part } from '../helpers/doc';
import { realCatalog } from '../helpers/real-catalog';
import { parseShareText, toShareCode } from '../../src/core/share';

test('two Mags and a ShortStick', () => {
  const d = docOf(
    part(1, 'Mag', [], { Bullets: 10 }),
    part(2, 'Mag', [], { Bullets: 20 }),
    part(3, 'ShortStick'),
  );
  const rows = unionProps(d, MINI, [1, 2, 3]);
  expect(rows.find((r) => r.key === 'Bullets')).toMatchObject({
    applies: 2,
    total: 3,
    mixed: true,
  });
  expect(rows.find((r) => r.key === 'RGB')).toMatchObject({ applies: 1, total: 3 });
  expect(selectionHeader(d, [1, 2, 3])).toBe('3 parts — 2 Mag, 1 ShortStick');
  expect(robloxKeyName('ShiftLeft')).toBe('LeftShift');
  expect(robloxKeyName('Digit1')).toBe('One');
});

test('a value shared by every applicable part is shown; an unset part counts as different', () => {
  const shared = unionProps(
    docOf(part(1, 'Mag', [], { Bullets: 7 }), part(2, 'Mag', [], { Bullets: 7 })),
    MINI,
    [1, 2],
  );
  expect(shared.find((r) => r.key === 'Bullets')).toMatchObject({
    value: 7,
    mixed: false,
    applies: 2,
    total: 2,
  });

  const half = unionProps(docOf(part(1, 'Mag', [], { Bullets: 7 }), part(2, 'Mag')), MINI, [1, 2]);
  expect(half.find((r) => r.key === 'Bullets')).toMatchObject({ value: undefined, mixed: true });

  const none = unionProps(docOf(part(1, 'Mag'), part(2, 'Mag')), MINI, [1, 2]);
  expect(none.find((r) => r.key === 'Bullets')).toMatchObject({ value: undefined, mixed: false });
});

test('RGB and the orientations lead, the rest follow by label', () => {
  const stick = unionProps(docOf(part(1, 'ShortStick')), MINI, [1]);
  expect(stick.map((r) => r.key)).toEqual(['RGB', 'OrientationX', 'OrientationY', 'OrientationZ']);

  const mixed = unionProps(
    docOf(part(1, 'Light'), part(2, 'Mag', [], { Bullets: 1 })),
    MINI,
    [1, 2],
  );
  expect(mixed.map((r) => r.key)).toEqual(['RGB', 'Activated', 'Bullets']);
});

test('otherProps lists keys without a PropMeta and leaves EphemeralAttachments out', () => {
  const d = docOf(part(1, 'Mag', [], { Bullets: 3, Mystery: [1, 2], EphemeralAttachments: 'odd' }));
  expect(otherProps(d, MINI, 1)).toEqual({ Mystery: [1, 2] });
});

test('robloxKeyName maps the keys the capture needs and rejects the rest', () => {
  expect(robloxKeyName('KeyW')).toBe('W');
  expect(robloxKeyName('Digit0')).toBe('Zero');
  expect(robloxKeyName('ArrowUp')).toBe('Up');
  expect(robloxKeyName('Enter')).toBe('Return');
  expect(robloxKeyName('Space')).toBe('Space');
  expect(robloxKeyName('ControlLeft')).toBe('LeftControl');
  expect(robloxKeyName('ShiftRight')).toBe('RightShift');
  expect(robloxKeyName('Numpad5')).toBe('KeypadFive');
  expect(robloxKeyName('F12')).toBe('F12');
  expect(robloxKeyName('Semicolon')).toBeNull();
  expect(robloxKeyName('constructor')).toBeNull();
});

test('EphemeralAttachments is never a row, even when the catalog gives it a PropMeta', () => {
  const cat = {
    ...MINI,
    propMeta: {
      ...MINI.propMeta,
      EphemeralAttachments: { widget: 'text' as const, label: 'Points' },
    },
  };
  const rows = unionProps(docOf(part(1, 'Base', [], {}, [])), cat, [1]);
  expect(rows.map((r) => r.key)).not.toContain('EphemeralAttachments');
});

test('a one-part selection says "1 part"', () => {
  expect(selectionHeader(docOf(part(1, 'Wire')), [1])).toBe('1 part — 1 Wire');
});

test.each(['Servo', 'Servo_Physics'])(
  '%s shows only the five requested rows in order, preserving hidden data',
  async (type) => {
    const cat = await realCatalog();
    const doc = docOf(
      part(1, type, [], {
        Rotation: 0,
        LimitAngle: 36.9,
        Speed: 47.2,
        Rest: true,
        LimitEnabled: true,
        Forwards: true,
        RGB: [1, 2, 3],
        Mystery: 99,
      }),
    );
    const code = toShareCode(doc);
    const rows = unionProps(doc, cat, [1]);
    expect(rows.map((row) => row.key)).toEqual([
      'Speed',
      'Rest',
      'LimitEnabled',
      'LimitAngle',
      'Rotation',
    ]);
    expect(rows.map((row) => row.value)).toEqual([47.2, true, true, 36.9, 0]);
    expect(otherProps(doc, cat, 1)).toEqual({});
    expect(toShareCode(doc)).toBe(code);
    const back = parseShareText(code);
    if (!back.ok) throw new Error(back.message);
    expect(back.doc.parts.get(1)!.props).toEqual(doc.parts.get(1)!.props);
  },
);
