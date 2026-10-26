# Symmetry edits and reference proportions — verification

Implemented on `codex/profile-surfaces` for the user's requested commit and Pages deployment.

- Existing counterpart matching uses type and all body frames, spatial buckets and a 0.0001 matrix-component tolerance. It excludes selected parts, their already-carried descendants and the anchor; ambiguous matches are left alone. Actual mirrored deltas preserve pre-existing export/socket rounding differences and include sub-tolerance movements.
- Plane and radial movements preserve IDs and share one transaction with the source. G/R, gizmos, drag reattachment, Orientation fields and Delete are integrated. Previews stay local. Root/loose multipart bodies are pinned only when necessary to reproduce independently moved source bodies.
- Review found a whole-part socket-drop case that could discard a signal connection. The fix preserves signal connections for whole-part moves and retains body-slot order. Explicit body drags can replace their own connection. Regression cases cover real-socket and point fallback, an explicitly rewired Wire end, inherited body motion, no-op gestures, children and both sides selected.
- Ctrl resizing uses one bounded scale factor to retain the plane's starting proportions. Numeric commits and gizmo events share the size constraint; releasing Ctrl restores independent dimensions. Reference state remains outside blueprint exports/history/collaboration.
- The native probing runbook, repository agent entry point, version-bound Windows reader, layout profile and offline comparison tool are preserved. No new live process capture was performed for this task. Offline replay of the saved probe passed 126 fixed poses and four free axes; Python compilation and CLI help passed.

Final local checks on 2026-10-26:

| Check | Result |
| --- | --- |
| Full tests | 156 files / **1,259 tests passed** |
| Asset generation | 451 captured sockets, zero approximate; mesh pack generated |
| Typecheck | Passed |
| Formatting | Passed |
| Production build | Passed; existing bundle-size warning remains |
| Diff whitespace | Passed |
| Chromium editor | Two selected parts moved to X=4/5; counterparts moved to X=-4/-5. Delete removed both groups; Undo restored deletion and movement. Ctrl width/height commits and scale-gizmo events retained proportions; zero runtime errors. |
| Two local WebRTC clients | Guide remained private; mirrored move/delete synchronized; a guest edit preserved the host's mirrored G gesture; serialized blueprints matched and runtime error lists were empty. |

The test suite retains its existing jsdom canvas notices. The two-client test used a loopback signaling server and actual PeerJS/WebRTC, not a public test room. Public Pages deployment is performed after this verified commit; the GitHub workflow is the authoritative record of the published revision.
