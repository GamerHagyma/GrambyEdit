# Collaboration implementation plan — inline

User authorizes building now, inline without subagents. No subagents will be used.

Goal: host-led shared blueprint editing, permissions, names/colors/camera presence, minimal traffic and automatic desync repair on the static Pages editor.

Decisions:
- Lazy-load PeerJS1.5.5 for WebRTC/signaling, default free PeerJS Cloud; custom secure PeerServer and ICE/TURN options. No always-on connection outside rooms.
- Host star topology, at most8 members initially. Invite capability plus host approval. Viewer/editor roles enforced at host and local store.
- Field-level compact deltas; coalesce local edits for30ms; local optimistic application, host ordering, rebase pending intents over confirmed updates. Disjoint property edits merge. Host-issued disjoint ID leases prevent simultaneous insertion collisions.
- Reliable ordered channels, bounded chunks and backpressure. Camera changes quantized/throttled at10Hz, latest-only; no traffic for stationary cameras. Periodic15s revision/digest checks; replay recent revisions for gaps, snapshot only on join or verified mismatch. Do not replace identical state. Compress large snapshots when useful.
- Per-user conditional undo/redo preserves fields changed since by others. New/Open requires leaving the room, including for the host, to avoid wiping collaborators' work. Guests retain a local copy on disconnect; rejoining asks approval and catches up from a snapshot.
- Shared data: document including editor root layout. Socket overrides/catalog must match. References, selection, camera position, previews and local settings stay local.

Files/interfaces:
1. core/collaboration/document.ts: validated wire document and field-operation codecs, semantic digest, delta application and conditional inverse. Tests for malformed input, no-op/large docs, stable digests, concurrent fields/add/delete/order and undo guards.
2. core/collaboration/session.ts: pure host/client ordering and optimistic queue over injected send/install functions. Deterministic multi-client tests: concurrent edits/inserts, viewer rejection, stale/duplicate/reordered messages, no-op digest, repair and ownership undo.
3. state/store.ts + core/ops/transact.ts: narrow collaboration adapter for permission gate, allocation, mutation notification, remote install and undo interception. Existing solo behavior remains default.
4. state/collaboration.ts + net/collaboration.ts: room lifecycle, approval/permissions, join/snapshot/chunks, transport cleanup/reconnect/errors, digest timer, profile and camera presence. No credentials persisted. Explicit errors, bounded room/message sizes.
5. ui/dialogs/CollaborationDialog.tsx + App/Shell/ui: Host/Join/invite/name/color/participants/roles/leave and connection controls; visible session status; join confirmation and permission explanation.
6. viewport/collaborators.ts + viewport/index.ts: independent camera models and safe text names, excluded from picking/export; local camera updates only while a room is active.
7. Verify full suite/types/format/build plus real multi-browser WebRTC edit/presence/permissions/disconnect/desync tests. Self-review inline, then commit/publish and verify Pages.

Execution notes:
- Implemented inline without subagents, including the final review.
- Real public-signaling/WebRTC tests with three isolated browser contexts cover concurrent property edits and insertion, viewer enforcement, own undo/redo, remote camera models, deliberate desync repair and host departure.
- A separate real-browser traffic check transferred a 400,000-character repeated payload in 2,671 application bytes on join. A stationary room sent 50 application bytes over 16 seconds. Twenty rapid changes to one property sent 77 bytes and received 117 bytes, with no repair snapshots.
- Deterministic protocol tests cover replay versus snapshot repair, retrying a lost repair response, identifier leases, concurrent first points, guarded undo and deletion ownership. Application counters exclude WebRTC/signaling overhead; traffic varies with content and activity.
