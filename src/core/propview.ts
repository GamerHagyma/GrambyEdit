// The Properties panel's model (spec §13.3): property rows across a selection, the selection header and
// the props that have no PropMeta. Pure: it reads the doc and catalog it is given, and no signals.
import type { Catalog, PropMeta } from './catalog-types';
import { propApplies } from './ops/props';
import type { Doc, Json, Part, PartId } from './types';

export interface PropRow {
  readonly key: string;
  readonly meta: PropMeta;
  /** The value every applicable part holds; undefined when unset everywhere, or when `mixed`. */
  readonly value: Json | undefined;
  /** The applicable parts disagree: different set values, or some set and some unset. */
  readonly mixed: boolean;
  /** Selected parts the key applies to. */
  readonly applies: number;
  readonly total: number;
}

/** These rows come first, in this order; every other row follows by label. */
const LEAD = ['RGB', 'OrientationX', 'OrientationY', 'OrientationZ'];
const SERVO_PROPS = ['Speed', 'Rest', 'LimitEnabled', 'LimitAngle', 'Rotation'];

/** Servo runtime/legacy fields survive import/export but are not offered as editable controls. */
export function visibleProperty(type: string, key: string): boolean {
  return (type !== 'Servo' && type !== 'Servo_Physics') || SERVO_PROPS.includes(key);
}
/** Points live in `part.points`, so this key is never a prop row. */
const EPHEMERAL = 'EphemeralAttachments';

const metaOf = (cat: Catalog, key: string): PropMeta | undefined =>
  Object.hasOwn(cat.propMeta, key) ? cat.propMeta[key] : undefined;

/** The selected parts that exist in the doc, in the order given. */
function partsOf(doc: Doc, ids: readonly PartId[]): Part[] {
  return ids.flatMap((id) => {
    const part = doc.parts.get(id);
    return part ? [part] : [];
  });
}

const sameJson = (a: Json, b: Json): boolean => JSON.stringify(a) === JSON.stringify(b);

const leadRank = (key: string): number => {
  const at = LEAD.indexOf(key);
  return at < 0 ? LEAD.length : at;
};

/** Every prop key that applies to at least one selected part and has a PropMeta, one row each. */
export function unionProps(doc: Doc, cat: Catalog, ids: readonly PartId[]): PropRow[] {
  const parts = partsOf(doc, ids);
  const keys = new Set<string>();
  for (const part of parts) {
    if (Object.hasOwn(cat.parts, part.type))
      for (const key of cat.parts[part.type].props) keys.add(key);
    for (const key of Object.keys(part.props)) keys.add(key);
  }
  const rows: PropRow[] = [];
  for (const key of keys) {
    const meta = metaOf(cat, key);
    if (!meta || key === EPHEMERAL) continue;
    const applicable = parts.filter(
      (part) => visibleProperty(part.type, key) && propApplies(cat, part, key),
    );
    if (applicable.length === 0) continue;
    const values = applicable.map((part) =>
      Object.hasOwn(part.props, key) ? part.props[key] : undefined,
    );
    const set = values.filter((v): v is Json => v !== undefined);
    // Unset counts as different from any set value, so a partly set key is mixed.
    const shared =
      set.length === 0 || (set.length === values.length && set.every((v) => sameJson(v, set[0])));
    rows.push({
      key,
      meta,
      value: shared && set.length > 0 ? set[0] : undefined,
      mixed: !shared,
      applies: applicable.length,
      total: parts.length,
    });
  }
  const rank = (key: string) => {
    const lead = leadRank(key);
    if (lead < LEAD.length) return lead;
    const servo = SERVO_PROPS.indexOf(key);
    return LEAD.length + (servo < 0 ? SERVO_PROPS.length : servo);
  };
  return rows.sort((a, b) => rank(a.key) - rank(b.key) || a.meta.label.localeCompare(b.meta.label));
}

/** The selected parts' types with their counts, in the order each type first appears. */
export function typeCounts(doc: Doc, ids: readonly PartId[]): { type: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const part of partsOf(doc, ids)) counts.set(part.type, (counts.get(part.type) ?? 0) + 1);
  return [...counts].map(([type, count]) => ({ type, count }));
}

/** "3 parts — 2 Mag, 1 ShortStick". */
export function selectionHeader(doc: Doc, ids: readonly PartId[]): string {
  const n = partsOf(doc, ids).length;
  const types = typeCounts(doc, ids)
    .map((c) => `${c.count} ${c.type}`)
    .join(', ');
  return `${n} ${n === 1 ? 'part' : 'parts'} — ${types}`;
}

/** The part's props that have no PropMeta, edited as JSON. `EphemeralAttachments` is left out. */
export function otherProps(doc: Doc, cat: Catalog, id: PartId): Record<string, Json> {
  const part = doc.parts.get(id);
  if (!part) return {};
  return Object.fromEntries(
    Object.entries(part.props).filter(
      ([key]) => visibleProperty(part.type, key) && key !== EPHEMERAL && !metaOf(cat, key),
    ),
  );
}

const DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

const NAMED: Readonly<Record<string, string>> = {
  ShiftLeft: 'LeftShift',
  ShiftRight: 'RightShift',
  ControlLeft: 'LeftControl',
  ControlRight: 'RightControl',
  AltLeft: 'LeftAlt',
  AltRight: 'RightAlt',
  Space: 'Space',
  Enter: 'Return',
  NumpadEnter: 'KeypadEnter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Escape: 'Escape',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

/** The Roblox `KeyCode` name of a `KeyboardEvent.code`, or null for a key this mapping leaves out. */
export function robloxKeyName(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return DIGITS[Number(digit[1])];
  const keypad = /^Numpad([0-9])$/.exec(code);
  if (keypad) return `Keypad${DIGITS[Number(keypad[1])]}`;
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return Object.hasOwn(NAMED, code) ? NAMED[code] : null;
}
