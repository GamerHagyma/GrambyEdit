# Finish the interrupted wire editing session

Recovered from Claude Code sessions `2f2e747e-600d-4d19-955c-68d4df6a0010` and
`4ce6e403-ec65-4796-adf3-24a032fc586b`. The final user request is to stack a wire end
on its other end, show usage instructions in the bottom bar for multi-piece parts,
then commit, push, and redeploy GitHub Pages. Existing uncommitted work belongs to
that session and must be preserved.

## Decisions

- Continue in the existing checkout: the unfinished work is already here.
- Preserve anchored self-connections through import instead of baking geometry.
  An earlier external connection must anchor the part; unanchored legacy self-joints
  remain raw. Check socket and surface stacking and export/import stability.
- Extend the existing piece drag tool to look through only the moving body, show
  the stationary body's sockets, and reject self-body and dependency cycles.
- Add a contextual selection hint below tool-specific prompts in precedence. Show
  it for multi-piece selections and remove it for ordinary parts or deselection.

## Execution

1. Reproduce the existing export/import failure. Add importer regressions for an
   anchored self socket, an anchored self point, and export index changes. Fix the
   importer without changing raw legacy self-joint preservation.
2. Exercise real Select/Move drag handlers with controlled picking boundaries.
   Cover self sockets, self surfaces, rejected same-body targets, escape, and undo.
   Allow the stationary body as a target; maintain whole-part cycle guards.
3. Add and verify the bottom-bar instructions using the existing hint location;
   tool prompts take precedence. Update the design and shortcut documentation.
4. Review all inherited changes, regenerate assets, run typecheck, formatting,
   the full test suite, and the production build. Check the browser interaction.
5. Commit the completed session work, push main without force, and verify both
   CI and the Pages deployment for the pushed commit and the public page.

## Review focus

- Stacking either end must preserve the stationary end through export/import.
- A piece must not attach to itself or create an unanchored body loop.
- Socket targets must remain compatible and unoccupied; point-mounted pieces
  retain the game's socket restrictions.
- Tool prompts must not disappear beneath the contextual selection hint.
- Existing uncommitted calibration, spring rendering, selection, and surface
  changes must remain present and pass the full suite before publication.

## Verification record

- Reproduced the interrupted surface-stack export/import failure: a 0.2-stud shift.
  Added anchored-self socket/point import and reindexing regressions, then fixed import.
- Select/Move handler regressions cover self sockets, stationary surfaces, same-body
  rejection, cancellation, undo, and export/import. Contextual hint rendering covers
  ordinary selections, whole multi-piece selections, pieces, and tool-prompt precedence.
- Independent review found reverse self-stack cycles, point-child cycles, secondary
  body cycles across Wires, and missing stacked-body previews. Added regressions and
  fixed each: cycle checks follow each body's own connection, not just a part's first.
- Browser smoke used Playwright mouse events against the real canvas for selected
  ends in Select/Move, and a self-surface drop. Both bodies had zero matrix difference
  after export/import; no page errors. Screenshots confirmed the bottom-bar hint.
- Assets generated successfully: 450 captured sockets, zero approximate sockets.
- Full suite: 120 files, 842 tests passed. Typecheck, repository formatting check,
  diff whitespace check, and production build passed. Changed tool files were also
  formatted explicitly because the existing `tools/` Prettier exclusion matches them.
- Non-failing existing diagnostics: four jsdom canvas `getContext` notices and the
  production bundle size advisory (about 935 kB before gzip). No in-game physics test.
- Final independent review reran the last cycle reproduction: refused with
  `pose-cycle`, no patch. No remaining P1/P2 findings in the reviewed scope.
