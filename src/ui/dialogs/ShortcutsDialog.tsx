// The keyboard and mouse guide (View → Keyboard shortcuts, or ?). It lists only bindings that work.
import { Fragment, type JSX } from 'preact';
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

const TRANSFORM: Section = {
  title: 'Move and rotate',
  note: 'With parts selected, in any tool but Sockets.',
  rows: [
    { keys: ['G'], action: 'Move: the parts follow the mouse' },
    { keys: ['R'], action: 'Rotate: the parts turn with the mouse around the pivot' },
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

const TOOLS: Section = {
  title: 'Tools',
  rows: [
    { keys: ['1'], action: 'Select' },
    { keys: ['2'], action: 'Move: drag the gizmo, or drag a part onto a socket or surface' },
    { keys: ['3'], action: 'Rotate: drag the gizmo rings' },
    { keys: ['4'], action: 'Connect: add parts on sockets and points, join sockets' },
    { keys: ['5'], action: 'Point: add connection points on part surfaces' },
    { keys: ['6'], action: 'Paint' },
    { keys: ['Esc'], action: 'Cancel a gizmo drag or a part drag' },
  ],
};

const SELECT: Section = {
  title: 'Selecting',
  rows: [
    { keys: ['Click'], action: 'Select a part' },
    { keys: ['Shift+Click'], action: 'Add or remove a part' },
    { keys: ['Ctrl+Click'], action: 'Remove a part' },
    { keys: ['Drag'], action: 'Box select (from empty space)' },
    { keys: ['L'], action: 'Add the part under the cursor and everything attached to it' },
    { keys: ['Ctrl+L'], action: 'Add everything joined to the part under the cursor' },
  ],
};

const CONNECT: Section = {
  title: 'Connect and Point tools',
  rows: [
    { keys: ['Click'], action: 'Connect: pick a part for a free socket or point' },
    {
      keys: ['Shift+Click'],
      action: 'Connect: gather several sockets, then click to fill them all',
    },
    { keys: ['Drag'], action: 'Connect: drag from a socket to another to join them' },
    { keys: ['Esc'], action: 'Connect: cancel, or stop placing the armed part' },
    { keys: ['Click'], action: 'Point: add a point on a part surface, or select one' },
    { keys: ['G', 'R'], action: 'Point: switch the point’s gizmo to move or rotate' },
    { keys: ['Enter'], action: 'Point: mount a part on the selected point' },
    { keys: ['Delete'], action: 'Point: delete the selected point' },
  ],
};

const CAMERA_BLENDER: Section = {
  title: 'Camera: Blender controls',
  rows: [
    { keys: ['Middle drag'], action: 'Orbit' },
    { keys: ['Shift+Middle drag'], action: 'Pan' },
    { keys: ['Wheel'], action: 'Zoom to the cursor' },
    { keys: ['Alt+Left drag'], action: 'Orbit, with “Emulate 3-button mouse” on in Settings' },
    { keys: ['Numpad 1', 'Numpad 3', 'Numpad 7'], action: 'Front, right, top view' },
    { keys: ['Numpad 9'], action: 'Look from the opposite side' },
    { keys: ['Numpad 5'], action: 'Perspective or orthographic' },
    { keys: ['Numpad .'], action: 'Frame the selection' },
    { keys: ['Home'], action: 'Frame everything' },
  ],
};

const CAMERA_STUDIO: Section = {
  title: 'Camera: Studio controls',
  rows: [
    { keys: ['Right drag'], action: 'Look around' },
    { keys: ['W', 'A', 'S', 'D'], action: 'Fly forward, left, back, right' },
    { keys: ['E', 'Q'], action: 'Fly up, down' },
    { keys: ['Shift'], action: 'Hold to fly slower' },
    { keys: ['Middle drag'], action: 'Pan' },
    { keys: ['Wheel'], action: 'Move in and out' },
    { keys: ['F'], action: 'Focus the selection' },
  ],
};

const FILE: Section = {
  title: 'Build',
  rows: [
    { keys: ['Ctrl+Z'], action: 'Undo' },
    { keys: ['Ctrl+Shift+Z', 'Ctrl+Y'], action: 'Redo' },
    { keys: ['Ctrl+O'], action: 'Import a share code' },
    { keys: ['Ctrl+E'], action: 'Export the build' },
    { keys: ['?'], action: 'This guide' },
  ],
};

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
        {section.rows.map((row) => (
          <div class="shortcut-row" key={row.action}>
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
  const studio = settingsSig.value.cameraScheme === 'studio';
  // The camera scheme in use comes first; the other is there for reference.
  const cameras = studio ? [CAMERA_STUDIO, CAMERA_BLENDER] : [CAMERA_BLENDER, CAMERA_STUDIO];
  return (
    <Dialog title="Keyboard shortcuts" open={open} onClose={onClose}>
      <div class="shortcuts">
        {[TRANSFORM, TOOLS, SELECT, CONNECT, cameras[0], FILE, cameras[1]].map((s) => (
          <SectionView key={s.title} section={s} />
        ))}
      </div>
    </Dialog>
  );
}
