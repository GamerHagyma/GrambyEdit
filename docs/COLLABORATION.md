# Collaborative workspaces

Open **Collaboration** in the top bar to host the current blueprint or join an invitation. Names and camera colors are editable. The host approves each connection, assigns viewer/editor access, and can change permissions or remove guests. Invitations do not grant editing without approval. Treat invite links as private.

## What is shared

Parts, properties, connection points, connections, document order and editor root positions are shared. Colored camera models and name tags show where other members are looking. Camera models never enter the blueprint, picking or export.

Selection, reference images, tool previews, servo simulation poses, preferences and creation libraries remain local. Committing a normal blueprint property change does sync it. The host and guests must use matching catalog/socket geometry; mismatched connections are rejected, and changing geometry during a room ends the connection.

New/Open requires leaving the room before replacing the entire blueprint. Inserting parts and exporting are available while editing. Viewers can inspect, navigate and export but cannot change the shared document. Permission checks run both at the document store and at the host accepting guest edits.

## Synchronization and traffic

- WebRTC connections form a star around the host. Guests send edits to the host, which orders them and forwards accepted changes. No blueprint traffic passes through GitHub Pages or the signaling service. TURN, when configured and required, relays the WebRTC traffic.
- Messages contain changed fields rather than whole documents. Local guest bursts are coalesced for 30 ms, keeping the final value of repeatedly edited fields. Host updates are batched over the same interval. Local edits appear immediately and pending intents are reapplied over incoming authoritative changes.
- Independent properties and point UUIDs merge. Concurrent edits to the same field resolve in host acceptance order. Connections on one part and explicit document order changes are atomic fields. This is host ordering with optimistic clients, not a general CRDT.
- Each member receives a separate ID range so simultaneous insertion cannot collide. Undo/redo uses per-user conditional inverses; fields changed since the original edit are skipped rather than overwritten. Deleted-part restoration also checks deletion ownership. The History tab is informational during a room; it cannot rewind the shared timeline.
- Every 15 seconds the host sends a revision and 64-bit semantic digest. Matching builds do not reinstall or download anything. Missing recent revisions are replayed from a bounded journal (256 revisions / 4 MiB of serialized text); a full repair snapshot is sent when replay is unavailable or hashes disagree. Lost repair requests can be retried.
- Full snapshots are sent on joining and desync repair. Identical snapshots are not reinstalled. Snapshots over 16 KiB use native gzip when it saves enough bandwidth. Reliable ordered framing splits large messages into chunks, bounds queued work, and waits for WebRTC buffer space.
- Camera poses are quantized and sent at most 10 times per second while changing. Presence uses the latest pose under backpressure and interpolates on screen. A stationary camera sends nothing.

The panel's **Network activity** reports application-message bytes and received repair snapshots. It excludes WebRTC packet headers, encryption, connectivity checks and signaling heartbeats. It is a debugging aid, not a measurement of total internet usage.

## Hosting and connection settings

The static GitHub Pages deployment needs no editing backend. PeerJS is loaded only when starting or joining a room. The default public PeerJS Cloud service exchanges signaling information; Google STUN assists direct connectivity. These are external services and can be unavailable independently of the editor.

Under **Connection settings**, supply an HTTPS PeerServer URL to use your own signaling service. Localhost HTTP is accepted for local testing. The signaling URL is included in generated invitations so guests use the same service.

Restrictive networks may need TURN. Supply a JSON array of `RTCIceServer` entries in **ICE servers (JSON)** on each participating browser that needs them. For example, using credentials issued by your own relay service:

```json
[
  { "urls": "stun:stun.example.com:3478" },
  {
    "urls": "turns:turn.example.com:5349",
    "username": "YOUR_TEMPORARY_USERNAME",
    "credential": "YOUR_TEMPORARY_CREDENTIAL"
  }
]
```

No TURN service or relay credentials are bundled. Custom connection settings stay in memory while the dialog is open; credentials are never saved to preferences or invitations. Name and color preferences are saved locally.

## Session limits and recovery

- Eight people total, including the host; documents up to 32,000 parts and 16 MiB per uncompressed UTF-8 snapshot. Oversized or malformed messages terminate the affected connection with an error.
- The host must keep the page open. Closing it ends the room; guests keep their latest local copy and can export it. There is no automatic host migration, durable room storage or offline edit merging.
- Lost signaling connections attempt to reconnect while existing WebRTC links remain active. If a data connection fails, join again and ask for approval; a fresh snapshot replaces the local workspace.
- A graceful departure flushes pending edits before closing. Abrupt browser or network failure can lose unacknowledged edits, so export important work as usual.

Pure protocol/store/transport tests cover convergence, validation, permissions, identifier allocation, conditional undo, batching, replay and snapshot repair. Real-browser checks also exercise the public signaling service and independent WebRTC connections, including concurrent edits, camera presence, viewer denial, deliberate corruption repair and host departure.
