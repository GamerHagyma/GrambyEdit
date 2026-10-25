# Optional generation coloring and New blueprint

**Goal:** fix these two prerequisites in a separate commit before servo simulation.

- Add optional `colorEnabled` to generator requests and surface specs; absence means
  enabled for existing callers/presets. Disabled means no RGB prop on generated elements,
  and no multicolor overlap staggering on surfaces. Palette settings remain untouched.
- Show Apply coloring in each panel. Wrap color controls in a disabled, dimmed fieldset.
  Generator presets retain the toggle; validate stored booleans and support older presets.
- File → New opens an explicit confirmation. Cancel leaves the build unchanged. Confirm
  clears the document/history/selection, placement/modal/pick state, host picks, hidden
  ids and current creation association. Preserve library, preferences and reference images.
- Prove no RGB in preview/generated/exported results, toggle restoration, preset migration,
  disabled controls, and New confirmation/cancellation/reset behavior. Browser-check both
  panels and the menu, then run typecheck/format/full tests/build and independent review.
- Simulation remains outside this commit. Update its plan with symmetric ±LimitAngle,
  the confirmed defaults, and an export checkbox for including servo Rotation values.
  Clarification requested for the ambiguous “both 45” / rest position answer.
