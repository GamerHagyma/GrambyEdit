import type { JSX } from 'preact';
import { selectModeSig } from '../../state/selection';
import { settingsSig, updateSettings } from '../../state/settings';
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

const TOOLS: readonly {
  id: ToolId;
  label: string;
  icon: IconName;
  blender: string;
  studio?: string;
}[] = [
  { id: 'select', label: 'Select', icon: 'select', blender: '1', studio: 'Ctrl+1' },
  { id: 'move', label: 'Move', icon: 'move', blender: '2', studio: 'Ctrl+2' },
  { id: 'rotate', label: 'Rotate', icon: 'rotate', blender: '3', studio: 'Ctrl+4' },
  { id: 'connect', label: 'Connect', icon: 'connect', blender: '4' },
  { id: 'point', label: 'Point', icon: 'point', blender: '5' },
  { id: 'paint', label: 'Paint', icon: 'paint', blender: '6' },
  { id: 'sockets', label: 'Sockets (capture socket positions)', icon: 'sockets', blender: '' },
];

const hex = (rgb: readonly number[]) =>
  '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');

/** Tools, the selection mode, auto-color and the camera scheme (spec §12, §17). */
export function Toolbar(): JSX.Element {
  const s = settingsSig.value;
  const studio = s.cameraScheme === 'studio';
  return (
    <div class="toolbar" role="toolbar" aria-label="Tools">
      {TOOLS.map((t) => {
        const key = studio ? t.studio : t.blender;
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
