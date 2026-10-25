import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import {
  approveMember,
  changeMemberRole,
  collabProfileSig,
  currentPeerId,
  joinCodeSig,
  leaveCollaboration,
  membersSig,
  networkStatsSig,
  removeMember,
  roomSig,
  startCollaboration,
  updateCollabProfile,
} from '../../state/collaboration';
import { catalogSig, docSig } from '../../state/store';
import { Dialog } from '../layout/Dialog';
export function CollaborationDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): JSX.Element | null {
  return open ? <RoomBody onClose={onClose} /> : null;
}
function RoomBody({ onClose }: { onClose(): void }): JSX.Element {
  const [name, setName] = useState(collabProfileSig.value.name),
    [color, setColor] = useState(collabProfileSig.value.color),
    [invite, setInvite] = useState(joinCodeSig.value || roomSig.value.invite);
  const [server, setServer] = useState(''),
    [ice, setIce] = useState(''),
    [error, setError] = useState('');
  const room = roomSig.value,
    active = !['offline', 'disconnected'].includes(room.mode),
    hosting = room.mode === 'hosting',
    stats = networkStatsSig.value;
  const perform = async (mode: 'host' | 'join') => {
    setError('');
    try {
      updateCollabProfile({ name, color });
      await startCollaboration(mode, invite, { server, ice });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog
      title="Collaboration"
      open
      onClose={onClose}
      footer={
        <>
          {active && (
            <button class="button" onClick={() => leaveCollaboration()}>
              {hosting ? 'End room' : 'Leave room'}
            </button>
          )}
          <button class="button primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div class="collab-identity">
        <label>
          Your name
          <input
            aria-label="Your name"
            maxLength={48}
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <label>
          Camera color
          <input
            aria-label="Camera color"
            type="color"
            value={color}
            onInput={(e) => setColor(e.currentTarget.value)}
          />
        </label>
        {active && (
          <button
            class="button"
            onClick={() => {
              try {
                updateCollabProfile({ name, color });
                setError('');
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Update identity
          </button>
        )}
      </div>
      {(error || room.error) && <p role="alert">{error || room.error}</p>}
      {!active ? (
        <>
          <p>
            Host your current blueprint, or join someone else's room. The host approves who can view
            or edit.
          </p>
          <button
            class="button primary"
            disabled={!catalogSig.value}
            onClick={() => void perform('host')}
          >
            Host workspace
          </button>
          <label class="collab-field">
            Room invitation
            <textarea
              aria-label="Room invitation"
              rows={3}
              value={invite}
              onInput={(e) => setInvite(e.currentTarget.value)}
              placeholder="Paste the invitation link"
            />
          </label>
          {docSig.value.parts.size > 0 && (
            <p>
              Joining replaces this workspace after the host approves. Save any work you want to
              keep first.
            </p>
          )}
          <button
            class="button"
            disabled={!invite.trim() || !catalogSig.value}
            onClick={() => void perform('join')}
          >
            Join (replace workspace)
          </button>
          <details class="collab-network">
            <summary>Connection settings</summary>
            <p>
              Leave blank for the public signaling service. Custom settings last only while this
              dialog is open. TURN may be needed on restrictive networks.
            </p>
            <label class="collab-field">
              Signaling server URL
              <input
                aria-label="Signaling server URL"
                value={server}
                placeholder="https://your-peer-server.example/"
                onInput={(e) => setServer(e.currentTarget.value)}
              />
            </label>
            <label class="collab-field">
              ICE servers (JSON)
              <textarea
                aria-label="ICE servers (JSON)"
                rows={3}
                value={ice}
                placeholder={'[{"urls":"stun:stun.l.google.com:19302"}]'}
                onInput={(e) => setIce(e.currentTarget.value)}
              />
            </label>
          </details>
        </>
      ) : (
        <>
          <p role="status">
            {room.mode === 'connecting'
              ? 'Connecting to the signaling service…'
              : room.mode === 'waiting'
                ? 'Waiting for the host to approve your connection…'
                : hosting
                  ? 'You are hosting this workspace.'
                  : room.role === 'editor'
                    ? 'Connected — you can edit.'
                    : 'Connected — view only.'}
          </p>
          {hosting && (
            <>
              <label class="collab-field">
                Invite link
                <textarea aria-label="Invite link" rows={3} readOnly value={room.invite} />
              </label>
              <button
                class="button"
                onClick={() => {
                  navigator.clipboard?.writeText(room.invite).then(
                    () => setError(''),
                    () => setError('Could not copy. Select and copy the link above.'),
                  );
                }}
              >
                Copy invite
              </button>
            </>
          )}
          {membersSig.value.length > 0 && (
            <section aria-label="Room permissions">
              <h3>People ({membersSig.value.filter((m) => !m.pending).length}/8)</h3>
              {membersSig.value.map((m) => (
                <div class="collab-member" key={m.id}>
                  <span class="collab-color" style={{ background: m.color }} />
                  <span>
                    {m.name}
                    {m.id === currentPeerId() ? ' (you)' : ''}
                    <small>{m.pending ? 'Waiting for approval' : m.role}</small>
                  </span>
                  {hosting &&
                    m.role !== 'host' &&
                    (m.pending ? (
                      <div class="collab-member-actions">
                        <button class="button" onClick={() => approveMember(m.id, 'editor')}>
                          Allow editing for {m.name}
                        </button>
                        <button class="button" onClick={() => approveMember(m.id, 'viewer')}>
                          Allow viewing for {m.name}
                        </button>
                        <button class="button" onClick={() => removeMember(m.id)}>
                          Decline {m.name}
                        </button>
                      </div>
                    ) : (
                      <>
                        <select
                          aria-label={`Permission for ${m.name}`}
                          value={m.role}
                          onChange={(e) =>
                            changeMemberRole(m.id, e.currentTarget.value as 'viewer' | 'editor')
                          }
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                        <button class="button" onClick={() => removeMember(m.id)}>
                          Remove {m.name}
                        </button>
                      </>
                    ))}
                </div>
              ))}
            </section>
          )}
          <p class="muted">
            The room ends when the host leaves. Everyone keeps their current local copy. New/Open
            require leaving the room; inserting and exporting still work.
          </p>
          <details class="collab-network">
            <summary>Network activity</summary>
            <p>
              Sent {(stats.sent / 1024).toFixed(1)} KiB · Received{' '}
              {(stats.received / 1024).toFixed(1)} KiB · Repair snapshots {stats.snapshots}
            </p>
            <p>
              Only changes and moving cameras are sent. A small consistency check runs every 15
              seconds; a full build is requested only when needed.
            </p>
          </details>
        </>
      )}
    </Dialog>
  );
}
