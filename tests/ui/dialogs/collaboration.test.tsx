// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/preact';
import { CollaborationDialog } from '../../../src/ui/dialogs/CollaborationDialog';
import {
  roomSig,
  membersSig,
  leaveCollaboration,
  decodeInvite,
  joinCodeSig,
} from '../../../src/state/collaboration';
import { resetStoreForTests } from '../../../src/state/store';
beforeEach(() => {
  resetStoreForTests();
  leaveCollaboration();
  joinCodeSig.value = '';
});
afterEach(() => leaveCollaboration());
test('joining is explicit and connection settings are optional; closing the panel is separate from leaving', () => {
  const close = vi.fn();
  render(<CollaborationDialog open onClose={close} />);
  expect(screen.getByRole('button', { name: 'Host workspace' })).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Join (replace workspace)' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.input(screen.getByLabelText('Room invitation'), { target: { value: 'invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(close).toHaveBeenCalledTimes(1);
});
test('only a host sees approval and role controls', () => {
  roomSig.value = { ...roomSig.value, mode: 'hosting' };
  membersSig.value = [
    { id: 'pending', name: 'Alice', color: '#58a6ff', role: 'viewer', pending: true },
  ];
  render(<CollaborationDialog open onClose={() => {}} />);
  expect(screen.getByRole('button', { name: 'Allow editing for Alice' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Allow viewing for Alice' })).toBeTruthy();
});
test('invite parsing preserves a custom signaling endpoint without placing ICE credentials in the link', () => {
  const code = 'ge1:ge-host:0123456789abcdef0123456789abcdef';
  expect(
    decodeInvite(
      'https://example.com/#' +
        new URLSearchParams({ collab: code, server: 'https://signal.example/peer' }),
    ),
  ).toEqual({
    host: 'ge-host',
    token: '0123456789abcdef0123456789abcdef',
    server: 'https://signal.example/peer',
  });
  expect(() => decodeInvite('javascript:alert(1)')).toThrow();
});
