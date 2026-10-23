// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/preact';
import { AboutDialog } from '../../../src/ui/dialogs/AboutDialog';
import { FirstRun } from '../../../src/ui/dialogs/FirstRun';
import { SettingsDialog } from '../../../src/ui/dialogs/SettingsDialog';
import { CREDITS } from '../../../src/ui/credits';
import { settingsSig } from '../../../src/state/settings';
import { docSig, resetStoreForTests } from '../../../src/state/store';

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
});

test('limit edits persist; About credits Mumble Games; first run shows once', () => {
  render(<SettingsDialog open onClose={() => {}} />);
  fireEvent.input(screen.getByLabelText('Code limit (characters)'), {
    target: { value: '9000000' },
  });
  fireEvent.blur(screen.getByLabelText('Code limit (characters)'));
  expect(settingsSig.value.limits.codeChars).toBe(9_000_000);
  render(<AboutDialog open onClose={() => {}} />);
  expect(screen.getByText(CREDITS)).toBeTruthy();
  const first = render(<FirstRun />);
  fireEvent.click(screen.getByText('Start empty'));
  first.unmount();
  const again = render(<FirstRun />);
  expect(again.container.textContent).toBe('');
});

test('an out-of-range limit is refused and the stored value stays', () => {
  render(<SettingsDialog open onClose={() => {}} />);
  const field = screen.getByLabelText('Part soft cap') as HTMLInputElement;
  fireEvent.input(field, { target: { value: '0' } });
  fireEvent.blur(field);
  expect(settingsSig.value.limits.partSoftCap).toBe(8_000);
  expect(field.value).toBe('8000');
});

test('a value typed before Escape is committed', () => {
  const close = vi.fn();
  render(<SettingsDialog open onClose={close} />);
  const field = screen.getByLabelText('Part warning') as HTMLInputElement;
  field.focus();
  fireEvent.input(field, { target: { value: '20000' } });
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(settingsSig.value.limits.partWarn).toBe(20_000);
  expect(close).toHaveBeenCalled();
});

test('load example replaces the build with the first example', () => {
  render(<FirstRun />);
  fireEvent.click(screen.getByText('Load example'));
  expect(docSig.value.order).toHaveLength(4);
  expect(localStorage.getItem('grambyedit:firstRunDone')).toBe('true');
});
