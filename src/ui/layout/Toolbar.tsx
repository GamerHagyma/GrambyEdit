import type { JSX } from 'preact';
import { selectModeSig } from '../../state/selection';
import {
  inRange,
  NUMBER_RANGES,
  settingsSig,
  updateSettings,
  type NumberRange,
} from '../../state/settings';
import { toast } from '../../state/toasts';
import { keysFor } from '../../state/keymap';
import { setTool, toolSig, type ToolId } from '../../tools/manager';
import {
  pivotModeSig,
  setPivotMode,
  setSpace,
  spaceSig,
  type PivotMode,
  type Space,
} from '../../tools/transform';
import { Icon, type IconName } from '../icons';

const TOOLS: readonly { id: ToolId; label: string; icon: IconName }[] = [
  { id: 'select', label: 'Select', icon: 'select' },
  { id: 'move', label: 'Move', icon: 'move' },
  { id: 'rotate', label: 'Rotate', icon: 'rotate' },
  { id: 'connect', label: 'Connect', icon: 'connect' },
  { id: 'point', label: 'Point', icon: 'point' },
  { id: 'paint', label: 'Paint', icon: 'paint' },
  { id: 'sockets', label: 'Sockets (capture socket positions)', icon: 'sockets' },
];

/** A snap step: commits on Enter or blur; a value out of range is refused and put back. */
function StepInput({
  label,
  unit,
  value,
  range,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number;
  range: NumberRange;
  onCommit(v: number): void;
}): JSX.Element {
  return (
    <label class="snap-step" title={`${label} (hold Ctrl while moving or rotating to snap)`}>
      <span class="visually-hidden">{label}</span>
      <input
        type="number"
        min={range.min}
        step="any"
        value={value}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onChange={(e) => {
          const v = Number(e.currentTarget.value);
          if (e.currentTarget.value.trim() !== '' && inRange(v, range)) onCommit(v);
          else {
            toast(`${label}: enter a number of at least ${range.min}.`, 'warn');
            e.currentTarget.value = String(value);
          }
        }}
      />
      <span class="muted">{unit}</span>
    </label>
  );
}

const hex = (rgb: readonly number[]) =>
  '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');

/** Tools, the selection mode, snap steps, auto-color and the camera scheme (spec §12, §17). */
export function Toolbar(): JSX.Element {
  const s = settingsSig.value;
  return (
    <div class="toolbar" role="toolbar" aria-label="Tools">
      {TOOLS.map((t) => {
        const key = keysFor(`tool.${t.id}`, s.cameraScheme)[0];
        return (
          <button
            key={t.id}
            class="icon-button"
            aria-label={t.label}
            title={key ? `${t.label} (${key})` : t.label}
            aria-pressed={toolSig.value === t.id}
            onClick={() => setTool(t.id)}
          >
            <Icon name={t.icon} />
          </button>
        );
      })}
      {(toolSig.value === 'move' || toolSig.value === 'rotate') && (
        <>
          <label class="scheme">
            <span class="visually-hidden">Transform space</span>
            <select
              value={spaceSig.value}
              onChange={(e) => setSpace(e.currentTarget.value as Space)}
            >
              <option value="world">World</option>
              <option value="local">Local</option>
            </select>
          </label>
          <label class="scheme">
            <span class="visually-hidden">Pivot</span>
            <select
              value={pivotModeSig.value}
              onChange={(e) => setPivotMode(e.currentTarget.value as PivotMode)}
            >
              <option value="median">Median point</option>
              <option value="active">Active part</option>
              <option value="individual">Individual origins</option>
            </select>
          </label>
        </>
      )}
      <span class="sep" />
      <div class="segmented" role="group" aria-label="Selection mode">
        <button
          aria-pressed={selectModeSig.value === 'part'}
          onClick={() => (selectModeSig.value = 'part')}
        >
          Part
        </button>
        <button
          aria-pressed={selectModeSig.value === 'attached'}
          onClick={() => (selectModeSig.value = 'attached')}
        >
          Part + attached
        </button>
      </div>
      <span class="sep" />
      <div class="snap-steps" role="group" aria-label="Snap steps">
        <span class="muted">Snap</span>
        <StepInput
          label="Move snap step in studs"
          unit="studs"
          value={s.snapMove}
          range={NUMBER_RANGES.snapMove}
          onCommit={(v) => updateSettings({ snapMove: v })}
        />
        <StepInput
          label="Rotate snap step in degrees"
          unit="°"
          value={s.snapRotate}
          range={NUMBER_RANGES.snapRotate}
          onCommit={(v) => updateSettings({ snapRotate: v })}
        />
      </div>
      <span class="sep" />
      <button
        class="icon-button"
        aria-label="Auto-color new parts"
        title={`Auto-color new parts with ${hex(s.activeColor)}`}
        aria-pressed={s.autoColor}
        onClick={() => updateSettings({ autoColor: !s.autoColor })}
      >
        <span class="swatch" style={{ background: hex(s.activeColor) }} />
      </button>
      <label class="scheme">
        <span class="visually-hidden">Camera controls</span>
        <select
          value={s.cameraScheme}
          onChange={(e) =>
            updateSettings({
              cameraScheme: (e.currentTarget as HTMLSelectElement).value as 'blender' | 'studio',
            })
          }
        >
          <option value="blender">Blender</option>
          <option value="studio">Studio</option>
        </select>
      </label>
    </div>
  );
}
