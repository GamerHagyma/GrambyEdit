# Generator and surface continuation verification — 2026-10-24

Scope: finish the browser verification interrupted at the end of Claude session
`2f2e747e-600d-4d19-955c-68d4df6a0010`. Its latest request covered the GasCap
position offset, world-grid snapping on all three axes, and moving several
surface corners together. No application code changes were needed in this continuation.

## Fresh automated checks

- `npm test`: 111 test files, 767 tests passed; exit 0.
- `npm run typecheck`: passed; exit 0.
- `npm run format:check`: passed; exit 0.
- `npm run build`: passed; exit 0.
- `git diff --check`: passed; exit 0.

The build still reports a JavaScript chunk larger than 500 kB. The jsdom tests
print the existing canvas `getContext` notices. Neither caused a failed check.

## Browser checks

Verified at `http://localhost:5173/GrambyEdit/` in a separate in-app browser test
build; the user's Firefox build was not edited.

- Pick a Part's top face: a four-GasCap surface preview appears.
- Plain click and Shift-click on Corner buttons select two corners and highlight
  both buttons, fields and viewport badges.
- G, Y, 0.25, Enter moves both selected corners from Y 0.55 to 0.8; the other
  corners remain at 0.55.
- With an imported Part at the origin, World grid enabled, and a 0.25 move step,
  G, X, then Ctrl-click lands both chosen corners on the grid on **all axes**:
  corner 1 becomes `[-0.5, 0.5, 0.75]`, corner 2 `[1, 0.5, 0.75]`.
  Unselected corners retain their original coordinates.
- G, Y, 2, Esc restores the coordinates from before the move.
- Dragging the green gizmo handle moves both selected corners by the same amount;
  unselected corners remain unchanged. A Ctrl-held gizmo drag was not exercised
  in the browser; Ctrl snapping was exercised through G as described above.
- Create, Undo, and Create again work; Undo restores the adjustable preview.
- Generator host picking shows `#1 Part`, changes the cost to +31 parts, and
  Generate creates 31 elements on that host. Undo returns the build to one Part.
- With Spin off, consecutive preview screenshots are identical. Dragging the
  preview changes the view. With Spin on, successive screenshots change.
- Exported a flat four-cap surface on a Part and imported the resulting share
  code again: five parts, two types, zero errors and zero warnings.
- No browser console errors were recorded. Four existing
  `THREE.Material: parameter 'side' has value of undefined.` warnings were
  recorded; `src/viewport/markers.ts` already contains that material argument in HEAD.

## Game verification limitation

Connected to Grambtest (placeId 133038743067956) through Studio MCP. Edit mode
contains the baseplate, spawn and camera, with no game scripts or part library.
The user confirmed this place was likely used for content-delivery scraping and
that they do not have a copy of the game or a test place.

The GasCap centre-pivot rule passes the editor's pose and surface tests, but
remains **inferred from the user's in-game offset report**, not independently
verified against the game's mounting implementation. Studio alone cannot close
that gap. A live-game import is still needed to confirm exact placement.

An exported alignment probe and screenshots are saved in:
`C:/Users/GamerHagyma/.codex/visualizations/2026/10/24/01a16efc-7bdf-7423-bda8-387940c4da7c/`.

- `gascap-alignment-probe.txt`: one Part with four GasCaps; the caps should form a
  flat surface resting on the Part's top face, without a gap or penetration.
- `gascap-alignment-probe.png`: the exported code re-imported in the editor.
- `surface-verification.png`: two selected surface corners with their gizmo.

No commit, push, deployment, or Studio project modification was performed.
The existing uncommitted implementation and user's files remain in place.
