# Editor helper controls

Goal: expose invert selection, workspace visibility and orthographic projection; reset local socket captures with confirmation; place editable reference images in a separate local 3D layer.

Choices:
- Use the existing command registry for menus and Outliner controls rather than duplicate actions. Inversion takes the exact complement, including in attached-selection mode.
- Reset every socket override namespace in IndexedDB, then restore the shipped catalog. A failed storage clear reports an error and keeps current overrides. Confirmation is required in the product UI.
- Use a separate Three.js reference-plane layer and local signals rather than adding fake blueprint parts. One plane per reference image, adjustable with numeric position/rotation/width/height and a dedicated move/rotate/scale gizmo; visibility, opacity and remove controls. Removing the image removes its plane. Planes never enter Doc, exports, history, collaboration or blueprint picking.
- Reuse the existing orthographic camera; expose a toolbar toggle with current state instead of adding a second projection implementation.
- Bearing search is bounded to existing runtime/workshop/community materials and available texture inventory. None of its materials references a recovered texture; leave its material unchanged rather than guess.

Verification:
- Exact selection complement under attached mode; part/empty/Outliner context menus; show/hide all despite filters and collapsed rows.
- Reset cancellation, successful persisted reset across coordinate spaces and storage-failure behavior.
- Reference plane lifecycle, finite/clamped transforms, export/document isolation; async texture disposal, CORS/load failure, pointer routing and viewport gizmo manipulation.
- Projection toggle reflects actual camera and preserves framing.
- UI/browser and collaboration regressions, full types/format/tests/assets/build, CI/Pages and production checks.
