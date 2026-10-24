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
| **Assembly editing** | Select individual parts or attached branches, move and rotate them together, and edit shared properties. |
| **Colour** | Paint selections and regions, automatically colour new parts, and apply gradients or seeded random palettes to generated shapes. |
| **Generators and surfaces** | Twelve shape generators with host picking and live previews, plus custom GasCap surfaces defined by four movable corners. |
| **Reusable components** | Favourite parts, a local creation library, prefabs, and library backup import/export. |
| **Build management** | A searchable Outliner, range selection, batch visibility controls, undo/redo, a command palette, and part-count and code-length meters. |
| **Reference images** | Paste images or direct image links into the Reference tab, or choose local files. Pop the viewer out into a pinned, movable, resizable window over the editor. |

## Compatibility and limitations

- **Working as of October 2026 (2026.10), with the "THE REMAKE UPDATE" version of Road to Gramby's.**
- Joints and physics simulation are not implemented. The editor cannot verify how a creation will behave in game.
- Wiring and logic are not currently simulated.
- Some complex nested point mounts still differ from the game. Check those assemblies in game.
- The tool will probably break with the next game update. I will probably update it for the next version, but there is no guarantee.

Keep a copy of the original share code before editing a creation.

## Getting started

1. Open the editor and choose **Start empty**, or use **File → Import code** to load an existing creation.
2. Select a part from the **Parts** tab and click in the viewport to place it. Right-click to return to the Select tool when finished.
3. Use the transform and paint tools to edit parts, or the **Generators** and **Surfaces** tabs to create geometry. Live previews show the result before it is added.
4. Use **File → Export code** and load the result in Road to Gramby's.

The creation library and preferences are stored in your browser. Export a library backup before moving to another browser or computer.

**Building from a picture:** open the right panel's **Reference** tab and paste an image or direct image URL, or choose an image file. Use **Pop out** to keep it visible while using other tabs; drag its title bar to move it and its bottom-right corner to resize it. **Dock** returns it to the panel. References last until the page closes and are kept outside share codes and build history.

## Controls

The editor supports **Blender** controls for orbiting around a build and **Studio** controls for flying through it. Switch between them in the toolbar.

| Shortcut | Action |
| --- | --- |
| `G` / `R` | Move / rotate the selection |
| `X`, `Y`, `Z` during a transform | Choose an axis |
| Type a number | Set an exact distance or angle |
| Hold `Ctrl` | Snap to the toolbar's step size |
| `Enter` / `Esc` | Confirm / cancel a transform |
| `Ctrl+Z` | Undo |
| `1` to `6` | Select, Move, Rotate, Connect, Point, Paint |
| `?` | Open the full shortcut guide |

**Outliner:** Shift-click selects a range, Ctrl-click toggles individual rows, and right-click opens visibility controls for the selection. Hidden parts remain selectable in the Outliner and can be shown again from the same menu.

**Surfaces:** Shift-click corner buttons or viewport dots to select multiple corners. Move them together with the gizmo or `G`. Enable **World grid** and hold Ctrl to snap all three coordinates.

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
