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
  note: 'Works with parts selected, in any tool but Sockets. In the Surfaces tab, G moves the selected corner.',
  rows: [
    { keys: ['Mouse'], action: 'Move: the parts follow it; rotate: they turn around the pivot' },
    {
      keys: ['X', 'Y', 'Z'],
      action: 'Lock to that axis; press again for the part’s own axis, again to unlock',
    },
    { keys: ['0–9', '.', '-'], action: 'Type an exact distance (studs) or angle (degrees)' },
    {
      keys: ['Ctrl'],
      action: 'Hold to snap to the snap steps; with World grid ticked, moves land on the grid',
    },
    { keys: ['Enter', 'Left click'], action: 'Confirm' },
    { keys: ['Esc', 'Right click'], action: 'Cancel' },
  ],
};

const MOUSE: Section = {
  title: 'Mouse',
  rows: [
    { keys: ['Click'], action: 'Select a part' },
    {
      keys: ['Click'],
      action: 'Select a piece of a Wire, Switch, Button or other multi-piece part',
    },
    { keys: ['Double-click'], action: 'Select the whole multi-piece part' },
    {
      keys: ['Drag'],
      action:
        'Select or Move: drag a part, selected group, or the Move center handle onto a compatible socket. Arrows and planes still transform normally.',
    },
    {
      keys: ['Shift'],
      action:
        'While carrying or dragging: snap only to sockets. Nearby compatible sockets show through surfaces and grow smoothly toward the cursor. Set the enlargement percentage and focus radius in Settings.',
    },
    { keys: ['Shift+Click'], action: 'Add or remove a part' },
    { keys: ['Ctrl+Click'], action: 'Remove a part' },
    { keys: ['Drag'], action: 'Box select from empty space' },
    {
      keys: ['Drag'],
      action:
        'Select/Move: drag a part, piece or selection onto a socket (within 20 px) or surface to re-attach it',
    },
    {
      keys: ['Drag'],
      action:
        'Stack a Wire end on its other end: use its free socket or surface after placing that other end',
    },
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
  title: 'Point, Connect and Sockets tools',
  rows: [
    { keys: ['G', 'R'], action: 'Point: switch the selected point’s gizmo to move or rotate' },
    { keys: ['Enter'], action: 'Point: mount a part on the selected point' },
    { keys: ['Delete'], action: 'Point: delete the selected point' },
    { keys: ['Esc'], action: 'Connect: cancel, then stop placing the armed part' },
    { keys: ['G', 'R'], action: 'Sockets: switch the selected socket’s gizmo to move or rotate' },
    { keys: ['Esc'], action: 'Sockets: deselect the socket' },
  ],
};

const USAGE: readonly Section[] = [
  {
    title: 'Mirroring and radial copies',
    note: 'Mirror settings, guides and previews are local to your browser. Only created parts sync with collaborators.',
    rows: [
      {
        keys: ['Anchor'],
        action:
          'Select a Part or Connector, open the Mirror tab, then Use selected Part / Connector.',
      },
      {
        keys: ['Plane'],
        action:
          'Choose YZ, XZ or XY in the anchor’s axes. Offset it, use Top face, or expand Rotate guide for an arbitrary plane.',
      },
      {
        keys: ['Radial'],
        action: 'Choose Radial, an axis and 2–16 total sectors. The total includes the original.',
      },
      {
        keys: ['Apply'],
        action:
          'Select source parts and Apply to selection. Include attached children copies the branch; the anchor stays in place.',
      },
      {
        keys: ['Placement'],
        action:
          'Enable Repeat new placements to copy parts, pasted builds and generated shapes as you place them. One Undo removes the whole placement.',
      },
      {
        keys: ['Pending'],
        action:
          'With Repeat new placements off, placed parts stay in a pending hologram across selection changes. Apply pending & selection approves them together. Forget pending previews clears that list. The live mirrored cursor appears in both modes.',
      },
      {
        keys: ['Sockets'],
        action:
          'Copies snap to free native sockets only when position and orientation align tightly. Otherwise an ephemeral attachment preserves the intended pose. Search Spinner to find Bearing.',
      },
      {
        keys: ['Visibility'],
        action:
          'Show guide and Preview selection affect only this browser. Clear mirror removes the setup; deleting the anchor or opening another build also clears it.',
      },
    ],
  },
  {
    title: 'Collaborative workspaces',
    rows: [
      {
        keys: ['Host'],
        action:
          'Open Collaborate, choose a name and camera color, then Host workspace and share the invite link.',
      },
      {
        keys: ['Join'],
        action:
          'Save your current build first. Open the invite, click Join (replace workspace), and wait for host approval.',
      },
      {
        keys: ['Permissions'],
        action:
          'The host approves viewers or editors, changes roles and removes people in the Collaboration panel.',
      },
      {
        keys: ['Undo / redo'],
        action:
          'Only your own unchanged edits are undone. The shared History tab is informational.',
      },
      {
        keys: ['G / R'],
        action:
          'Your move or rotation stays active while others edit. It applies to the latest shared pose; deleting its target cancels safely.',
      },
      {
        keys: ['Leave'],
        action:
          'The host must keep the page open. Everyone keeps their latest local copy when the room ends. Leave before New/Open.',
      },
      {
        keys: ['Connection'],
        action:
          'Edits sync in small batches; cameras send only while moving. Consistency checks run every 15 seconds. Connection settings accepts custom signaling and ICE/TURN settings.',
      },
    ],
  },
  {
    title: 'References and building helpers',
    rows: [
      {
        keys: ['Selection'],
        action:
          'Right-click in the viewport or Outliner for Invert selection. Outliner Show all / Hide all affects every part, even with search filters or collapsed rows.',
      },
      {
        keys: ['Projection'],
        action:
          'Use the Perspective / Orthographic toolbar button, View → Toggle orthographic, or Numpad 5. Camera framing stays in place.',
      },
      {
        keys: ['Socket defaults'],
        action:
          'Sockets → Reset all to defaults asks for confirmation and removes all custom socket captures and imported overrides from this browser’s IndexedDB. Export the socket file first to keep a backup.',
      },
      {
        keys: ['Image planes'],
        action:
          'Reference → Insert image plane adds a local plane at the camera focus. Click planes only while the Reference tab is selected. Use the normal Select / Move / Rotate tools (1 / 2 / 3), G / R, or T to resize. S keeps its Studio camera function. Drag the gizmo or use the exact fields. Esc or changing tabs deselects the plane. Planes never enter exports or collaboration. Image links need CORS support; choose a local file if blocked.',
      },
      {
        keys: ['Sockets'],
        action:
          'Orange/red markers indicate mechanical mounts (bearings, servos, doors, suspension). Purple highlights the selection’s attachment target; used sockets fade.',
      },
      {
        keys: ['Unavailable'],
        action:
          'The Parts browser keeps non-spawnable templates in a separate Unavailable category for importing and inspection.',
      },
      {
        keys: ['Reference'],
        action:
          'Paste an image or direct image link, or choose a file. Wheel/buttons zoom; drag pans. Collapse the source controls for more image space.',
      },
      {
        keys: ['Pop out'],
        action:
          'Keep the reference above the editor, drag its title bar to move, and resize from any corner. Dock returns it to the panel. References stay local.',
      },
      {
        keys: ['Servo'],
        action:
          'In Properties, hold red/blue to simulate opposite directions. Sustain makes the buttons toggle. Rotation shows the live angle and is remembered when simulation finishes.',
      },
      {
        keys: ['Export'],
        action:
          'Include servo rotation values controls whether remembered angles appear in the exported build.',
      },
      {
        keys: ['Color'],
        action:
          'Generators and Surfaces have a coloring checkbox. Turn it off to use native default colors.',
      },
      {
        keys: ['New'],
        action:
          'File → New starts an empty blueprint after confirmation. In an empty workspace, double-click a Parts card to place it at the center and focus it.',
      },
    ],
  },
];

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
  const sections = [...USAGE, ...keymapSections(scheme), MODAL, TOOL_KEYS, MOUSE, CAMERA[scheme]];
  return (
    <Dialog
      title={`Help & controls (${scheme === 'blender' ? 'Blender' : 'Studio'})`}
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
