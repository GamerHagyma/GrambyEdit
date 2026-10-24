# Reference images and README entry point

User requirements: prominent Try it now link, Reference tab in the right inspector,
paste clipboard images or direct image URLs, and a pinned movable/resizable pop-out.
The user chose a floating window inside the editor.

## Design decisions

- Use a fixed in-page window above the editor, below modal dialogs. A separate
  browser window has inconsistent pinning support; an in-page window fits the
  user's confirmed preference. Docking returns to the Reference tab.
- References live in dedicated session-only UI signals. They survive tab/build
  changes, never enter Doc, share codes, history, or library records.
- Support multiple images with a thumbnail selector, remove, file picker, direct
  clipboard image paste, and an HTTP(S) URL form. Render URLs as images directly;
  invalid/failed images show an error and can be replaced or removed.
- Clipboard images pasted over the editor open References. The focused reference
  area also accepts pasted URLs. Text fields keep normal paste. Reference controls
  consume editor shortcuts so Delete/G/R/copy never edit a selected blueprint.
- Revoke local object URLs on removal. Bound the floating window to the viewport,
  including viewport resize. Drag/resize handles also support arrow keys.

## Plan and proving checks

1. Add the README link immediately beneath the introduction.
2. Test-first session state: URL validation, clipboard/file addition, selection,
   removal and object URL cleanup. Prove blueprint/share code/history identity.
3. Test-first Reference UI: file/URL/paste, errors, multi-image selection, switching
   tabs, pop-out/dock, keyboard isolation, and editor-wide image paste.
4. Implement bounded pointer and keyboard move/resize. Browser-test real pointer
   movement, resizing, viewport resize, and unchanged exported code.
5. Review the diff, run typecheck, formatting, full tests and production build.
   Independent review checks image lifecycle, paste routing, and UI isolation.

## Verification

- 122 test files / 859 tests passed; typecheck, Prettier check, whitespace check,
  and production build passed. No dependencies added.
- Browser smoke passed native clipboard image and URL paste, URL-form loading,
  multiple images, pointer movement/resizing, persistence across inspector tabs,
  keyboard isolation, focus transfer, viewport shrink, and docking. The real
  selected one-part build's share code and history count stayed unchanged.
- Independent review found missing isolation on the dock placeholder/header and
  focus loss during pop-out. Reproduced with failing tests, fixed at the app event
  boundary, and verified focus on pop-out/dock and pointer handles. Final reviewer
  reported no remaining P1/P2 findings within the reviewed scope.
- Existing non-failing diagnostics remain: jsdom canvas notices and Vite's
  advisory about the production bundle exceeding 500 kB.
