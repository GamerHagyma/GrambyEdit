# Mirroring socket preference, pending previews and focused Shift sockets

User requests inline implementation; subagents are limited to verification by prior instruction.

Decisions:
- Prefer a free native socket when its computed placement matches the desired reflected/radial pose within 0.0001 studs and a tight rotation tolerance. Search compatible child/parent pairs; preserve original native joints when valid, and solve Orientation only when the part/game mount supports it. Keep ephemeral points as the fallback when no native socket can reproduce the pose. Never move a copy noticeably just to find a socket, consume an occupied slot, or create a cycle. Verify the final whole build as before.
- With Repeat new placements off, record successfully placed source IDs in a local pending set after the existing placement commits. Preview all pending placements plus the current selection, and approve them together. Selection changes do not discard pending work. Clear/anchor replacement/workspace replacement clear the queue, and deleted sources are ignored/pruned. Failed approvals preserve pending work. No queue/ghost data is shared.
- The live mirrored cursor ghost works whenever a mirror anchor is configured, independent of Repeat new placements. The checkbox controls committing automatic copies only.
- Add Spinner as a search alias for native Bearing. Preserve native type strings and blueprint compatibility.
- Shift's compatible socket enlargement uses smooth screen-distance falloff within a configurable radius (default 150 px, range 20–1000 px). Nearby compatible sockets draw on top; outside the radius retain normal size/depth. Picking uses the same distance-based size. Ordinary selection and non-Shift rendering remain unchanged.

Checks:
- Red/green core tests: aligned Connector/Part native attachment, no unused ephemeral mounts; tight-tolerance/occupied/misaligned/cycle fallback, descendants, radial and mirrored fixtures/export roundtrip.
- State/UI tests: two unapproved placements survive selection changes and approve together; live ghosts with auto off; queue lifecycle/failure/permissions/local-only; Spinner/Bearing searches.
- Marker/picker tests: center/half/edge falloff, percentage/radius validation, only near compatible sockets use on-top material and larger pick radius; release resets.
- Real browser placement and shared-room isolation checks; full assets/types/format/tests/build, read-only independent review, commit/deploy and production smoke test.
