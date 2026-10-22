// @vitest-environment jsdom
import {
  DEFAULT_SETTINGS,
  sanitizeSettings,
  settingsSig,
  updateSettings,
} from '../../src/state/settings';

test('settings default and persist', () => {
  expect(DEFAULT_SETTINGS.limits).toEqual({
    codeChars: 8_000_000,
    partSoftCap: 8_000,
    partWarn: 16_000,
  });
  updateSettings({ cameraScheme: 'studio' });
  expect(settingsSig.value.cameraScheme).toBe('studio');
  expect(JSON.parse(localStorage.getItem('grambyedit:settings')!).cameraScheme).toBe('studio');
});
test('stored settings of the wrong shape fall back to the defaults key by key', () => {
  const s = sanitizeSettings({
    cameraScheme: 'studio',
    flySpeed: 'fast',
    activeColor: [1, 2],
    limits: { codeChars: 100, partWarn: -5 },
    junk: 1,
  });
  expect(s.cameraScheme).toBe('studio');
  expect(s.flySpeed).toBe(DEFAULT_SETTINGS.flySpeed);
  expect(s.activeColor).toEqual(DEFAULT_SETTINGS.activeColor);
  expect(s.limits).toEqual({ codeChars: 100, partSoftCap: 8_000, partWarn: 16_000 });
  expect('junk' in s).toBe(false);
  expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
});
