import type { JSX } from 'preact';
import type { Limits, RGB } from '../../core/types';
import {
  LIMIT_RANGE,
  NUMBER_RANGES as R,
  settingsSig,
  updateSettings,
  type Settings,
} from '../../state/settings';
import { toast } from '../../state/toasts';
import { Dialog } from '../layout/Dialog';

const toHex = (rgb: RGB): string => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * A number that commits on blur or Enter. Text that is not a number in range is refused with a
 * message, and the field goes back to the stored value.
 */
function NumberField({
  label,
  value,
  min,
  max,
  integer = false,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  integer?: boolean;
  onCommit(next: number): void;
}): JSX.Element {
  return (
    <label class="field">
      <span>{label}</span>
      <input
        type="number"
        defaultValue={value}
        min={min}
        max={max}
        step={integer ? 1 : 'any'}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const text = e.currentTarget.value.trim();
          const next = Number(text);
          const ok =
            text !== '' &&
            Number.isFinite(next) &&
            next >= min &&
            (max === undefined || next <= max) &&
            (!integer || Number.isInteger(next));
          if (!ok) {
            const range = max === undefined ? `at least ${min}` : `from ${min} to ${max}`;
            toast(`${label}: enter ${integer ? 'a whole number' : 'a number'} ${range}.`, 'warn');
          } else if (next !== value) {
            onCommit(next);
          }
          e.currentTarget.value = String(ok ? next : value);
        }}
      />
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(next: boolean): void;
}): JSX.Element {
  return (
    <label class="field check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/** The settings of spec §13.10, grouped the same way. Every change is saved as it is made. */
export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): JSX.Element | null {
  const s = settingsSig.value;
  const setLimit = (key: keyof Limits, value: number) =>
    updateSettings({ limits: { ...settingsSig.value.limits, [key]: value } });
  const close = () => {
    // A field still being edited commits on blur, and a field that is removed never blurs.
    (document.activeElement as HTMLElement | null)?.blur();
    onClose();
  };

  return (
    <Dialog title="Settings" open={open} onClose={close}>
      <section class="settings-section">
        <h3>Controls</h3>
        <label class="field">
          <span>Camera controls</span>
          <select
            value={s.cameraScheme}
            onChange={(e) =>
              updateSettings({ cameraScheme: e.currentTarget.value as Settings['cameraScheme'] })
            }
          >
            <option value="blender">Blender</option>
            <option value="studio">Studio</option>
          </select>
        </label>
        <Check
          label="Emulate 3-button mouse (Alt + left drag)"
          checked={s.emulate3Button}
          onChange={(v) => updateSettings({ emulate3Button: v })}
        />
        <Check
          label="Invert Y axis"
          checked={s.invertY}
          onChange={(v) => updateSettings({ invertY: v })}
        />
        <NumberField
          label="Orbit sensitivity"
          value={s.orbitSensitivity}
          {...R.orbitSensitivity}
          onCommit={(v) => updateSettings({ orbitSensitivity: v })}
        />
        <NumberField
          label="Fly speed"
          value={s.flySpeed}
          {...R.flySpeed}
          onCommit={(v) => updateSettings({ flySpeed: v })}
        />
      </section>

      <section class="settings-section">
        <h3>Appearance</h3>
        <label class="field">
          <span>Theme</span>
          <select
            value={s.theme}
            onChange={(e) => updateSettings({ theme: e.currentTarget.value as Settings['theme'] })}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <Check
          label="Box-select through hidden parts (X-ray)"
          checked={s.xray}
          onChange={(v) => updateSettings({ xray: v })}
        />
        <Check
          label="Desaturate approximate parts"
          checked={s.desaturateApprox}
          onChange={(v) => updateSettings({ desaturateApprox: v })}
        />
      </section>

      <section class="settings-section">
        <h3>Limits</h3>
        <NumberField
          label="Code limit (characters)"
          value={s.limits.codeChars}
          {...LIMIT_RANGE}
          onCommit={(v) => setLimit('codeChars', v)}
        />
        <NumberField
          label="Part soft cap"
          value={s.limits.partSoftCap}
          {...LIMIT_RANGE}
          onCommit={(v) => setLimit('partSoftCap', v)}
        />
        <NumberField
          label="Part warning"
          value={s.limits.partWarn}
          {...LIMIT_RANGE}
          onCommit={(v) => setLimit('partWarn', v)}
        />
      </section>

      <section class="settings-section">
        <h3>Editing</h3>
        <NumberField
          label="Move snap step (studs, hold Ctrl)"
          value={s.snapMove}
          {...R.snapMove}
          onCommit={(v) => updateSettings({ snapMove: v })}
        />
        <NumberField
          label="Rotate snap step (degrees, hold Ctrl)"
          value={s.snapRotate}
          {...R.snapRotate}
          onCommit={(v) => updateSettings({ snapRotate: v })}
        />
        <Check
          label="Auto-color new parts"
          checked={s.autoColor}
          onChange={(v) => updateSettings({ autoColor: v })}
        />
        <label class="field">
          <span>New part color</span>
          <input
            type="color"
            value={toHex(s.activeColor)}
            onChange={(e) => updateSettings({ activeColor: fromHex(e.currentTarget.value) })}
          />
        </label>
        <NumberField
          label="Max visible sockets"
          value={s.maxSockets}
          {...R.maxSockets}
          onCommit={(v) => updateSettings({ maxSockets: v })}
        />
      </section>

      <section class="settings-section">
        <h3>Numbers</h3>
        <NumberField
          label="Generator position decimals"
          value={s.genPosDecimals}
          {...R.genPosDecimals}
          onCommit={(v) => updateSettings({ genPosDecimals: v })}
        />
        <NumberField
          label="Generator rotation decimals"
          value={s.genRotDecimals}
          {...R.genRotDecimals}
          onCommit={(v) => updateSettings({ genRotDecimals: v })}
        />
      </section>
    </Dialog>
  );
}
