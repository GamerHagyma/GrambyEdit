# Mirror and collaboration — assessment only

Original assessment, 2026-10-25. The mirror tool remains deferred. Collaboration was subsequently authorized and implemented inline; see [the implementation details](../../COLLABORATION.md). The proposals below preserve the reasoning that preceded implementation.

## Mirror

**Verdict: feasible, with blueprint-specific work beyond reflecting meshes.**

Proposed first version: select parts, choose an XY/XZ/YZ plane, move/rotate it with familiar gizmos, preview a mirrored copy, then Apply or Cancel. Default to creating a copy; replacing the selection is an explicit option. Apply is one undoable transaction. The mirror plane stays editor-only.

The existing clipboard code provides fresh part IDs/point UUIDs and internal joint remapping. Pose helpers already distinguish whole parts and independently anchored bodies. These are useful foundations.

The main difficulty is handedness: a rotation alone cannot produce the reflection of an asymmetric object. A credible tool needs compatible left/right part variants and socket mappings, reflected point frames, and a clear response for unsupported asymmetric parts. A negative-scale visual preview is not proof that exported parts will spawn identically in game. Validate representative exported builds in game before claiming full coverage.

Other requirements: include intended children once; preserve colors/properties; define external-connection handling; respect independently anchored wire ends; check servo rotation/direction semantics. Start with Apply rather than live symmetry.

Choices for later: duplicate versus replace default, arbitrary-plane controls, automatic descendant inclusion and unsupported-part behavior.

## Collaborative workspace

**Verdict: feasible with the editor hosted on GitHub Pages, but Pages cannot run dynamic room routing or the handshake.** Pages serves static HTML/CSS/JavaScript. An external mechanism must exchange connection information. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Options:

1. **Recommended initially:** host-authoritative WebRTC rooms plus a small external signaling service. Guests connect to the host, which orders accepted edits and broadcasts results.
2. Manual offer/answer copy-paste avoids a room signaling service, but joining and reconnecting are cumbersome.
3. A server-authoritative workspace supports durable rooms/host departure more naturally, but requires an editing backend.

WebRTC supports application data, but application signaling is separate. STUN assists connectivity; TURN relays traffic when direct connections fail. A relay-free design cannot promise universal connectivity. Signaling traffic can be small, while relay bandwidth depends on sessions requiring TURN. [Peer connections and signaling](https://webrtc.org/getting-started/peer-connections), [TURN fallback](https://webrtc.org/getting-started/turn-server).

Proposed first version:

- Host creates an invite; guests choose a name and camera color. Host approves guests, assigns viewer/editor permissions and can remove users.
- Host validates edit intents against document revisions, assigns IDs and sequences changes. Reconnecting guests recover from a snapshot. Permissions are enforced where edits are accepted, not merely in disabled controls.
- Reliable ordered messages carry edits/snapshots/permissions. Camera presence is separate, throttled and interpolated. Colored camera models and name tags stay outside blueprint picking, history and export.
- Rooms last while the host is present; guests can save their copy if the host leaves. Host migration and durable storage are later work.

The current `commit(label, fn)` closure cannot itself be transmitted. A versioned protocol must encode edit intents/accepted patches, Maps, IDs, point UUIDs and ordering. Clients need matching catalog/convention/socket-override versions. Undo ownership must be explicit so one guest cannot rewind someone else's later edit. References and servo previews should remain local initially.

Data channels encrypt transport; identity and edit permissions remain application responsibilities. Large snapshots need bounded chunks/backpressure. [WebRTC data channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels).

Choices for later: room size, host departure policy, guest undo rules, reference sharing, service/provider budget and permission levels. These need discussion before implementation.
