// The command registry (spec §13.10): every action keys, menus, the palette and the context menu run.
// Commands register when this module loads.
import { component, poseDescendants } from '../core/graph';
import { detach } from '../core/ops/conns';
import { duplicate } from '../core/ops/clipboard';
import { makeFreeMovable, nativeRotate, topmost } from '../core/ops/move';
import { deleteParts } from '../core/ops/parts';
import type { PartId } from '../core/types';
import { closePicker, pickerSig } from '../tools/connect';
import { setTool, toolSig, type ToolId } from '../tools/manager';
import { startModal } from '../tools/modal';
import { requestPointDelete } from '../tools/point';
import { boxNextSig } from '../tools/select';
import { getViewport } from '../viewport/context';
import { pickPart } from '../viewport/raycast';
import { copySelection, pasteFromClipboard } from './clipboard';
import { posesSig } from './derived';
import {
  clearSelection,
  hiddenSig,
  invertSelection,
  select,
  selectionSig,
  selectModeSig,
} from './selection';
import { settingsSig, updateSettings } from './settings';
import { surfaceSig } from './surfaces';
import { catalogSig, commit, docSig, redo, undo, viewBus } from './store';
import { toast } from './toasts';
import { openDialog } from './ui';
import { editingReferencePlaneSig, referencePlaneModeSig } from './references';

export interface Command {
  readonly id: string;
  readonly label: string;
  run(): void;
  enabled?(): boolean;
}

const commands = new Map<string, Command>();

export function registerCommand(c: Command): void {
  commands.set(c.id, c);
}

/** Runs a command; false when it is unknown or disabled. */
export function runCommand(id: string): boolean {
  const c = commands.get(id);
  if (!c || (c.enabled && !c.enabled())) return false;
  c.run();
  return true;
}

export function allCommands(): readonly Command[] {
  return [...commands.values()];
}

export function hasCommand(id: string): boolean {
  return commands.has(id);
}

const parts = (n: number) => `${n} ${n === 1 ? 'part' : 'parts'}`;
/** The selected parts in export order. */
const selected = (): PartId[] => {
  const doc = docSig.value;
  return doc.order.filter((id) => selectionSig.value.parts.has(id));
};
const anySelected = () => selectionSig.value.parts.size > 0;
/** One ephemeral point and no part: G and R move or turn the point. */
const onePoint = () => selectionSig.value.parts.size === 0 && selectionSig.value.points.size === 1;
/** The Surface tool's chosen corners, which G moves. */
const cornersChosen = () => toolSig.value === 'surface' && surfaceSig.value.selected.length > 0;
const anyParts = () => docSig.value.order.length > 0;

/** The part under the pointer in the viewport, for L and Ctrl+L. */
function partUnderPointer(): PartId | null {
  const vp = getViewport();
  if (!vp?.pointer) return null;
  return pickPart(vp.ndc({ clientX: vp.pointer.x, clientY: vp.pointer.y }))?.part ?? null;
}

const TOOLS: readonly [ToolId, string][] = [
  ['select', 'Select tool'],
  ['move', 'Move tool'],
  ['rotate', 'Rotate tool'],
  ['connect', 'Connect tool'],
  ['point', 'Point tool'],
  ['paint', 'Paint tool'],
  ['sockets', 'Socket Workbench'],
];
for (const [tool, label] of TOOLS) {
  registerCommand({
    id: `tool.${tool}`,
    label,
    run: () => {
      setTool(tool);
      if (editingReferencePlaneSig.peek() !== null) {
        referencePlaneModeSig.value =
          tool === 'move' ? 'translate' : tool === 'rotate' ? 'rotate' : null;
        if (!['select', 'move', 'rotate'].includes(tool)) editingReferencePlaneSig.value = null;
      }
    },
  });
}

registerCommand({
  id: 'mode.toggle',
  label: 'Toggle Part / Part + attached',
  run: () => {
    selectModeSig.value = selectModeSig.value === 'part' ? 'attached' : 'part';
  },
});

// Selection
registerCommand({
  id: 'select.all',
  label: 'Select all',
  enabled: anyParts,
  run: () => select(docSig.value.order, 'replace'),
});
registerCommand({ id: 'select.none', label: 'Select none', run: clearSelection });
registerCommand({
  id: 'select.invert',
  label: 'Invert selection',
  enabled: anyParts,
  run: invertSelection,
});
registerCommand({
  id: 'select.box',
  label: 'Box select',
  run: () => {
    setTool('select');
    boxNextSig.value = true;
  },
});
registerCommand({
  id: 'select.linked',
  label: 'Select the attached branch under the cursor',
  run: () => {
    const hit = partUnderPointer();
    if (hit !== null) select([hit, ...poseDescendants(docSig.value, hit)], 'add');
  },
});
registerCommand({
  id: 'select.connected',
  label: 'Select everything joined to the part under the cursor',
  run: () => {
    const hit = partUnderPointer();
    if (hit !== null)
      select(
        component(docSig.value, hit, () => true),
        'add',
      );
  },
});
registerCommand({
  id: 'select.similarType',
  label: 'Select similar: same type',
  enabled: anySelected,
  run: () => {
    const doc = docSig.value;
    const types = new Set(selected().map((id) => doc.parts.get(id)!.type));
    select(
      doc.order.filter((id) => types.has(doc.parts.get(id)!.type)),
      'replace',
    );
  },
});
registerCommand({
  id: 'select.similarColor',
  label: 'Select similar: same color',
  enabled: anySelected,
  run: () => {
    const doc = docSig.value;
    const colorOf = (id: PartId) => JSON.stringify(doc.parts.get(id)!.props.RGB ?? null);
    const colors = new Set(selected().map(colorOf));
    select(
      doc.order.filter((id) => colors.has(colorOf(id))),
      'replace',
    );
  },
});

// Editing
registerCommand({
  id: 'edit.delete',
  label: 'Delete',
  enabled: () => anySelected() || selectionSig.value.points.size > 0,
  run: () => {
    const ids = selected();
    if (ids.length === 0) {
      // Only points are selected: delete one at a time, asking when a part hangs from it.
      const key = [...selectionSig.value.points][0];
      const at = key.indexOf(':');
      requestPointDelete(Number(key.slice(0, at)), key.slice(at + 1));
      return;
    }
    commit(`Delete ${parts(ids.length)}`, (d) => {
      deleteParts(d, ids, posesSig.value);
    });
  },
});
registerCommand({
  id: 'edit.duplicate',
  label: 'Duplicate',
  enabled: anySelected,
  run: () => {
    const cat = catalogSig.value;
    if (!cat) return;
    const ids = selected();
    let copies: PartId[] = [];
    commit(`Duplicate ${parts(ids.length)}`, (d) => {
      copies = duplicate(d, cat, cat.conventions, posesSig.value, ids);
    });
    select(copies, 'replace');
    // The copies sit on the originals; in the Blender scheme they follow the mouse at once, as there.
    if (settingsSig.value.cameraScheme === 'blender') startModal('move');
  },
});
registerCommand({
  id: 'edit.copy',
  label: 'Copy',
  enabled: anySelected,
  run: () => void copySelection(),
});
registerCommand({ id: 'edit.paste', label: 'Paste', run: () => void pasteFromClipboard() });
registerCommand({ id: 'edit.undo', label: 'Undo', run: undo });
registerCommand({ id: 'edit.redo', label: 'Redo', run: redo });
registerCommand({
  id: 'edit.detach',
  label: 'Detach from parent',
  enabled: anySelected,
  run: () => {
    const ids = selected();
    commit(`Detach ${parts(ids.length)}`, (d) => {
      for (const id of ids) detach(d, id, posesSig.value);
    });
  },
});
registerCommand({
  id: 'edit.makeFree',
  label: 'Make free (mount on a point)',
  enabled: anySelected,
  run: () => {
    const cat = catalogSig.value;
    if (!cat) return;
    const ids = topmost(docSig.value, selected());
    const refused: string[] = [];
    commit(`Free ${parts(ids.length)}`, (d) => {
      for (const id of ids) {
        const r = makeFreeMovable(d, cat, cat.conventions, posesSig.value, id);
        if (!r.ok) refused.push(r.reason);
      }
    });
    if (refused.length > 0) toast(refused.join('\n'), 'warn');
  },
});

// View
registerCommand({
  id: 'view.toggleVisibility',
  label: 'Toggle selected visibility',
  enabled: anySelected,
  run: () => {
    const ids = selected();
    const hidden = new Set(hiddenSig.value);
    const show = ids.some((id) => hidden.has(id));
    for (const id of ids) {
      if (show) hidden.delete(id);
      else hidden.add(id);
    }
    hiddenSig.value = hidden;
  },
});
registerCommand({
  id: 'view.hide',
  label: 'Hide selected',
  enabled: anySelected,
  run: () => {
    hiddenSig.value = new Set([...hiddenSig.value, ...selected()]);
    clearSelection();
  },
});
registerCommand({
  id: 'view.hideAll',
  label: 'Hide all',
  enabled: anyParts,
  run: () => {
    hiddenSig.value = new Set(docSig.peek().order);
  },
});
registerCommand({
  id: 'view.unhide',
  label: 'Show all',
  enabled: () => hiddenSig.value.size > 0,
  run: () => {
    hiddenSig.value = new Set();
  },
});
registerCommand({
  id: 'view.isolate',
  label: 'Isolate selected',
  enabled: anySelected,
  run: () => {
    const keep = selectionSig.value.parts;
    hiddenSig.value = new Set(docSig.value.order.filter((id) => !keep.has(id)));
  },
});
registerCommand({
  id: 'view.frameSelected',
  label: 'Frame selection',
  run: () => viewBus.emit({ kind: 'frame-selection' }),
});
registerCommand({
  id: 'view.frameAll',
  label: 'Frame all',
  run: () => viewBus.emit({ kind: 'frame-all' }),
});
const VIEWS = [
  ['front', 'Front view'],
  ['back', 'Back view'],
  ['right', 'Right view'],
  ['left', 'Left view'],
  ['top', 'Top view'],
  ['bottom', 'Bottom view'],
] as const;
for (const [axis, label] of VIEWS) {
  registerCommand({ id: `view.${axis}`, label, run: () => viewBus.emit({ kind: 'view', axis }) });
}
registerCommand({
  id: 'view.flip',
  label: 'View from the opposite side',
  run: () => viewBus.emit({ kind: 'flip-view' }),
});
registerCommand({
  id: 'view.ortho',
  label: 'Toggle orthographic',
  run: () => viewBus.emit({ kind: 'toggle-ortho' }),
});
registerCommand({
  id: 'view.xray',
  label: 'Toggle X-ray box select',
  run: () => updateSettings({ xray: !settingsSig.value.xray }),
});

// Transform
registerCommand({
  id: 'transform.grab',
  label: 'Move (G)',
  enabled: () => anySelected() || onePoint() || cornersChosen(),
  run: () => void startModal('move'),
});
registerCommand({
  id: 'transform.rotate',
  label: 'Rotate (R)',
  enabled: () => anySelected() || onePoint(),
  run: () => void startModal('rotate'),
});
for (const [axis, label] of [
  ['Y', 'Turn 90° about Y'],
  ['X', 'Turn 90° about X'],
] as const) {
  registerCommand({
    id: `transform.rot${axis}90`,
    label,
    enabled: anySelected,
    run: () => {
      const cat = catalogSig.value;
      if (!cat) return;
      const poses = posesSig.value;
      const ids = topmost(docSig.value, selected());
      commit(`Rotate ${parts(ids.length)}`, (d) => {
        for (const id of ids) nativeRotate(d, cat, cat.conventions, poses, id, axis, 90);
      });
    },
  });
}

// File and app
registerCommand({ id: 'file.save', label: 'Save to library', run: () => openDialog('save') });
registerCommand({
  id: 'file.saveSelection',
  label: 'Save selection to library',
  enabled: anySelected,
  run: () => openDialog('save-selection'),
});
registerCommand({ id: 'file.library', label: 'Open library', run: () => openDialog('library') });
registerCommand({ id: 'file.import', label: 'Import code', run: () => openDialog('import') });
registerCommand({ id: 'file.new', label: 'New blueprint', run: () => openDialog('new') });
registerCommand({ id: 'file.export', label: 'Export code', run: () => openDialog('export') });
registerCommand({
  id: 'app.palette',
  label: 'Command palette',
  run: () => openDialog('palette'),
});
registerCommand({
  id: 'app.shortcuts',
  label: 'Help & controls',
  run: () => openDialog('shortcuts'),
});
registerCommand({
  id: 'app.cancel',
  label: 'Cancel',
  run: () => {
    // Tools cancel their own operations first (their keys run before commands).
    if (pickerSig.value) closePicker();
    else if (settingsSig.value.cameraScheme === 'studio') clearSelection();
  },
});
