# Reference plane selection and Studio navigation

- Root cause verified: viewport plane key routing consumes S before StudioControls; it also consumes tool.* commands. Planes are deliberately excluded from blueprint picking and have no separate ray picker.
- Keep local image meshes separate from Doc. Add a ray picker to their layer, invoked only with the Reference inspector selected and a standard Select/Move/Rotate tool. Switching away clears plane selection while keeping images visible.
- Reuse tool commands for toolbar and 1/2/3: a selected plane uses Select (no gizmo), Move or Rotate. G/R remain plane shortcuts; T replaces S for resize. S always reaches Studio navigation. Empty-space or part clicks deselect the plane; gizmo presses retain it. Highlight the selected plane locally.
- Make existing reference control buttons select the matching standard tool. Keep plane edits out of blueprint history, exports and collaboration.
- Style the socket reset trigger and confirmation action red with an explicit danger button class.
- Prove with layer ray-picking/visibility/selection tests, command tests, real browser Studio backward movement and 1/2/3/gizmo clicks, inactive-tab click-through and export isolation; full checks and deployment verification.
