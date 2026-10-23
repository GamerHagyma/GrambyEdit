import type { JSX } from 'preact';
import { selectModeSig } from '../../state/selection';
import { settingsSig, updateSettings } from '../../state/settings';
import { setTool, toolSig, type ToolId } from '../../tools/manager';
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
