<div align="center">

# GrambyEdit

A browser-based 3D blueprint editor for [Road to Gramby's](https://www.roblox.com/games/5796917097/Road-to-Grambys), focused on precise editing and larger, more complex creations.

**[Try it now →](https://gamerhagyma.github.io/GrambyEdit/)** — free in your browser, no installation needed.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-222222?style=flat-square&logo=threedotjs&logoColor=white)
![Preact](https://img.shields.io/badge/Preact-673AB8?style=flat-square&logo=preact&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)

[Getting started](#getting-started) · [Controls](#controls) · [Compatibility and limitations](#compatibility-and-limitations) · [GitHub Pages](#github-pages) · [Report an issue](https://github.com/GamerHagyma/GrambyEdit/issues)

</div>

![A truck build in GrambyEdit, with the Parts browser and expanded Outliner visible](docs/images/editor-preview.png)

GrambyEdit makes it easier to build and modify RTG creations outside the game. It provides precise positioning, assembly editing, reusable components, and tools for repetitive work, which become especially useful as a build gets larger. Import an existing share code or start a new creation, edit it in the browser, then export a code to load in game.

## Features

| Area | Tools |
| --- | --- |
| **Import and export** | Read share codes or JSON, display native part meshes and textures, and export edited creations. |
| **Placement and alignment** | Visible sockets, click-to-connect placement, editable connection points, and local or world-grid snapping. |
| **Socket dragging** | Reattach parts, pieces or selections with Select or the Move center handle. Hold Shift for nearby compatible sockets to show through surfaces, grow toward the cursor and snap exclusively; adjust size and radius in Settings. |
| **Assembly editing** | Select individual parts or attached branches, move and rotate them together, and edit shared properties. |
| **Mirroring and radial copies** | Anchor a mirror plane or radial axis to a Part or Connector, preview copies, and repeat new placements automatically. Guides stay local during collaboration; created parts sync. |
| **Servo preview** | Hold red/blue simulation buttons or enable Sustain, inspect the live angle, and choose whether remembered rotations are exported. |
| **Logic-part wires** | Thin internal wires follow moving pieces, turn orange beyond 10 studs, and report overstretched parts in the Issues tab. |
| **Colour** | Paint selections and regions, automatically colour new parts, and apply gradients or seeded random palettes to generated shapes. |
| **Generators and surfaces** | Twelve shape generators plus GasCap surfaces: classic four corners, optional Bézier edges, and multiple curved profiles with smooth or sharp joins. Live guides and cap previews stay local; created parts sync. |
| **Reusable components** | Favourite parts, a local creation library, prefabs, and library backup import/export. |
| **Part availability** | Non-spawnable templates have an Unavailable category, keeping them searchable for imports and inspection. Working splitter variants stay in their normal category. |
| **Build management** | A searchable Outliner, range selection, batch visibility controls, undo/redo, a command palette, and part-count and code-length meters. |
| **Collaboration** | Host a shared workspace, invite up to seven guests, assign viewer/editor permissions, and see colored cameras with names. Changes sync directly between browsers. |
| **Reference images** | Paste images or direct links, choose local files, pop out a pinned viewer, or insert local image planes with move, rotate and resize gizmos. |

## Compatibility and limitations

- **Working as of October 2026 (2026.10), with the "THE REMAKE UPDATE" version of Road to Gramby's.**
- Joints and physics simulation are not implemented. The editor cannot verify how a creation will behave in game.
- Wiring and logic are not currently simulated.
- Some complex nested point mounts still differ from the game. Check those assemblies in game.
- The tool will probably break with the next game update. I will probably update it for the next version, but there is no guarantee.

Keep a copy of the original share code before editing a creation.

## Getting started

1. Open the editor and choose **Start empty**, or use **File → Import code** to load an existing creation.
2. Select a part from the **Parts** tab and click in the viewport to place it. Double-click a Parts card in an empty workspace to place it at the center and focus the camera. Right-click to return to the Select tool when finished.
3. Use the transform and paint tools to edit parts, or the **Generators** and **Surfaces** tabs to create geometry. Live previews show the result before it is added.
4. Use **File → Export code** and load the result in Road to Gramby's.

The creation library and preferences are stored in your browser. Export a library backup before moving to another browser or computer.

**Starting over:** **File → New** clears the workspace after confirmation. **Generators** and **Surfaces** have a coloring checkbox; turn it off to keep each part's native default color.

**Building from a picture:** open the right panel's **Reference** tab and paste an image or direct image URL, or choose an image file. Zoom and pan the image, or use **Pop out** to keep it visible while using other tabs; drag its title bar to move it and any corner to resize it. **Dock** returns it to the panel. References last until the page closes and are kept outside share codes and build history.

**Reference planes:** choose **Insert image plane** to place the active image at the camera's focus, facing the camera. With the **Reference tab selected**, click a plane to select it, then use the normal **Select / Move / Rotate** tools (**1 / 2 / 3**) or the plane's buttons. **G / R** starts an interactive move or rotation: move the mouse, constrain with **X / Y / Z**, or type an amount. **Enter / left-click** confirms; **Esc / right-click** cancels and restores the starting transform. Hold **Ctrl** (Cmd) to snap, using the toolbar's snap steps; **World grid** makes moves land on absolute grid coordinates on every axis. This works with both G/R and the drag gizmos. **T** activates resize; **S** remains available for Studio camera movement. Exact position, rotation, width and height fields are also available. Outside a transform, **Esc**, **Finish editing plane**, or switching inspector tabs deselects the plane; planes remain visible but cannot be clicked in other tabs. Adjust opacity, hide the plane, or remove it without deleting the reference image. Planes stay local and are excluded from exports and collaboration. Remote image servers must allow CORS for 3D textures; choosing a downloaded image file works without that restriction.

**Projection:** the toolbar's **Perspective / Orthographic** button switches projection without changing the camera target. The same toggle is available in **View → Toggle orthographic** or with **Numpad 5**.

**Socket defaults:** custom Sockets-tool captures and imported overrides are saved in this browser's IndexedDB. **Sockets → Reset all to defaults…** asks for confirmation, then clears all saved socket overrides and restores the shipped catalog. Export your socket file first to keep a backup.

## Build together

1. Open **Collaboration** in the top bar, choose your name and camera color, then **Host workspace**.
2. Share the invite link. Guests open it and click **Join (replace workspace)**; they should save their existing work first.
3. Approve each guest for viewing or editing. You can change permissions or remove people from the same panel.

Edits sync as small changes. Moving cameras are throttled; stationary cameras send nothing. A small consistency check runs every 15 seconds, with a full build sent on joining or when needed to repair a mismatch. Undo/redo applies to your own changes and protects newer changes from others. Reference images, selections, surface drafts and servo previews stay local.

G/R and gizmo transforms keep running while collaborators edit. Your delta applies to the latest shared pose; removing the target cancels safely. Invitation links open a prominent **Join** action.

The host must keep the page open. When the room ends, everyone keeps their current local copy and can export it. Leave the room before using New/Open to replace the whole blueprint. A room supports eight people total, with matching part catalogs and socket settings.

GitHub Pages serves the editor; the default public PeerJS signaling service establishes WebRTC connections between browsers. Some networks require a TURN relay: **Connection settings** accepts a custom HTTPS PeerServer and ICE/TURN settings. TURN credentials are session-only and are not included in invite links. See [collaboration details](docs/COLLABORATION.md) for limits and synchronization behavior.

## Controls

The editor supports **Blender** controls for orbiting around a build and **Studio** controls for flying through it. Switch between them in the toolbar.

Open **View → Help & controls** or press **?** for usage instructions, collaboration, mirroring, references, servo controls and the current keyboard bindings.

| Shortcut | Action |
| --- | --- |
| `G` / `R` | Move / rotate the selection |
| `X`, `Y`, `Z` during a transform | Choose an axis |
| Type a number | Set an exact distance or angle |
| Hold `Ctrl` | Snap to the toolbar's step size |
| `Enter` / `Esc` | Confirm / cancel a transform |
| `Ctrl+Z` | Undo |
| `1` to `6` | Select, Move, Rotate, Connect, Point, Paint |
| `?` | Open Help & controls |

**Outliner:** Shift-click selects a range, Ctrl-click toggles individual rows, and right-click opens visibility controls and **Invert selection**. Invert is also available in the viewport's right-click menus. **Show all** and **Hide all** affect every workspace part, including filtered or collapsed rows. Hidden parts remain selectable in the Outliner.

**Socket dragging:** use Select or the Move center handle to drag one part or a selection onto another socket. The other selected parts keep their relative placement. Hold **Shift** while carrying or dragging for compatible sockets only; surface and ground placement resume on release. Nearby compatible sockets show through surfaces, with enlargement fading smoothly to normal at the edge of the cursor radius. **Settings → Editing** controls **Socket enlargement while holding Shift (%)** (100% doubles size at the cursor) and **Shift socket focus radius (px)** (default 150). Outside that radius, sockets keep normal size and depth visibility. Orange/red markers distinguish mechanical connection points. Search **Spinner** to find the native **Bearing** part.

**Surfaces:** Shift-click corners, anchors or handles to select several. Move them with the gizmo or `G`; use **Ctrl** for snap steps and enable **World grid** for grid coordinates. Profile groups snap by their selection center so their curve handles keep their offsets.

## Curved and profile surfaces

1. In **Surfaces**, pick the parent face. **Four corners** keeps the original tool; enable **Curve edges** to expose Bézier boundary handles.
2. Choose **Profiles** to shape the surface with cross-sections. Click **Add profile** to insert a section after the active one. **Add anchor column** inserts a matching anchor across every profile. Insertion preserves the guide's shape until you edit it.
3. Click a profile button to move its whole section, or select individual anchors/handles in the viewport or **Control** list. Use the gizmo, `G`, or the **X/Y/Z** fields; Shift adds to the selection. The fields use the parent's axes.
4. Choose **Smooth** at an interior profile/column to keep the join smooth, or **Crease** for a sharp change of direction. **Straighten profile segment** resets that segment's handles onto a straight line.
5. Use **Undo draft edit / Redo draft edit** for guide changes. Regular `Ctrl+Z` still undoes blueprint edits. Switching modes retains their separate drafts; **Start profiles from quad** asks before replacing edited profiles.
6. Wait for the GasCap preview and count, then click **Create**. Creation is one blueprint undo action and uses the normal mirroring and collaboration paths. Drafts and guides stay local and are not exported.

GasCaps keep their native size. Curves are approximated by overlapping flat plates; tight bends, folds and unsupported overhangs produce a diagnostic instead of an incomplete build. Coloring can be disabled, in which case the game assigns random GasCap colors. Export precision affects coverage; an unsupported precision cannot be created.

## Mirror and radial placement

1. Select a **Part** or **Connector** and open the right panel's **Mirror** tab. Click **Use selected Part / Connector** to attach the guide to it.
2. Choose **Mirror plane** and its local YZ/XZ/XY plane. Adjust the offset, use **Top face**, or expand **Rotate guide** to turn the plane. **Center** resets the offset and rotation. Moving the anchor moves the guide with it.
3. Select the parts to copy and click **Apply to selection**. **Include attached children** copies their branches too; the anchor is excluded and the originals stay in place.
4. Enable **Repeat new placements** to copy new parts, pasted builds, picker placements, generated shapes and surfaces automatically. A placement and its copies are one Undo action.

The mirrored cursor ghost appears with **Repeat new placements** on or off. With it off, new placements accumulate as pending holograms even after selecting another part. Use **Apply pending & selection** to approve them together, or **Forget pending previews** to discard only the pending list. The source parts remain in the build.

For circular patterns, choose **Radial**, select an axis and set **Total sectors** (2–16, including the original). Turn off **Skip centered parts** when you want rotated copies of a part centered on the axis.

**Show guide** and **Preview selection** control the local display. In collaboration, each builder has an independent setup: only actual part placement is shared. **Clear mirror**, deleting the anchor, or replacing the workspace clears that setup.

Copies prefer free, compatible native sockets whose position and orientation align within a tight tolerance. If none fit, they use ephemeral attachment points so their placement survives export. Mirroring reflects placement positions and rotations; the game format cannot apply negative scale to arbitrary asymmetric meshes. Door A/B and C/D variants swap automatically. Copies keep properties and remap internal connections; external joints are not duplicated. If a part cannot be mounted without damaging its internal wiring, the operation reports why and leaves the build unchanged. See [mirroring details](docs/SYMMETRY.md).

## GitHub Pages

Use GrambyEdit in your browser without a local installation:

**[gamerhagyma.github.io/GrambyEdit/](https://gamerhagyma.github.io/GrambyEdit/)**

## Run locally

Requires **Node.js 24 or newer** and a browser with **WebGL 2** support.

```sh
git clone https://github.com/GamerHagyma/GrambyEdit.git
cd GrambyEdit
npm ci
npm run assets
npm run dev
```

Open the local URL printed by Vite. To build and preview the static site:

```sh
npm run build
npm run preview
```

## Development

I built this tool in three days with help from Claude and ChatGPT.

For bug reports, include a short description, screenshots where relevant, and a small example share code. If a creation looks different in game, include both views and the code that reproduces the difference.

Before submitting a change, run:

```sh
npm run assets
npm run typecheck
npm run format:check
npm test
npm run build
```

The source is organised into `src/core` for blueprint rules and geometry, `src/tools` for editing, `src/viewport` for rendering, and `src/ui` for panels. The asset pipeline is in `scripts`.

Further documentation: [blueprint format](docs/RTG_BLUEPRINT_FORMAT.md), [editor design](docs/EDITOR_DESIGN.md), and [asset sources](docs/SOURCES.md).

## Credits

- **Mumble Games**, creators of Road to Gramby's and its part artwork.
- **[JuanCrakYT / RtG-Format](https://github.com/JuanCrakYT/RtG-Format)** for community format research and mesh exports.
- **[jirrob / GrambysWorkshop](https://github.com/jirrob/GrambysWorkshop)** for reference tooling and exports.
- Everyone who tested builds and reported issues.

GrambyEdit is a community project, unaffiliated with Mumble Games or Roblox. Game artwork belongs to its respective owners; vendored projects retain their original licences.
