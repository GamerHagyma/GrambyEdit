// The keyboard and mouse guide (View → Keyboard shortcuts, or ?). The key lists come from the keymap
// of the current camera scheme, so they always match what the keys do; mouse actions and the details of
// a modal move are written out here.
import { Fragment, type JSX } from 'preact';
import { allCommands } from '../../state/commands';
import { KEYMAPS, type Scheme } from '../../state/keymap';
import { settingsSig } from '../../state/settings';
import { Dialog } from '../layout/Dialog';

interface Row {
  /** Alternatives; `+` joins the keys of one combination. */
  readonly keys: readonly string[];
  readonly action: string;
}

interface Section {
  readonly title: string;
  readonly note?: string;
  readonly rows: readonly Row[];
}

const MODAL: Section = {
  title: 'While moving or rotating (G, R)',
  note: 'Works with parts selected, in any tool but Sockets.',
  rows: [
    { keys: ['Mouse'], action: 'Move: the parts follow it; rotate: they turn around the pivot' },
    {
      keys: ['X', 'Y', 'Z'],
      action: 'Lock to that axis; press again for the part’s own axis, again to unlock',
    },
    { keys: ['0–9', '.', '-'], action: 'Type an exact distance (studs) or angle (degrees)' },
    { keys: ['Ctrl'], action: 'Hold to snap to the snap steps (Snap in the toolbar)' },
    { keys: ['Enter', 'Left click'], action: 'Confirm' },
    { keys: ['Esc', 'Right click'], action: 'Cancel' },
  ],
};

const MOUSE: Section = {
  title: 'Mouse',
  rows: [
    { keys: ['Click'], action: 'Select a part' },
    { keys: ['Shift+Click'], action: 'Add or remove a part' },
    { keys: ['Ctrl+Click'], action: 'Remove a part' },
    { keys: ['Drag'], action: 'Box select from empty space' },
    { keys: ['Drag'], action: 'Move tool: drag a part onto a socket or surface to re-attach it' },
    { keys: ['Click'], action: 'Connect tool: pick a part for a free socket or point' },
    { keys: ['Shift+Click'], action: 'Connect tool: gather several sockets, then pick once' },
    { keys: ['Drag'], action: 'Connect tool: from one socket to another to join them' },
    { keys: ['Click'], action: 'Point tool: add a point on a part surface, or select one' },
  ],
};

const CAMERA: Record<Scheme, Section> = {
  blender: {
    title: 'Camera (Blender controls)',
    rows: [
      { keys: ['Middle drag'], action: 'Orbit' },
      { keys: ['Shift+Middle drag'], action: 'Pan' },
      { keys: ['Wheel'], action: 'Zoom to the cursor' },
      { keys: ['Alt+Left drag'], action: 'Orbit, with “Emulate 3-button mouse” on in Settings' },
    ],
  },
  studio: {
    title: 'Camera (Studio controls)',
    rows: [
      { keys: ['Right drag'], action: 'Look around' },
      { keys: ['W', 'A', 'S', 'D'], action: 'Fly forward, left, back, right' },
      { keys: ['E', 'Q'], action: 'Fly up, down' },
      { keys: ['Shift'], action: 'Hold to fly slower' },
      { keys: ['Middle drag'], action: 'Pan' },
      { keys: ['Wheel'], action: 'Move in and out' },
    ],
  },
};

const TOOL_KEYS: Section = {
  title: 'Point and Connect tools',
  rows: [
    { keys: ['G', 'R'], action: 'Point: switch the selected point’s gizmo to move or rotate' },
    { keys: ['Enter'], action: 'Point: mount a part on the selected point' },
    { keys: ['Delete'], action: 'Point: delete the selected point' },
    { keys: ['Esc'], action: 'Connect: cancel, then stop placing the armed part' },
  ],
};

/** Keymap groups by command id prefix, in this order. */
const GROUPS: readonly [string, readonly string[]][] = [
  ['Tools', ['tool.']],
  ['Selecting', ['select.', 'mode.']],
  ['Editing', ['edit.', 'transform.']],
  ['View', ['view.']],
  ['File and help', ['file.', 'app.']],
];

/** The current scheme's bindings as sections: one row per command, with all its keys. */
function keymapSections(scheme: Scheme): Section[] {
  const labels = new Map(allCommands().map((c) => [c.id, c.label]));
  const byCommand = new Map<string, string[]>();
  for (const b of KEYMAPS[scheme]) {
    byCommand.set(b.command, [...(byCommand.get(b.command) ?? []), b.keys]);
  }
  return GROUPS.map(([title, prefixes]) => ({
    title,
    rows: [...byCommand]
      .filter(([id]) => prefixes.some((p) => id.startsWith(p)))
      .map(([id, keys]) => ({ keys, action: labels.get(id) ?? id })),
  }));
}

function Keys({ combo }: { combo: string }): JSX.Element {
  const parts = combo.split('+');
  return (
    <span class="combo">
      {parts.map((k, i) => (
        <Fragment key={i}>
          {i > 0 && '+'}
          <kbd>{k}</kbd>
        </Fragment>
      ))}
    </span>
  );
}

function SectionView({ section }: { section: Section }): JSX.Element {
  return (
    <section class="shortcut-section">
      <h3>{section.title}</h3>
      {section.note && <p class="muted">{section.note}</p>}
      <dl>
        {section.rows.map((row, r) => (
          <div class="shortcut-row" key={r}>
            <dt>
              {row.keys.map((k, i) => (
                <Fragment key={k}>
                  {i > 0 && <span class="muted"> / </span>}
                  <Keys combo={k} />
                </Fragment>
              ))}
            </dt>
            <dd>{row.action}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): JSX.Element | null {
  const scheme = settingsSig.value.cameraScheme;
  const sections = [...keymapSections(scheme), MODAL, TOOL_KEYS, MOUSE, CAMERA[scheme]];
  return (
    <Dialog
      title={`Keyboard shortcuts (${scheme === 'blender' ? 'Blender' : 'Studio'} controls)`}
      open={open}
      onClose={onClose}
    >
      <div class="shortcuts">
        {sections.map((s) => (
          <SectionView key={s.title} section={s} />
        ))}
      </div>
    </Dialog>
  );
}
