import { signal } from '@preact/signals';
import { DEFAULT_LIMITS, type Limits, type RGB } from '../core/types';
import { loadPref, savePref } from '../storage/prefs';

export interface Settings {
  cameraScheme: 'blender' | 'studio';
  emulate3Button: boolean;
  invertY: boolean;
  orbitSensitivity: number;
  flySpeed: number;
  theme: 'dark' | 'light';
  limits: Limits;
  snapMove: number;
  snapRotate: number;
  /** Snapped moves land on the world grid instead of going whole steps from where they start. */
  snapToGrid: boolean;
  autoColor: boolean;
  activeColor: RGB;
  maxSockets: number;
  shiftSocketEnlargement: number;
  genPosDecimals: number;
  genRotDecimals: number;
  xray: boolean;
  desaturateApprox: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  cameraScheme: 'blender',
  emulate3Button: false,
  invertY: false,
  orbitSensitivity: 1,
  flySpeed: 16,
  theme: 'dark',
  limits: DEFAULT_LIMITS,
  snapMove: 0.25,
  snapRotate: 15,
  snapToGrid: false,
  autoColor: false,
  activeColor: [163, 162, 165],
  maxSockets: 3000,
  shiftSocketEnlargement: 100,
  genPosDecimals: 4,
  genRotDecimals: 5,
  xray: false,
  desaturateApprox: true,
};

const ENUMS: Partial<Record<keyof Settings, readonly string[]>> = {
  cameraScheme: ['blender', 'studio'],
  theme: ['dark', 'light'],
};

export interface NumberRange {
  readonly min: number;
  readonly max?: number;
  readonly integer?: boolean;
}

/** Valid numbers per setting; the Settings dialog enforces the same ranges. */
export const NUMBER_RANGES = {
  orbitSensitivity: { min: 0.1 },
  flySpeed: { min: 1 },
  snapMove: { min: 0.01 },
  snapRotate: { min: 0.1 },
  maxSockets: { min: 1, integer: true },
  shiftSocketEnlargement: { min: 0, max: 400 },
  genPosDecimals: { min: 0, max: 10, integer: true },
  genRotDecimals: { min: 0, max: 10, integer: true },
} as const satisfies Partial<Record<keyof Settings, NumberRange>>;

/** Each limit is a whole number of at least 1. */
export const LIMIT_RANGE: NumberRange = { min: 1, integer: true };

export const inRange = (v: unknown, r: NumberRange): v is number =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v >= r.min &&
  (r.max === undefined || v <= r.max) &&
  (!r.integer || Number.isInteger(v));

const isRgb = (v: unknown): v is RGB =>
  Array.isArray(v) && v.length === 3 && v.every((c) => Number.isInteger(c) && c >= 0 && c <= 255);

/** Stored settings are untrusted: each key falls back to its default on a bad shape or range. */
export function sanitizeSettings(stored: unknown): Settings {
  const src = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<
    string,
    unknown
  >;
  const out = { ...DEFAULT_SETTINGS } as Record<keyof Settings, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = src[key];
    const def = DEFAULT_SETTINGS[key];
    if (key === 'limits') {
      const l = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
      const pick = (k: keyof Limits) => (inRange(l[k], LIMIT_RANGE) ? l[k] : DEFAULT_LIMITS[k]);
      out.limits = {
        codeChars: pick('codeChars'),
        partSoftCap: pick('partSoftCap'),
        partWarn: pick('partWarn'),
      };
    } else if (key === 'activeColor') {
      if (isRgb(v)) out.activeColor = v;
    } else if (ENUMS[key]) {
      if (ENUMS[key]!.includes(v as string)) out[key] = v;
    } else if (typeof def === 'number') {
      const range: NumberRange = (NUMBER_RANGES as Partial<Record<keyof Settings, NumberRange>>)[
        key
      ] ?? { min: -Infinity };
      if (inRange(v, range)) out[key] = v;
    } else if (typeof v === typeof def) {
      out[key] = v;
    }
  }
  return out as unknown as Settings;
}

export const settingsSig = signal<Settings>(sanitizeSettings(loadPref<unknown>('settings', {})));

/** Applies and persists a partial update. */
export function updateSettings(patch: Partial<Settings>): void {
  settingsSig.value = sanitizeSettings({ ...settingsSig.value, ...patch });
  savePref('settings', settingsSig.value);
}
