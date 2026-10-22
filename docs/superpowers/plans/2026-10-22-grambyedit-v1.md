# GrambyEdit v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship GrambyEdit v1, the static GitHub Pages 3D blueprint editor for Road to Gramby's share codes specified in `docs/EDITOR_DESIGN.md`.

**Architecture:** A pure TypeScript core (codec, document model, rules, pose math, edit operations, shape generators) sits behind contracts written first. Preact + signals hold state and drive the UI. A three.js viewport draws one instanced mesh per part type. A build-time asset pipeline turns the repo's research data into `catalog.json` + `parts.bin`. Storage is IndexedDB. Every milestone leaves a working, deployable site.

**Tech Stack:** TypeScript (strict) · Vite · three.js · Preact + @preact/signals · Vitest + jsdom + @testing-library/preact + fake-indexeddb · Playwright · tsx · Prettier · Node 24.

**Spec:** `docs/EDITOR_DESIGN.md` (approved 2026-10-22, including D15–D17). "§9.3" etc. point into it.

## Global Constraints

- Node ≥ 24 and npm ≥ 11 (this machine: Node 24.16.0, npm 11.13.0). `package.json` has `"type": "module"`.
- Every dependency is pinned to an exact version (no `^` or `~`), resolved once in Task 1. Runtime dependencies are only `three`, `preact` and `@preact/signals`.
- `src/core/**` never imports from `src/state`, `src/viewport`, `src/tools`, `src/ui`, `src/storage` or `src/assets`. From `three` it imports only `Vector2`, `Vector3`, `Quaternion`, `Matrix3`, `Matrix4` and `Euler`.
- Vite `base: '/GrambyEdit/'`. Every asset URL is `import.meta.env.BASE_URL + 'assets/<file>'`.
- Export format (spec §6.2):
  - socket ids as strings;
  - parent index as an integer;
  - empty props as `[]`;
  - compact JSON;
  - standard-alphabet base64 with `=` padding.
- Default limits: `{ codeChars: 8_000_000, partSoftCap: 8_000, partWarn: 16_000 }`. All three are editable in Settings.
- Meter text:
  - `Code ${pct}% used`, with exactly two decimals;
  - `Parts ${n} / ${cap}`, with `en-US` thousands separators.
- Socket frames are `CFrame12` in Roblox `GetComponents()` order (x, y, z, then r00…r22 row-major).
  - They are stored **outward**: +Y points out of the part.
  - Default mating is `Rx(180°)`.
  - `Orientation` props rotate `Rx·Ry·Rz` about the parent socket frame. Formulas: spec §10.2.
- New uuids are `'{' + crypto.randomUUID() + '}'`.
- Every function that returns a `CFrame12` or a coordinate array normalises `-0` to `0` (`v + 0`). Tests compare with `toEqual`, which treats `-0` and `0` as different.
- Storage:
  - IndexedDB database `grambyedit`, version 1, with stores `creations` (keyPath `id`), `autosave`, `thumbs` and `sockets`.
  - localStorage keys start with `grambyedit:`.
  - Every storage call is wrapped in try/catch, and failures surface as toasts.
- The app makes no network requests other than for its own assets.
- Credit text, used verbatim in the README, the footer and the About dialog: `Road to Gramby's and all part meshes © Mumble Games. Mesh exports: JuanCrakYT/RtG-Format and jirrob/GrambysWorkshop (MIT).`
- Dark theme tokens: `--bg #1d1f23`, `--panel #24272c`, `--line #33373e`, `--text #e6e8eb`, `--muted #9aa1ab`, `--accent #4c8dff`, `--select #ff9d2e`, `--active #ffc46b`, `--ok #3fb950`, `--warn #d29922`, `--bad #f85149`.
- Before every commit, `npm run typecheck` and `npx vitest run` are green. Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Haiku subagents never commit and never touch files outside their task's **Files** list.

## Review Focus

1. **Pasted codes with line breaks, spaces, missing `=` padding, URL-safe `-`/`_`, or raw JSON** must import rather than fail. Test: Task 3, `decode tolerates wrapped, unpadded and URL-safe codes`.
2. **Codes containing part types, sockets or props the catalog does not know** (after a game update) must import, render as placeholders, and export JSON equal to the input. Tests: Task 4, `unknown types and props survive verbatim`; Task 10, `unknown types get a placeholder pose`.
3. **Builds with 0 roots (joint cycles), forward references or many roots** must render without hanging. Test: Task 10, `cycles terminate with pseudo-roots`.
4. **Huge builds (16K parts, 8M-char codes)** must keep each meter update under 300 ms and must never put the full code in the DOM. Tests: Task 9, `16K synthetic meter stays under budget`; Task 17, `export dialog shows only a preview of huge codes`.
5. **Moving or deleting relays whose pieces carry both faces or a mount** must never create E-TEAR or E-MATE, and must never silently drop a signal joint. Tests: Task 22, `1,000 random ops keep invariants and create no structural errors`; Task 23, `moving a signal-joined Splitter keeps its signal joint`.

## How this plan is executed

**Owners.** Each task names its owner.
- **Inline** is the orchestrator (Opus 5.5, in the main session). It owns contracts, math, rendering, interaction feel, integration, and all verification.
- **Haiku** is a Haiku 5.5 subagent dispatched with the Agent tool as `subagent_type: "general-purpose"`, `model: "haiku"`. Verified 2026-10-22: the subagent reports `claude-haiku-5-5`.

**Bundles.** Each dispatch costs about 56K tokens of fixed context, so related small tasks share one dispatch:

| Dispatch | Tasks | Theme | Starts after |
|---|---|---|---|
| A | 3 → 4 | codec, uuids, CFrames, document conversion | 2 |
| B | 5 → 6 | OBJ/MTL parsers, sub-part names, curation data | 2 |
| P1 | 35 | shapes: line, grid, box, ring, cylinder, sphere | 2 |
| P2 | 36 | shapes: cone, torus, arc, helix, stairs, text | 2 |
| D1 | 8 | graph queries, structural rules | 7 |
| D2 | 9 | code-size meter, build stats | 4 |
| G1 | 19 | socket + calibration probe codes | 8 |
| E | 16 | stats, issues, outliner, meters | 15 |
| F | 17 | import/export dialogs | 15 |
| J | 26 | part browser, picker, thumbnails, favourites | 15 |
| H | 22 | edit operations | 12 |
| G2 | 21 | workbench panel | 20 |
| L | 29 | properties panel (multi-edit) | 22 |
| N | 32 | library storage | 20 |
| R | 39 | settings, about, first run, code optimiser | 22 |
| I | 24 | clipboard, prefab insert, duplicate | 23 |
| K | 28 | paint tool and color panel | 22 |
| M | 31 | palette, shortcuts, context menu, history list, quick fixes | 30 |
| O | 34 | library UI, My creations | 33 |
| Q | 38 | generators panel | 37 |
| S | 43 | accessibility checks, user guide | 42 |

**Waves.** At most four Haiku agents run at once, and files never overlap inside a wave:

| Wave | Inline | Haiku |
|---|---|---|
| W0 | 1, 2 | — |
| W1 | 11; 7 (`approx.ts`, `socket-geometry.ts`) | A, B, P1, P2 |
| W2 | 7 (build); 10 once D1 returns | D1, D2 |
| W3 | 12, 13, 14, 15 | G1 |
| W4 | 18 (wiring), 20 | E, F, J, H |
| W5 | 18 (deploy), 23 | G2, L, N, R |
| W6 | 25, 27 | I, K |
| W7 | 30, 33, 37 | M (after 30), O (after 33) |
| W8 | 40 (once your captures exist), 41, 42 | Q, then S |
| W9 | 44 | — |

**Dispatch prompt (verbatim, with the bracketed parts filled in):**

> You are implementing Task(s) [N, M] of `docs/superpowers/plans/2026-10-22-grambyedit-v1.md` in the repository at `C:\Users\GamerHagyma\Projects\GrambyEdit`.
>
> **Read first:** the plan's Global Constraints and Review Focus, each of your task sections in full, and every spec section they cite in `docs/EDITOR_DESIGN.md`.
>
> **Rules:**
> - Create or modify only the files listed under your tasks.
> - Never edit `src/core/types.ts`, `src/core/catalog-types.ts` or `src/core/generators/types.ts`.
> - Follow the steps in order: failing test first.
> - Do not commit.
> - If a contract looks wrong or a step is impossible, stop and report it instead of improvising.
>
> **Finish by** running `npm run typecheck && npx vitest run [your test paths]`. Paste the full output, then list every file you created or changed.

**After each dispatch (inline):**
1. Run `npm run typecheck && npx vitest run`.
2. Read the whole diff against the task's Files list and the spec.
3. Fix small problems inline, or re-dispatch once with exact findings. A second miss gets finished inline.
4. Commit each task separately with its commit message.

**Test snippets** sometimes omit imports that follow from a task's Interfaces block; add them. Each assertion's values are the requirement.

**Browser verification (inline viewport and tool tasks):**
1. Start the `dev` configuration from `.claude/launch.json` with the preview tool.
2. Drive the page through the dev-only `window.__ge` debug API (Task 13).
3. Check the console for errors and take a screenshot.

---

## Milestone M0 — Foundations

### Task 1: Bootstrap the repository and toolchain

**Owner:** Inline

**Files:**
- Create: `.gitignore`, `.prettierrc.json`, `.prettierignore`, `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `src/ui/credits.ts`, `tests/ui/app.test.tsx`, `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `.claude/launch.json`
- Modify: `README.md` (new top section and a Credits section)

**Interfaces:**
- Produces:
  - npm scripts: `dev`, `build` (`vite build`), `preview`, `test` (`vitest run`), `typecheck` (`tsc --noEmit`), `format` / `format:check` (Prettier over `src tests scripts` and root configs), and `assets` (`tsx scripts/build-assets.ts`). Until Task 7, the `assets` script is a stub that prints `assets: nothing to build yet` and exits 0.
  - `export const CREDITS: string` (`src/ui/credits.ts`).
  - `export function App(): JSX.Element` (`src/ui/App.tsx`).

- [ ] **Step 1: Initialise git and ignore rules.** Run `git init -b main`.
  - `.gitignore`: `node_modules/`, `dist/`, `public/assets/`, `tools/__pycache__/`, `.vite/`, `playwright-report/`, `test-results/`, `*.log`.
  - `.prettierignore`: `data/`, `docs/`, `meshes/`, `vendor/`, `tools/`, `captures/`, `public/assets/`, `dist/`, `*.md`, `package-lock.json`.
  - `.prettierrc.json`: `{ "singleQuote": true, "printWidth": 100, "trailingComma": "all" }`.
- [ ] **Step 2: Pin dependencies.**
  1. Run `npm view <name> version` for `three preact @preact/signals typescript vite @preact/preset-vite vitest jsdom @testing-library/preact fake-indexeddb @playwright/test tsx prettier @types/three @types/node`.
  2. Write `package.json` with those exact versions: the first three as dependencies, the rest as devDependencies. Add `"type": "module"` and `"engines": { "node": ">=24" }`.
  3. Run `npm install`.
- [ ] **Step 3: Configure TypeScript and Vite.**
  - `tsconfig.json`:
    - `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`;
    - `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "bundler"`;
    - `jsx: "react-jsx"`, `jsxImportSource: "preact"`;
    - `types: ["vite/client", "node", "vitest/globals"]`;
    - `include: ["src", "tests", "scripts", "vite.config.ts"]`.
  - `vite.config.ts`: `base: '/GrambyEdit/'`, `plugins: [preact()]`, `test: { globals: true, environment: 'node', include: ['tests/**/*.test.{ts,tsx}'] }`.
- [ ] **Step 4: Write the failing test** `tests/ui/app.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/preact';
import { App } from '../../src/ui/App';
import { CREDITS } from '../../src/ui/credits';

test('shell shows the product name and the Mumble Games credit', () => {
  render(<App />);
  expect(screen.getByText('GrambyEdit')).toBeTruthy();
  expect(screen.getByText(CREDITS)).toBeTruthy();
  expect(CREDITS).toBe(
    "Road to Gramby's and all part meshes © Mumble Games. Mesh exports: JuanCrakYT/RtG-Format and jirrob/GrambysWorkshop (MIT).",
  );
});
```

- [ ] **Step 5: Run it.** `npx vitest run tests/ui/app.test.tsx` → FAIL: `Cannot find module '../../src/ui/App'`.
- [ ] **Step 6: Implement** the following:
  - `CREDITS`;
  - `App()`: a header reading `GrambyEdit` and a footer `<small>{CREDITS}</small>`;
  - `src/main.tsx`: renders `<App/>` into `#app`;
  - `index.html`: `<div id="app"></div>` and `<script type="module" src="/src/main.tsx"></script>`.
- [ ] **Step 7: Run checks.** `npx vitest run` → PASS. `npm run typecheck` → no output. `npm run build` → `dist/index.html` exists.
- [ ] **Step 8: CI, Pages and preview config.**
  - `ci.yml` (on `push` and `pull_request`): checkout → setup-node 24 with npm cache → `npm ci` → `npm run assets` → `npm run typecheck` → `npm run format:check` → `npm test` → `npm run build`.
  - `pages.yml` (on push to `main` and `workflow_dispatch`; permissions `pages: write`, `id-token: write`): the same build, then `actions/upload-pages-artifact` with `path: dist`, then `actions/deploy-pages`. Use each action's current major version.
  - `.claude/launch.json`: `{ "version": "0.0.1", "configurations": [{ "name": "dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev", "--", "--port", "5173", "--strictPort"], "port": 5173 }] }`.
- [ ] **Step 9: README.** Add a top section with a two-line description and the commands (`npm install`, `npm run assets`, `npm run dev`, `npm test`). Add a **Credits** section with `CREDITS` verbatim.
- [ ] **Step 10: Format and commit.**
  1. `npm run format && npm run format:check` → clean.
  2. `git add -A && git commit -m "chore: bootstrap GrambyEdit toolchain"`.

  The first commit includes the existing research folders, because the build reads `data/` and `meshes/`.

### Task 2: Core contracts, test helpers and fixtures

**Owner:** Inline

**Files:**
- Create: `src/core/types.ts`, `src/core/catalog-types.ts`, `src/core/generators/types.ts`, `src/core/frames.ts`, `tests/helpers/doc.ts`, `tests/helpers/catalog.ts`, `tests/fixtures/corpus.ts`, `tests/fixtures/spec-codes.ts`, `tests/core/helpers.test.ts`, `tests/core/frames.test.ts`

**Interfaces:**
- Produces (exact; every later task imports these names):

```ts
// src/core/types.ts
export type PartId = number;
export type SocketId = string;
export type Uuid = string;
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type RGB = readonly [number, number, number];
export type CFrame12 = readonly [number, number, number, number, number, number, number, number, number, number, number, number];
export type ConnTarget =
  | { readonly kind: 'socket'; readonly part: PartId; readonly socket: SocketId }
  | { readonly kind: 'point'; readonly part: PartId; readonly uuid: Uuid }
  | { readonly kind: 'raw'; readonly triple: readonly Json[] };
export interface Conn { readonly self: SocketId; readonly target: ConnTarget }
export interface Point { readonly uuid: Uuid; readonly partName: string; readonly cframe: CFrame12 }
export interface Part {
  readonly id: PartId; readonly type: string; readonly conns: readonly Conn[];
  readonly props: Readonly<Record<string, Json>>; readonly points: ReadonlyMap<Uuid, Point> | null;
}
export interface Doc {
  readonly parts: ReadonlyMap<PartId, Part>; readonly order: readonly PartId[];
  readonly layout: ReadonlyMap<PartId, CFrame12>; readonly nextId: PartId;
}
export const EMPTY_DOC: Doc; // no parts, nextId 1
export type Severity = 'error' | 'warning' | 'info';
export type IssueCode = 'E-REF' | 'E-UUID' | 'E-MATE' | 'E-TEAR' | 'E-POINT-SHARED' | 'E-CODE-LIMIT'
  | 'W-SOCKET-UNKNOWN' | 'W-TYPE-UNKNOWN' | 'W-CYCLE' | 'W-PART-LIMIT'
  | 'I-POINT-UNUSED' | 'I-NO-ANCHOR' | 'I-RELAY-UNMOUNTED' | 'I-ROLE';
export interface Issue { readonly code: IssueCode; readonly severity: Severity; readonly parts: readonly PartId[]; readonly message: string }
export type Verdict = { readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string };
export interface Limits { readonly codeChars: number; readonly partSoftCap: number; readonly partWarn: number }
export const DEFAULT_LIMITS: Limits; // { codeChars: 8_000_000, partSoftCap: 8_000, partWarn: 16_000 }
export type PointKey = `${number}:${string}`;

// src/core/catalog-types.ts
export type Vec3 = readonly [number, number, number];
export const CATEGORIES: readonly ['Structure', 'Vehicle', 'Logic', 'Sensors & Input', 'Motion', 'Weapons', 'Fun & Misc'];
export type Category = (typeof CATEGORIES)[number];
export type SocketRole = 'input' | 'output' | 'conductor' | 'mount' | 'socket' | null;
export type FrameSource = 'captured' | 'workshop' | 'approx';
export interface SocketDef {
  readonly side: 'child' | 'parent' | 'both'; readonly role: SocketRole; readonly name: string | null;
  readonly piece: string | null; readonly frame: CFrame12; readonly frameSource: FrameSource;
}
export interface MeshRef { readonly id: number; readonly min: Vec3; readonly max: Vec3 }
export interface PartDef {
  readonly type: string; readonly category: Category; readonly tooltip: string | null;
  readonly paintable: boolean; readonly corpusCount: number;
  readonly sockets: Readonly<Record<SocketId, SocketDef>>;
  readonly childSockets: readonly SocketId[]; readonly parentSockets: readonly SocketId[];
  readonly defaultMount: SocketId | null; readonly pieces: Readonly<Record<SocketId, string>> | null;
  readonly mainPartName: string;
  readonly subParts: Readonly<Record<string, { readonly cframe: CFrame12; readonly approx: boolean }>>;
  readonly props: readonly string[]; readonly mesh: MeshRef | null;
}
export type PropWidget = 'bool' | 'number' | 'int' | 'string' | 'rgb' | 'key' | 'text' | 'orientation';
export interface PropMeta {
  readonly widget: PropWidget; readonly label: string; readonly step?: number; readonly min?: number;
  readonly max?: number; readonly default?: Json; readonly description?: string;
}
export interface Conventions {
  readonly mating: 'rx180' | 'rz180';
  readonly orientationOrder: 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX';
  readonly orientationOnPoints: boolean;
}
export interface Catalog {
  readonly version: string; readonly parts: Readonly<Record<string, PartDef>>;
  readonly pairs: Readonly<Record<string, number>>; readonly propMeta: Readonly<Record<string, PropMeta>>;
  readonly conventions: Conventions;
}
export function pairKey(childType: string, childSocket: SocketId, parentType: string, parentSocket: SocketId): string;
export interface MeshGroup { readonly subPart: string; readonly color: RGB; readonly paintable: boolean; readonly start: number; readonly count: number }
export interface MeshEntry {
  readonly type: string; readonly vertexOffset: number; readonly vertexCount: number;
  readonly indexOffset: number; readonly indexCount: number; readonly groups: readonly MeshGroup[];
}
export interface Manifest {
  readonly version: string;
  readonly sections: { readonly positions: readonly [number, number]; readonly normals: readonly [number, number];
    readonly colors: readonly [number, number]; readonly indices: readonly [number, number] }; // [byteOffset, byteLength]
  readonly meshes: readonly MeshEntry[];
}

// src/core/generators/types.ts
export type ShapeId = 'line' | 'grid' | 'box' | 'ring' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'arc' | 'helix' | 'stairs' | 'text';
export type GenFill = 'solid' | 'shell' | 'frame' | 'outline';
export type GenOrient = 'fixed' | 'outward' | 'tangent';
export interface ShapeParam { readonly key: string; readonly label: string; readonly kind: 'number' | 'int' | 'text'; readonly default: number | string; readonly min?: number; readonly max?: number }
export interface ShapeInput { readonly params: Readonly<Record<string, number | string>>; readonly fill: GenFill; readonly orient: GenOrient; readonly spacing: number }
export interface ShapeDef { readonly id: ShapeId; readonly label: string; readonly params: readonly ShapeParam[]; readonly fills: readonly GenFill[]; generate(input: ShapeInput): CFrame12[] }

// src/core/frames.ts — shared by the Workbench (Task 20) and the shapes (Tasks 35–36)
export function frameFromNormal(pos: Vec3, normal: Vec3): CFrame12;
// +Y = the normalised normal; local X = the first of (1,0,0), (0,0,1), (0,1,0) with the smallest |dot| with +Y,
// projected onto the plane and normalised; Z = X × Y; rows written in CFrame12 order; -0 normalised to 0
```

- Produces (test helpers):
  - `tests/helpers/doc.ts`:
    - `part(id, type, conns = [], props = {}, points = null)` — `points` is a `Point[]` turned into a Map.
    - `sock(self, part, socket)`, `mount(self, host, uuid)`.
    - `pt(uuid, cframe = [0,0,0, 1,0,0, 0,1,0, 0,0,1], partName = 'Part')`.
    - `docOf(...parts)` — order as given, `nextId` = max id + 1, empty layout.
    - `chainDoc(n)` — `Part` 1 is a root; part i+1 has `[sock('1', i, '6')]`.
  - `tests/helpers/catalog.ts`: `export const MINI: Catalog`, with these parts:
    - `Part`, `Connector`, `Base`, `Gate-AND`, `Gate-NOT`, `Switch`, `Light`, `Splitter_2`, `Wire`, `Mag`, `ShortStick`, `Anchor`;
    - `Chassis` (no child sockets, so `defaultMount: null`);
    - `Roof` (subPart `Glass` at `[0,1,0, 1,0,0, 0,1,0, 0,0,1]`, `approx: true`).

    Sockets, roles and pieces follow `data/part_catalog.json` with the spec §5.4 fixes applied; socket lists are sorted numerically. Props and `paintable` follow the catalog props (so `Mag` has only `Bullets` and is not paintable). `corpusCount` comes from `data/corpus_stats.json` `part_frequency`. The `Part` frames are the table below (`frameSource: 'workshop'`). Every other socket gets an axis-aligned face frame (`frameSource: 'approx'`). `propMeta` covers `RGB` (`rgb`), `OrientationX/Y/Z` (`orientation`, step 45), `Bullets` (`int`) and `Activated` (`bool`), labelled `Color`, `Orientation X/Y/Z`, `Bullets` and `Activated`. `pairs` is `{}`. The conventions are `{ mating: 'rx180', orientationOrder: 'XYZ', orientationOnPoints: true }`.
  - `tests/fixtures/corpus.ts`: `corpusCodes(): string[]` — the 185 lines of `data/corpus/wiki_codes.txt` that decode with `Buffer` + `JSON.parse` into an array.
  - `tests/fixtures/spec-codes.ts`: `APPENDIX_A_CODE`, `APPENDIX_A_JSON`, `APPENDIX_B_JSON`, `SMALLEST_CODE`, `SMALLEST_JSON`, copied from spec Appendix A/B (`docs/RTG_BLUEPRINT_FORMAT.md`).

`Part` outward frames (exact):

| socket | CFrame12 |
|---|---|
| 1 | `[0,-0.5,0, 1,0,0, 0,-1,0, 0,0,-1]` |
| 2 | `[0.5,0,0, 0,1,0, 0,0,1, 1,0,0]` |
| 3 | `[-0.5,0,0, 0,-1,0, 0,0,1, -1,0,0]` |
| 4 | `[0,0,-0.5, 1,0,0, 0,0,1, 0,-1,0]` |
| 5 | `[0,0,0.5, -1,0,0, 0,0,1, 0,1,0]` |
| 6 | `[0,0.5,0, 1,0,0, 0,1,0, 0,0,1]` |

- [ ] **Step 1: Write the failing test** `tests/core/helpers.test.ts`:

```ts
import { DEFAULT_LIMITS, EMPTY_DOC } from '../../src/core/types';
import { pairKey } from '../../src/core/catalog-types';
import { docOf, part, mount, pt, chainDoc } from '../helpers/doc';
import { MINI } from '../helpers/catalog';
import { corpusCodes } from '../fixtures/corpus';

test('constants', () => {
  expect(DEFAULT_LIMITS).toEqual({ codeChars: 8_000_000, partSoftCap: 8_000, partWarn: 16_000 });
  expect(EMPTY_DOC.order).toEqual([]);
  expect(EMPTY_DOC.nextId).toBe(1);
  expect(pairKey('Splitter_2', '3', 'Switch', '2')).toBe('Splitter_2.3>Switch.2');
});
test('docOf and chainDoc', () => {
  const d = docOf(part(1, 'Base', [], {}, [pt('{a}')]), part(2, 'Switch', [mount('3', 1, '{a}')]));
  expect(d.order).toEqual([1, 2]);
  expect(d.nextId).toBe(3);
  expect(d.parts.get(2)!.conns[0].target).toEqual({ kind: 'point', part: 1, uuid: '{a}' });
  expect(chainDoc(3).parts.get(3)!.conns).toEqual([{ self: '1', target: { kind: 'socket', part: 2, socket: '6' } }]);
});
test('MINI applies the role fixes and the outward Part frames', () => {
  expect(MINI.parts.Switch.sockets['2'].role).toBe('output');
  expect(MINI.parts.Wire.sockets['1'].role).toBe('conductor');
  expect(MINI.parts.Part.sockets['6'].frame).toEqual([0, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  expect(MINI.parts.Chassis.defaultMount).toBeNull();
});
test('corpus fixture holds the 185 parseable codes', () => expect(corpusCodes()).toHaveLength(185));
```

```ts
// tests/core/frames.test.ts
import { frameFromNormal } from '../../src/core/frames';
test('+Y follows the normal and roll snaps to part axes', () => {
  expect(frameFromNormal([0.5, 0, 0], [1, 0, 0])).toEqual([0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0]);
  expect(frameFromNormal([0, -0.5, 0], [0, -2, 0])).toEqual([0, -0.5, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1]);
  expect(frameFromNormal([0, 0, 0], [0, 1, 0])).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/helpers.test.ts tests/core/frames.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Write the contract files and helpers** exactly as specified above.
- [ ] **Step 4: Run them again.** `npx vitest run tests/core/helpers.test.ts tests/core/frames.test.ts` → PASS. `npm run typecheck` → clean.
- [ ] **Step 5: Commit.** `git commit -m "feat(core): contracts, frames helper, test helpers and fixtures"`

### Task 3: Codec, uuids and CFrame utilities

**Owner:** Haiku (dispatch A, first)

**Files:**
- Create: `src/core/codec.ts`, `src/core/uuid.ts`, `src/core/cframe.ts`
- Test: `tests/core/codec.test.ts`, `tests/core/uuid.test.ts`, `tests/core/cframe.test.ts`

**Interfaces:**
- Consumes: `Json`, `Uuid`, `CFrame12` (Task 2); the fixtures `SMALLEST_CODE`, `SMALLEST_JSON`, `APPENDIX_A_CODE`, `APPENDIX_A_JSON`.
- Produces:

```ts
// codec.ts
export type DecodeError = { kind: 'bad-base64'; offset: number } | { kind: 'bad-utf8' } | { kind: 'bad-json'; message: string } | { kind: 'not-an-array' };
export function decode(text: string): { ok: true; value: Json[] } | { ok: false; error: DecodeError };
export function encode(entries: readonly Json[]): string;
export function utf8Length(s: string): number;
// uuid.ts
export function newUuid(): Uuid;
export function isUuid(s: string): boolean; // /^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i
// cframe.ts
export const IDENTITY_CF: CFrame12; // [0,0,0, 1,0,0, 0,1,0, 0,0,1]
export function cfToMatrix4(cf: CFrame12, out?: Matrix4): Matrix4;
export function matrix4ToCf(m: Matrix4): CFrame12;
export function roundCf(cf: CFrame12, posDecimals: number, rotDecimals: number): CFrame12;
export function isCFrame12(v: unknown): v is CFrame12;
```

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/core/codec.test.ts
import { decode, encode, utf8Length } from '../../src/core/codec';
import { SMALLEST_CODE, SMALLEST_JSON, APPENDIX_A_CODE, APPENDIX_A_JSON } from '../fixtures/spec-codes';

test('decodes spec Appendix A', () => expect(decode(APPENDIX_A_CODE)).toEqual({ ok: true, value: APPENDIX_A_JSON }));
test('decode tolerates wrapped, unpadded and URL-safe codes', () => {
  const wrapped = SMALLEST_CODE.replace(/=+$/, '').replace(/(.{20})/g, '$1\r\n  ');
  expect(decode(wrapped)).toEqual({ ok: true, value: SMALLEST_JSON });
  expect(decode(SMALLEST_CODE.replace(/\+/g, '-').replace(/\//g, '_'))).toEqual({ ok: true, value: SMALLEST_JSON });
});
test('accepts a raw JSON paste', () =>
  expect(decode('  [["Part",[],[]]] ')).toEqual({ ok: true, value: [['Part', [], []]] }));
test('reports typed errors', () => {
  expect(decode('W1si*')).toEqual({ ok: false, error: { kind: 'bad-base64', offset: 4 } });
  expect(decode('W1siQ')).toEqual({ ok: false, error: { kind: 'bad-base64', offset: 4 } });
  expect(decode(btoa('{"a":1}'))).toEqual({ ok: false, error: { kind: 'not-an-array' } });
  const r = decode(btoa('[1,'));
  expect(r.ok === false && r.error.kind).toBe('bad-json');
  expect(decode(btoa(String.fromCharCode(0xff, 0xfe)))).toEqual({ ok: false, error: { kind: 'bad-utf8' } });
});
test('encode writes compact, padded, standard base64 that round-trips UTF-8', () => {
  expect(encode([['Part', [], []]])).toBe(btoa('[["Part",[],[]]]'));
  const entries = [['Note', [], { Text: 'héllo ✓' }]];
  const code = encode(entries);
  expect(code).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  expect(code.length % 4).toBe(0);
  expect(decode(code)).toEqual({ ok: true, value: entries });
});
test('encodes an 8M-char code in under 1.5 s', () => {
  const big = Array.from({ length: 160_000 }, (_, i) => ['Part', [['1', '6', i + 1]], { RGB: [1, 2, 3] }]);
  const t = performance.now();
  const code = encode(big);
  expect(performance.now() - t).toBeLessThan(1500);
  expect(code.length).toBeGreaterThan(8_000_000);
});
test('utf8Length', () => expect(utf8Length('é✓a')).toBe(6));
```

```ts
// tests/core/uuid.test.ts
import { newUuid, isUuid } from '../../src/core/uuid';
test('newUuid gives distinct braced uuids', () => {
  const all = new Set(Array.from({ length: 1000 }, newUuid));
  expect(all.size).toBe(1000);
  for (const u of all) { expect(u).toHaveLength(38); expect(isUuid(u)).toBe(true); }
  expect(isUuid('{uuid1}')).toBe(false);
  expect(isUuid('{83dc86a4-3a11-4c20-8b4e-5ecf518b40d0}')).toBe(true);
});
```

```ts
// tests/core/cframe.test.ts
import { Matrix4, Vector3 } from 'three';
import { IDENTITY_CF, cfToMatrix4, matrix4ToCf, roundCf, isCFrame12 } from '../../src/core/cframe';
test('CFrame12 rows map onto Matrix4', () => {
  const cf = [0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0] as const; // Part socket 2: local +Y -> world +X
  const m = cfToMatrix4(cf);
  expect(new Vector3(0, 1, 0).applyMatrix4(m).toArray()).toEqual([1.5, 0, 0]);
  expect(matrix4ToCf(m)).toEqual(cf);
  expect(matrix4ToCf(new Matrix4())).toEqual(IDENTITY_CF);
});
test('roundCf rounds and never writes -0', () => {
  const r = roundCf([1.234567, -0.00001, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 4, 5);
  expect(r.slice(0, 2)).toEqual([1.2346, 0]);
  expect(Object.is(r[1], 0)).toBe(true);
});
test('isCFrame12', () => {
  expect(isCFrame12(IDENTITY_CF)).toBe(true);
  expect(isCFrame12([0, 0, 0])).toBe(false);
  expect(isCFrame12([...IDENTITY_CF.slice(0, 11), NaN])).toBe(false);
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/codec.test.ts tests/core/uuid.test.ts tests/core/cframe.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement** the three files.
  - **`decode`:**
    - Text that starts with `[` after trimming is parsed as JSON.
    - Otherwise: strip all whitespace; map `-`→`+` and `_`→`/`; drop trailing `=`.
    - The first character outside the alphabet gives `bad-base64` at its offset; a length with `% 4 === 1` gives `bad-base64` at offset `length − 1`.
    - Decode with a table-driven base64 decoder, then `new TextDecoder('utf-8', { fatal: true })`, then `JSON.parse`, then `Array.isArray`.
  - **`encode`:** `JSON.stringify` → `TextEncoder` → table-driven base64 with padding. Never call `btoa` on large strings.
  - **`cfToMatrix4`:** `m.set(r00,r01,r02,x, r10,r11,r12,y, r20,r21,r22,z, 0,0,0,1)`.
  - **`roundCf`:** `Math.round(v·10^d)/10^d`, then `+ 0` to turn `-0` into `0`.
- [ ] **Step 4: Run them again.** Same command → PASS. Then `npm run typecheck` → clean.
- [ ] **Step 5: Commit** (inline, after review): `git commit -m "feat(core): codec, uuids and CFrame utilities"`

### Task 4: Document conversion, share-text helpers and invariants

**Owner:** Haiku (dispatch A, second)

**Files:**
- Create: `src/core/doc.ts`, `src/core/share.ts`, `src/core/invariants.ts`, `tests/helpers/import.ts`
- Test: `tests/core/doc.test.ts`, `tests/core/share.test.ts`, `tests/core/invariants.test.ts`

**Interfaces:**
- Consumes: Task 2 types, helpers and fixtures; Task 3 `decode`, `encode`.
- Produces:

```ts
// doc.ts
export type ImportError = { entry: number; reason: string };
export function fromEntries(entries: readonly Json[]): { ok: true; doc: Doc } | { ok: false; error: ImportError };
export function toEntries(doc: Doc): Json[];
export function entryOf(part: Part, indexOf: (id: PartId) => number): Json; // indexOf gives the 1-based export index
export function orderIndex(doc: Doc): ReadonlyMap<PartId, number>; // 0-based position; memoised per Doc (WeakMap)
export function normalizeEntries(entries: readonly Json[]): Json[]; // F3/F4 normalisation, for comparisons only
// share.ts
export function parseShareText(text: string): { ok: true; doc: Doc } | { ok: false; message: string };
export function toShareCode(doc: Doc): string; // encode(toEntries(doc))
// invariants.ts
export function checkInvariants(doc: Doc): string[]; // [] when I1–I4 hold
// tests/helpers/import.ts
export function importCode(code: string): Doc; // parseShareText; throws on failure
```

**Rules** (spec §6.2):
- **Ids:** parts get ids 1..N in entry order; `nextId` is N+1; the layout starts empty.
- **Connection targets:**
  - The third element is an integer in 1..N and differs from the entry's own index → a target. It is a `point` target when the second element is a string starting with `{`, otherwise a `socket` target.
  - Anything else becomes `raw`, keeping the original triple.
- **Normalisation and props:** F3–F6 apply. `EphemeralAttachments` is written last; an empty `[]` is kept.
- **F10 reasons, exactly:**
  - `name is not a string`
  - `connections is not an array`
  - `connection ${i} is not a 3-element array`
  - `props is neither an object nor []`
  - `EphemeralAttachments ${uuid} is not {partName, cframe[12]}`
- **`parseShareText` messages, exactly:**
  - `Not a valid share code: invalid base64 at character ${offset + 1}.`
  - `Not a valid share code: the decoded bytes are not UTF-8 text.`
  - `Not a valid share code: ${message}`
  - `Not a valid share code: the data is not a list of parts.`
  - `Entry #${entry + 1}: ${reason}.`

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/core/doc.test.ts
import { fromEntries, toEntries, normalizeEntries } from '../../src/core/doc';
import { decode, encode } from '../../src/core/codec';
import { corpusCodes } from '../fixtures/corpus';
import { APPENDIX_B_JSON } from '../fixtures/spec-codes';
import type { Json } from '../../src/core/types';

const imp = (raw: Json[]) => { const r = fromEntries(raw); if (!r.ok) throw new Error(r.error.reason); return r.doc; };
const dec = (code: string) => { const r = decode(code); if (!r.ok) throw new Error(r.error.kind); return r.value; };

test.each(corpusCodes().map((c, i) => [i, c] as const))('F9: corpus code %i round-trips', (_i, code) => {
  const raw = dec(code);
  expect(normalizeEntries(dec(encode(toEntries(imp(raw)))))).toEqual(normalizeEntries(raw));
});
test('Appendix B: points and mounts', () => {
  const d = imp(APPENDIX_B_JSON as Json[]);
  expect([...d.parts.get(1)!.points!.keys()]).toEqual(['{uuid1}', '{uuid2}']);
  expect(d.parts.get(2)!.conns[0]).toEqual({ self: '3', target: { kind: 'point', part: 1, uuid: '{uuid1}' } });
  expect(d.parts.get(4)!.conns[0]).toEqual({ self: '1', target: { kind: 'socket', part: 3, socket: '2' } });
});
test('int sockets become strings and {} props export as []', () =>
  expect(toEntries(imp([['Part', [], {}], ['Part', [[1, 6, 1]], []]]))).toEqual([['Part', [], []], ['Part', [['1', '6', 1]], []]]));
test('unknown types and props survive verbatim', () => {
  const raw: Json[] = [['FuturePart', [['9', '77', 2]], { Weird: { a: [1, 2] }, RGB: [1, 2, 3] }], ['Part', [], []]];
  expect(toEntries(imp(raw))).toEqual(raw);
});
test('bad indices and self-references stay raw and export verbatim', () => {
  const raw: Json[] = [['Part', [['1', '6', 9]], []], ['Part', [['1', '6', 2]], []]];
  const d = imp(raw);
  expect(d.parts.get(1)!.conns[0].target).toEqual({ kind: 'raw', triple: ['1', '6', 9] });
  expect(d.parts.get(2)!.conns[0].target.kind).toBe('raw');
  expect(toEntries(d)).toEqual(raw);
});
test('EphemeralAttachments [] survives and absent stays absent', () => {
  const raw: Json[] = [['Base', [], { EphemeralAttachments: [] }], ['Base', [], []]];
  expect(toEntries(imp(raw))).toEqual(raw);
});
test('F10 aborts unrepresentable entries with the entry index', () => {
  expect(fromEntries([['Part', [], []], [42, [], []]])).toEqual({ ok: false, error: { entry: 1, reason: 'name is not a string' } });
  expect(fromEntries([['Part', [['1', '6']], []]])).toEqual({ ok: false, error: { entry: 0, reason: 'connection 0 is not a 3-element array' } });
});
test('export indices follow the current order', () => {
  const d = imp([['Part', [], []], ['Part', [], []], ['Part', [['1', '6', 2]], []]]);
  const without1 = { ...d, order: [2, 3], parts: new Map([...d.parts].filter(([id]) => id !== 1)) };
  expect(toEntries(without1)).toEqual([['Part', [], []], ['Part', [['1', '6', 1]], []]]);
});
```

```ts
// tests/core/share.test.ts
import { parseShareText, toShareCode } from '../../src/core/share';
import { APPENDIX_A_CODE } from '../fixtures/spec-codes';
test('round-trips Appendix A', () => {
  const r = parseShareText(APPENDIX_A_CODE);
  expect(r.ok && r.doc.order.length).toBe(12);
  expect(r.ok && parseShareText(toShareCode(r.doc)).ok).toBe(true);
});
test('human-readable failures', () => {
  expect(parseShareText('W1si*')).toEqual({ ok: false, message: 'Not a valid share code: invalid base64 at character 5.' });
  expect(parseShareText('[[42,[],[]]]')).toEqual({ ok: false, message: 'Entry #1: name is not a string.' });
});
```

```ts
// tests/core/invariants.test.ts
import { checkInvariants } from '../../src/core/invariants';
import { docOf, part, sock } from '../helpers/doc';
test('flags dangling targets; clean docs pass', () => {
  expect(checkInvariants(docOf(part(1, 'Part', [sock('1', 9, '6')])))).toEqual(['I2: part 1 conn 0 targets missing part 9']);
  expect(checkInvariants(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')])))).toEqual([]);
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/doc.test.ts tests/core/share.test.ts tests/core/invariants.test.ts` → FAIL.
- [ ] **Step 3: Implement** `doc.ts`, `share.ts`, `invariants.ts` and `tests/helpers/import.ts`. Invariant messages use the forms `I1: …`, `I2: part ${id} conn ${i} targets missing part ${t}`, `I4: layout holds non-root part ${id}`.
- [ ] **Step 4: Run them again.** Same command → PASS (all 185 F9 cases included). Then `npm run typecheck`.
- [ ] **Step 5: Commit:** `git commit -m "feat(core): document import/export, share text and invariants"`

### Task 5: OBJ/MTL parsers and sub-part names

**Owner:** Haiku (dispatch B, first)

**Files:**
- Create: `scripts/lib/obj.ts`, `scripts/lib/mtl.ts`, `scripts/lib/names.ts`
- Test: `tests/scripts/obj.test.ts`, `tests/scripts/mtl.test.ts`, `tests/scripts/names.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ObjGroup { material: string; start: number; count: number } // index range into `indices`
export interface ObjMesh { positions: Float32Array; normals: Float32Array; indices: Uint32Array; groups: ObjGroup[]; min: [number, number, number]; max: [number, number, number] }
export function parseObj(text: string): ObjMesh;
export function parseMtl(text: string): Record<string, [number, number, number]>; // material -> Kd
export function materialBase(usemtl: string): string; // strips one ".NNN" suffix
export function subPartName(usemtl: string, partType: string): string;
```

**Rules:**
- Faces are `v/vt/vn`. All 120 meshes are triangles, but polygons are triangulated as fans anyway.
- One output vertex per distinct (v, vn) pair.
- Each `usemtl` opens a new group.
- `min`/`max` cover every `v` line.
- Faces without normals get the face normal.
- `subPartName` = `materialBase`, minus the trailing `Mtl`, minus one trailing `1`. If the result equals `partType` ignoring case, return `partType`.

- [ ] **Step 1: Write the failing tests.**

```ts
import { readFileSync } from 'node:fs';
import { parseObj } from '../../scripts/lib/obj';
import { parseMtl } from '../../scripts/lib/mtl';
import { subPartName } from '../../scripts/lib/names';
const read = (p: string) => readFileSync(p, 'utf8');

test('Part.obj is the unit cube in one group', () => {
  const m = parseObj(read('meshes/rtg-format/Part/Part.obj'));
  m.min.forEach((v) => expect(v).toBeCloseTo(-0.5, 5));
  m.max.forEach((v) => expect(v).toBeCloseTo(0.5, 5));
  expect(m.groups.map((g) => g.material)).toEqual(['Part1Mtl.003']);
  expect(m.indices.length).toBe(36);
});
test('Gate-AND keeps its three material groups in file order', () =>
  expect(parseObj(read('meshes/rtg-format/Gate-AND/Gate-AND.obj')).groups.map((g) => g.material))
    .toEqual(['Handle1Mtl.017', 'Inputb1Mtl', 'Output1Mtl.001']));
test('every mesh bbox matches data/part_catalog.json within 1e-4', () => {
  const cat = JSON.parse(read('data/part_catalog.json')).parts;
  let n = 0;
  for (const p of Object.values<any>(cat)) {
    if (!p.mesh?.obj) continue;
    n++;
    const m = parseObj(read(p.mesh.obj));
    m.min.forEach((v, i) => expect(Math.abs(v - p.mesh.min[i])).toBeLessThan(1e-4));
    m.max.forEach((v, i) => expect(Math.abs(v - p.mesh.max[i])).toBeLessThan(1e-4));
  }
  expect(n).toBe(120);
});
test('quads are fan-triangulated and get a face normal', () => {
  const m = parseObj('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n');
  expect([...m.indices]).toEqual([0, 1, 2, 0, 2, 3]);
  expect([...m.normals.slice(0, 3)]).toEqual([0, 0, 1]);
});
test('reads Kd per material', () =>
  expect(parseMtl(read('meshes/workshop/Gate-AND/Gate-AND.mtl')).Inputb1Mtl).toEqual([0.373615, 0.00552174, 0.00552174]));
test.each([
  ['Glass1Mtl.004', 'Roof', 'Glass'], ['Door1Mtl.007', 'Trunk', 'Door'], ['Base1Mtl', 'Base', 'Base'],
  ['Longstick1Mtl', 'LongStick', 'LongStick'], ['Output21Mtl.001', 'Splitter_2', 'Output2'], ['Handle1Mtl.017', 'Gate-AND', 'Handle'],
])('subPartName(%s, %s) = %s', (m, t, want) => expect(subPartName(m, t)).toBe(want));
```

- [ ] **Step 2: Run them.** `npx vitest run tests/scripts` → FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run them again.** `npx vitest run tests/scripts` → PASS. Then `npm run typecheck`.
- [ ] **Step 5: Commit:** `git commit -m "feat(assets): OBJ/MTL parsers and sub-part names"`

### Task 6: Curation data

**Owner:** Haiku (dispatch B, second)

**Files:**
- Create: `data/curation/categories.json`, `data/curation/prop-meta.json`, `data/curation/roles-fix.json`
- Test: `tests/curation.test.ts`

**Interfaces:**
- Produces (file formats read by Task 7):
  - **`categories.json`:** `{ "<PartType>": "<Category>" }`, covering all 132 parts in `data/part_catalog.json`. Seed it from the folder names under `docs/community/RtG-Format/blocks/reference/`:
    - Structure: building blocks such as `Part`, `Connector*`, `Base`, `GlassBase`, the sticks, `Board`, `Cinderblock`, `Pipes`, `Bumper`, `Ramp`.
    - Vehicle: car parts such as `Chassis`, `Wheel`, `Tire`, `Seat`, `Door*`, `Hood`, `Trunk`, `Roof`, `GasCap`, `FuelTank`, `SteeringWheel`, `Wing`, `Spoiler`.
    - Logic: `Switch`, `Gate-*`, the splitters, `Wire`, `Looper`, `Delayer`, `Light`, `BrakeLight`, `Button`, `RemoteButton`, `Detacher`.
    - Sensors & Input: the `*Sensor` parts, `PressurePlate`, `TripWire`, `Camera`, `Recorder`.
    - Motion: `Servo*`, `Piston`, `Thruster`, `Propeller`, the gyros, the engines, `Leafblower`, `Rocket`, `Balloon`, `SpringJuice`, `Anchor`.
    - Weapons: guns, `Cannon*`, `Grenade`, `Mag`, `Joust`, `RiotShield`, `Sledge`.
    - Fun & Misc: everything else.
  - **`prop-meta.json`:** `{ "<key>": PropMeta }` for every key in `data/props_schema.json` except `EphemeralAttachments`.
    - Widgets:
      - `bool` for bool keys;
      - `rgb` for `RGB`;
      - `key` for `ActivationKey`;
      - `text` for `Text`;
      - `orientation` with `step: 45` for `OrientationX/Y/Z`;
      - `int` for `Bullets`, `Quantity`, `ImageId`, `Volume`, `Channel`, `ActivationSpeed`, `ActivationHeight`;
      - `string` for `CustomTrack`;
      - `number` with `step: 0.1` for everything else.
    - Labels are Title Case with spaces (`DelayDeactivation` → `Delay Deactivation`).
  - **`roles-fix.json`**, exactly:

```json
{ "Switch": { "2": "output" }, "Button": { "2": "output" }, "RemoteButton": { "2": "output" },
  "Splitter_4": { "1": "output", "2": "output", "3": "input", "4": "input" },
  "Wire": { "1": "conductor", "2": "conductor", "3": "conductor", "4": "conductor" },
  "Looper": { "1": "output" } }
```

- [ ] **Step 1: Write the failing test** `tests/curation.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { CATEGORIES } from '../src/core/catalog-types';
const j = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const catalog = j('data/part_catalog.json').parts;
const schema = j('data/props_schema.json').props;

test('every catalog part has exactly one valid category', () => {
  const cats = j('data/curation/categories.json');
  expect(Object.keys(cats).sort()).toEqual(Object.keys(catalog).sort());
  for (const c of Object.values(cats)) expect(CATEGORIES).toContain(c);
});
test('prop meta covers every observed key with a type-compatible widget', () => {
  const meta = j('data/curation/prop-meta.json');
  for (const [key, s] of Object.entries<any>(schema)) {
    if (key === 'EphemeralAttachments') continue;
    const w = meta[key]?.widget;
    expect(w, key).toBeDefined();
    const types = Object.keys(s.json_types);
    if (types.includes('bool')) expect(w, key).toBe('bool');
    if (types.includes('str')) expect(['string', 'key', 'text'], key).toContain(w);
  }
  expect(meta.RGB.widget).toBe('rgb');
  expect(meta.OrientationY).toMatchObject({ widget: 'orientation', step: 45 });
  expect(meta.DelayDeactivation.label).toBe('Delay Deactivation');
});
test('roles-fix is exactly the spec §5.4 table', () =>
  expect(j('data/curation/roles-fix.json')).toEqual({
    Switch: { 2: 'output' }, Button: { 2: 'output' }, RemoteButton: { 2: 'output' },
    Splitter_4: { 1: 'output', 2: 'output', 3: 'input', 4: 'input' },
    Wire: { 1: 'conductor', 2: 'conductor', 3: 'conductor', 4: 'conductor' }, Looper: { 1: 'output' },
  }));
```

- [ ] **Step 2: Run it.** `npx vitest run tests/curation.test.ts` → FAIL.
- [ ] **Step 3: Write the three JSON files.**
- [ ] **Step 4: Run it again.** `npx vitest run tests/curation.test.ts` → PASS.
- [ ] **Step 5: Commit:** `git commit -m "data: curation tables (categories, prop meta, role fixes)"`

### Task 7: Asset build

**Owner:** Inline

**Files:**
- Create: `src/core/approx.ts`, `src/core/socket-geometry.ts`, `scripts/lib/pack.ts`, `scripts/lib/catalog.ts`, `scripts/build-assets.ts` (replaces the stub), `data/curation/paint-groups.json` (`{}`), `data/curation/part-names.json` (`{}`), `tests/helpers/real-catalog.ts`
- Test: `tests/core/approx.test.ts`, `tests/core/socket-geometry.test.ts`, `tests/scripts/build-assets.test.ts`

**Interfaces:**
- Consumes: Task 5 parsers, Task 6 curation, Task 3 `decode`/`cfToMatrix4`/`matrix4ToCf`, Task 2 types.
- Produces:

```ts
// src/core/approx.ts
export function approxSocketFrame(input: { min: Vec3; max: Vec3; socket: SocketId; side: 'child' | 'parent' | 'both'; name: string | null; parentSockets: readonly SocketId[] }): CFrame12;
export const PLACEHOLDER_BOX: { readonly min: Vec3; readonly max: Vec3 }; // ±0.5
// src/core/socket-geometry.ts
export interface SocketGeometryFile {
  format: 'grambyedit-sockets'; version: 1; captured: string; method: string; units: 'studs';
  cframeFormat: 'roblox-components'; frameConvention: 'outward-y'; relativeTo: 'mesh-origin';
  parts: Record<string, { sockets: Record<SocketId, { cframe: CFrame12 }>; subParts?: Record<string, CFrame12> }>;
}
export function emptySocketGeometry(): SocketGeometryFile;
export function parseSocketGeometry(json: unknown): { ok: true; file: SocketGeometryFile } | { ok: false; error: string };
export function applySocketGeometry(cat: Catalog, file: SocketGeometryFile): Catalog; // unchanged sockets keep identity
// scripts/build-assets.ts
export async function buildAssets(opts: { root: string; outDir: string | null }): Promise<{ catalog: Catalog; manifest: Manifest; bin: Uint8Array }>;
// tests/helpers/real-catalog.ts
export function realCatalog(): Promise<Catalog>; // memoised buildAssets({ root: '.', outDir: null }).catalog
```

**`approxSocketFrame`, exactly:**
- Face rotations reuse the `Part` socket rotations:

  | face | rotation (from) |
  |---|---|
  | +Y | identity |
  | −Y | `Rx(180°)` |
  | +X | `Part` socket 2 |
  | −X | `Part` socket 3 |
  | +Z | `Part` socket 5 |
  | −Z | `Part` socket 4 |

  The position is the face centre of the bbox.
- `side: 'child'` → the −Y face.
- Otherwise, a `name` containing `Top`, `Bottom`, `Left`, `Right`, `Front` or `Back` (case-insensitive) maps to the +Y, −Y, −X, +X, −Z or +Z face respectively.
- Otherwise the face is `[+Y, +X, −X, +Z, −Z, −Y][i % 6]`, where `i` is the socket's index in `parentSockets`. The centre shifts by `0.2 × floor(i / 6)` along the face's local +X.

**Build rules, exactly:**
1. **Parts:** the keys of `data/part_catalog.json` (132).
2. **Sockets:**
   - the union of catalog child and parent ids, with `side` set to `child`, `parent` or `both`;
   - `role` comes from the catalog; `Base`'s positional words become `'socket'`, and the catalog `name` is kept;
   - `roles-fix.json` overrides roles;
   - `piece` comes from the catalog `pieces`;
   - `childSockets` and `parentSockets` are sorted numerically (`['4', '6', '10']`), never in JSON key order.
3. **Frames:**
   - `data/socket_geometry.json` (if present) → `captured`;
   - else `Part`'s transforms from `vendor/grambys-workshop/Scripts/GrambyObjects/Part/Part.tscn`, read **row-major**, with socket 1 right-multiplied by `Rx(180°)` → `workshop`;
   - else `approxSocketFrame` → `approx`.
4. **`defaultMount`:** the first child socket with role `mount`; else the child socket with the highest catalog `corpus_count`; else `null`.
5. **`paintable`:** catalog props include `RGB`. **`props`:** the catalog prop keys.
6. **Mesh:** parse `meshes/rtg-format/<type>/<type>.obj`.
   - Group colors = `round(Kd × 255)` (linear), from `meshes/workshop/<type>/<type>.mtl` matched by `materialBase`; fall back to `[128,128,128]`.
   - The paintable group is the `paint-groups.json` override, else the group with the most triangles whose sub-part name does not start with `Input`, `Output`, `Glass`, `Screw` or `Light`.
7. **`subParts`:** each distinct sub-part name maps to the bbox centre of its triangles, with identity rotation and `approx: true`. Captured `subParts` override these with `approx: false`.
8. **`mainPartName`:** the `part-names.json` override, else the sub-part named like the type, else the largest group's sub-part, else the type.
9. **Metadata:**
   - `tooltip` is the non-empty `Tooltip` in `meshes/rtg-format/<type>/<type>.json`, else `null`;
   - `category` comes from `categories.json`;
   - `corpusCount` comes from `data/corpus_stats.json` `part_frequency` (default 0).
10. **`pairs`:** decode every line of `data/corpus/wiki_codes.txt`, skipping failures. Count `pairKey(childType, String(cs), parentType, String(ps))` for connections with an in-range integer index and a parent socket that is not a uuid.
11. **`propMeta`** comes from `prop-meta.json`. **`conventions`** comes from `data/conventions.json` if present, else `{ mating: 'rx180', orientationOrder: 'XYZ', orientationOnPoints: true }`.
12. **`parts.bin` sections, in order:**
    1. positions (f32 ×3, all meshes);
    2. normals (f32 ×3);
    3. colors (u8 ×4: r, g, b, then 255 when paintable else 0);
    4. indices (u16, local to each mesh).

    Manifest offsets are in bytes. `version` = the first 12 hex characters of SHA-256 over the catalog JSON plus the bin.
13. **Output:** write `catalog.json`, `parts.json`, `parts.bin` and `version.txt` to `outDir` (when non-null). Print a socket report: counts of captured / workshop / approx frames, and any frame more than 0.25 studs outside its bbox.

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/core/approx.test.ts
import { approxSocketFrame } from '../../src/core/approx';
const cube = { min: [-1, -1, -1], max: [1, 1, 1] } as const;
test('a named parent socket goes to its face', () =>
  expect(approxSocketFrame({ min: [-2, -0.25, -2], max: [2, 0.25, 2], socket: '5', side: 'parent', name: 'Top', parentSockets: ['1', '2', '4', '5', '6'] }))
    .toEqual([0, 0.25, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
test('a child socket sits on the -Y face pointing out', () =>
  expect(approxSocketFrame({ ...cube, socket: '4', side: 'child', name: null, parentSockets: [] }))
    .toEqual([0, -1, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1]));
test('unnamed parent sockets cycle +Y, +X, -X, +Z, -Z, -Y', () => {
  const ids = ['1', '2', '3', '4', '5', '6'];
  expect(ids.map((s) => approxSocketFrame({ ...cube, socket: s, side: 'parent', name: null, parentSockets: ids }).slice(0, 3)))
    .toEqual([[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]);
});
```

```ts
// tests/core/socket-geometry.test.ts
import { emptySocketGeometry, parseSocketGeometry, applySocketGeometry } from '../../src/core/socket-geometry';
import { MINI } from '../helpers/catalog';
test('rejects other frame conventions', () =>
  expect(parseSocketGeometry({ ...emptySocketGeometry(), frameConvention: 'raw' })).toEqual({ ok: false, error: 'frameConvention must be "outward-y"' }));
test('apply overrides frames, marks them captured and leaves others untouched', () => {
  const f = emptySocketGeometry();
  f.parts.Connector = { sockets: { '5': { cframe: [0, -0.2, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1] } } };
  const c = applySocketGeometry(MINI, f);
  expect(c.parts.Connector.sockets['5']).toMatchObject({ frame: [0, -0.2, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1], frameSource: 'captured' });
  expect(c.parts.Connector.sockets['1']).toBe(MINI.parts.Connector.sockets['1']);
  expect(c.parts.Part).toBe(MINI.parts.Part);
});
```

```ts
// tests/scripts/build-assets.test.ts
import { buildAssets } from '../../scripts/build-assets';
const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(1e-3));
test('builds the runtime catalog and mesh pack', async () => {
  const { catalog, manifest, bin } = await buildAssets({ root: '.', outDir: null });
  expect(Object.keys(catalog.parts)).toHaveLength(132);
  expect(manifest.meshes).toHaveLength(120);
  const P = catalog.parts.Part;
  expect(P.sockets['6'].frameSource).toBe('workshop');
  close(P.sockets['6'].frame, [0, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  close(P.sockets['1'].frame, [0, -0.5, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1]);
  close(P.sockets['2'].frame, [0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0]);
  expect(catalog.parts.Switch.sockets['2'].role).toBe('output');
  expect(catalog.parts.Wire.sockets['3'].role).toBe('conductor');
  expect(catalog.parts.Base.sockets['5']).toMatchObject({ role: 'socket', name: 'Top' });
  expect(catalog.parts.Chassis.defaultMount).toBeNull();
  expect(catalog.parts['Gate-AND'].defaultMount).toBe('4');
  expect(catalog.parts.Roof.mainPartName).toBe('Roof');
  expect(Object.keys(catalog.parts.Roof.subParts)).toContain('Glass');
  expect(catalog.pairs['Connector.5>Connector.4']).toBe(5619);
  expect(catalog.pairs['Part.1>Part.6']).toBe(1073);
  expect(catalog.parts.Switch.tooltip).toBe('Activates its output until switched off');
  expect(manifest.meshes[P.mesh!.id]).toMatchObject({ type: 'Part', indexCount: 36 });
  expect(bin.byteLength).toBe(manifest.sections.indices[0] + manifest.sections.indices[1]);
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/approx.test.ts tests/core/socket-geometry.test.ts tests/scripts/build-assets.test.ts` → FAIL.
- [ ] **Step 3: Implement** `approx.ts` and `socket-geometry.ts`, then rerun their two test files → PASS.
- [ ] **Step 4: Implement** `pack.ts`, `catalog.ts`, `build-assets.ts` (its CLI entry calls `buildAssets({ root: process.cwd(), outDir: 'public/assets' })`) and `tests/helpers/real-catalog.ts`.
- [ ] **Step 5: Run the build test and the CLI.** `npx vitest run tests/scripts/build-assets.test.ts` → PASS. Then `npm run assets`: it prints the socket report, with 6 `workshop` frames, 0 `captured`, the rest `approx`, and the 4 files appear in `public/assets/`.
- [ ] **Step 6: Commit:** `git commit -m "feat(assets): runtime catalog and mesh pack build"`

---

## Milestone M1 — Viewer

### Task 8: Graph queries and structural rules

**Owner:** Haiku (dispatch D1)

**Files:**
- Create: `src/core/graph.ts`, `src/core/rules.ts`
- Test: `tests/core/graph.test.ts`, `tests/core/rules.test.ts`

**Interfaces:**
- Consumes: Task 2 types and helpers, `MINI`; Task 4 `importCode`; Task 7 `realCatalog`; `corpusCodes`.
- Produces:

```ts
// graph.ts — keys are `${part}:${socket}` and `${host}:${uuid}`; everything memoised per Doc
export interface ConnRef { readonly child: PartId; readonly index: number }
export interface GraphIndex {
  readonly socketUsers: ReadonlyMap<string, readonly ConnRef[]>; readonly pointUsers: ReadonlyMap<string, readonly ConnRef[]>;
  readonly targetsOf: ReadonlyMap<PartId, readonly ConnRef[]>; readonly poseChildren: ReadonlyMap<PartId, readonly PartId[]>;
}
export function graphIndex(doc: Doc): GraphIndex;
export function poseParent(doc: Doc, id: PartId): PartId | null;
export function poseDescendants(doc: Doc, id: PartId): Set<PartId>; // excludes id
export function jointNeighbours(doc: Doc, id: PartId): Set<PartId>;
export function component(doc: Doc, start: PartId, pred: (p: Part) => boolean): Set<PartId>;
export function roots(doc: Doc): PartId[]; // export order
export function topoPose(doc: Doc): { order: PartId[]; pseudoRoots: PartId[] };
export function wouldCreatePoseCycle(doc: Doc, child: PartId, newParent: PartId): boolean;
// rules.ts
export function pieceSockets(def: PartDef | undefined, socket: SocketId): SocketId[]; // [socket] when it has no piece
export function isSocketUsed(doc: Doc, part: PartId, socket: SocketId): boolean;
export function mountSockets(doc: Doc, part: PartId): SocketId[];
export function socketRole(cat: Catalog, type: string, socket: SocketId): SocketRole;
export function isSignalJoint(cat: Catalog, childType: string, childSocket: SocketId, parentType: string, parentSocket: SocketId): boolean;
export function canBeChild(doc: Doc, cat: Catalog, part: PartId, socket: SocketId, kind: 'joint' | 'mount'): Verdict;
export function canBeParent(doc: Doc, cat: Catalog, part: PartId, socket: SocketId): Verdict;
export function canTakeChild(doc: Doc, host: PartId, uuid: Uuid): Verdict;
export function validate(doc: Doc, cat: Catalog, limits: Limits, codeLength: number): Issue[];
```

**Verdict codes and messages, exactly:**

| code | message |
|---|---|
| `not-child-socket` | `Socket ${s} is not a child-side socket of ${type}.` |
| `not-parent-socket` | `Socket ${s} is not a parent-side socket of ${type}.` |
| `socket-used` | `Socket ${s} of this ${type} already has a joint.` |
| `piece-mounted` | `Socket ${s} is unavailable: piece ${piece} of this ${type} is consumed by its ephemeral mount on socket ${m}.` |
| `piece-busy` | `Socket ${s} cannot carry a mount: socket ${o} of the same piece already has a joint.` |
| `point-missing` | `Point ${uuid} does not exist on this ${type}.` |
| `point-used` | `Point ${uuid} already carries a part.` |

Unknown types accept any socket id.

**`isSignalJoint`:** true when the two roles are {output, input}, or when one is `conductor` and the other is input, output or conductor.

**Issues** follow spec §7.2:
- Every message names the part type and its 1-based `#index`. For example, `W-TYPE-UNKNOWN` reads `Unknown part type "${type}" (#${index}): kept as-is, drawn as a placeholder.`
- `W-CYCLE` lists parts reachable only from pseudo-roots.
- `I-NO-ANCHOR` fires when there are > 200 parts and no `Anchor` with `Activated === true`.
- `I-RELAY-UNMOUNTED` covers `Wire` and `Splitter_1`–`Splitter_4` without a point-target conn.
- `I-ROLE` covers socket joints whose two roles are both input or both output.
- `W-PART-LIMIT` says `beyond tested` past `partWarn`.

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/core/graph.test.ts
import { poseDescendants, topoPose, component, wouldCreatePoseCycle, roots } from '../../src/core/graph';
import { docOf, part, sock } from '../helpers/doc';
test('poseDescendants follows first connections only', () => {
  const d = docOf(part(1, 'Connector'), part(2, 'Connector', [sock('5', 1, '1')]),
    part(3, 'Wire', [sock('1', 2, '1'), sock('3', 4, '2')]), part(4, 'Gate-AND', [sock('4', 1, '2')]));
  expect([...poseDescendants(d, 1)].sort()).toEqual([2, 3, 4]);
  expect([...poseDescendants(d, 2)]).toEqual([3]);
  expect(roots(d)).toEqual([1]);
});
test('cycles get pseudo-roots and terminate', () => {
  const cyc = docOf(part(1, 'Part', [sock('1', 2, '6')]), part(2, 'Part', [sock('1', 1, '6')]));
  expect(topoPose(cyc)).toEqual({ order: [1, 2], pseudoRoots: [1] });
  expect(wouldCreatePoseCycle(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')])), 1, 2)).toBe(true);
});
test('component floods joint-connected parts that match', () => {
  const d = docOf(part(1, 'Part', [], { RGB: [1, 1, 1] }), part(2, 'Part', [sock('1', 1, '6')], { RGB: [1, 1, 1] }),
    part(3, 'Part', [sock('1', 2, '6')], { RGB: [9, 9, 9] }), part(4, 'Part', [sock('1', 3, '6')], { RGB: [1, 1, 1] }));
  const same = (p: any) => JSON.stringify(p.props.RGB) === '[1,1,1]';
  expect([...component(d, 1, same)].sort()).toEqual([1, 2]);
});
```

```ts
// tests/core/rules.test.ts
import { canBeChild, canBeParent, canTakeChild, validate } from '../../src/core/rules';
import { docOf, part, sock, mount, pt } from '../helpers/doc';
import { MINI } from '../helpers/catalog';
import { DEFAULT_LIMITS } from '../../src/core/types';
import { importCode } from '../helpers/import';
import { realCatalog } from '../helpers/real-catalog';
import { corpusCodes } from '../fixtures/corpus';

test('the v5 tear: a mount on Splitter_2 self9 blocks sock10', () => {
  const d = docOf(part(1, 'Base', [], {}, [pt('{u}')]), part(2, 'Splitter_2', [mount('9', 1, '{u}')]));
  expect(canBeParent(d, MINI, 2, '10')).toEqual({ ok: false, code: 'piece-mounted',
    message: 'Socket 10 is unavailable: piece C of this Splitter_2 is consumed by its ephemeral mount on socket 9.' });
  expect(canBeParent(d, MINI, 2, '6').ok).toBe(true);
});
test('ordinary joints on both faces of a piece are allowed; a mount needs its whole piece', () => {
  const d = docOf(part(1, 'Gate-AND'), part(2, 'Wire', [sock('1', 1, '1')]), part(3, 'Light', [sock('1', 2, '2')]));
  expect(canBeParent(docOf(part(1, 'Gate-AND'), part(2, 'Wire', [sock('1', 1, '1')])), MINI, 2, '2').ok).toBe(true);
  expect(canBeChild(d, MINI, 2, '3', 'joint').ok).toBe(true);
  expect(canBeChild(docOf(part(1, 'Wire'), part(2, 'Light', [sock('1', 1, '2')])), MINI, 1, '1', 'mount'))
    .toMatchObject({ ok: false, code: 'piece-busy' });
});
test('one mate per circle, and points take one child', () => {
  const d = docOf(part(1, 'Part', [], {}, [pt('{p}')]), part(2, 'Part', [sock('1', 1, '6')]), part(3, 'Part', [mount('1', 1, '{p}')]));
  expect(canBeParent(d, MINI, 1, '6')).toMatchObject({ ok: false, code: 'socket-used' });
  expect(canTakeChild(d, 1, '{p}')).toMatchObject({ ok: false, code: 'point-used' });
});
test('validate reports structural errors by code', () => {
  const d = docOf(part(1, 'Splitter_2', [], {}, [pt('{u}')]), part(2, 'Splitter_2', [mount('9', 1, '{u}')]),
    part(3, 'Light', [sock('1', 2, '10')]), part(4, 'Light', [mount('1', 1, '{nope}')]), part(5, 'Mystery'));
  const codes = validate(d, MINI, DEFAULT_LIMITS, 100).map((i) => i.code);
  expect(codes).toEqual(expect.arrayContaining(['E-TEAR', 'E-UUID', 'W-TYPE-UNKNOWN']));
});
test('the real corpus has no E-MATE or E-TEAR', async () => {
  const cat = await realCatalog();
  for (const code of corpusCodes()) {
    const bad = validate(importCode(code), cat, DEFAULT_LIMITS, code.length).filter((i) => i.code === 'E-MATE' || i.code === 'E-TEAR');
    expect(bad).toEqual([]);
  }
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/graph.test.ts tests/core/rules.test.ts` → FAIL.
- [ ] **Step 3: Implement** `graph.ts` and `rules.ts`.
- [ ] **Step 4: Run them again.** Same command → PASS. Then `npm run typecheck`.
- [ ] **Step 5: Commit:** `git commit -m "feat(core): graph queries and structural rules"`

### Task 9: Code-size meter and build stats

**Owner:** Haiku (dispatch D2)

**Files:**
- Create: `src/core/size.ts`, `src/core/stats.ts`
- Test: `tests/core/size.test.ts`, `tests/core/stats.test.ts`

**Interfaces:**
- Consumes: Task 4 `entryOf`, `orderIndex`, `toEntries`; Task 3 `encode`, `utf8Length`; `chainDoc`, `importCode`.
- Produces:

```ts
export function codeSize(doc: Doc): { jsonBytes: number; base64Chars: number };
export function base64Length(jsonBytes: number): number; // 4 * ceil(n / 3)
export function formatPercent(value: number, limit: number): string; // two decimals; "0.00" when limit <= 0
export interface TypeStat { readonly type: string; readonly count: number; readonly partsPercent: number; readonly codeBytes: number; readonly codePercent: number }
export interface BuildStats { readonly parts: number; readonly joints: number; readonly points: number; readonly roots: number; readonly types: readonly TypeStat[] }
export function buildStats(doc: Doc): BuildStats;
```

**Size algorithm (spec §13.5), exactly:**
- `jsonBytes = 2 + max(N − 1, 0) + Σ_parts [cached(part) + Σ_{socket/point conns} digits(orderIndex(target) + 1)]`.
- `cached(part) = utf8Length(JSON.stringify(entryOf(part, () => 0)))` minus the number of socket/point conns. It lives in a `WeakMap<Part, number>`.

**Stats, exactly:**
- `types` are sorted by count desc, then name.
- `partsPercent = count / parts × 100`.
- `codeBytes` is each type's entry bytes. Every referenced point's bytes (`utf8Length(JSON.stringify(uuid) + ':' + JSON.stringify({ partName, cframe })) + 1`) move from the host's type to the mounted child's type.
- `codePercent = codeBytes / jsonBytes × 100`.

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/core/size.test.ts
import { codeSize, formatPercent } from '../../src/core/size';
import { encode } from '../../src/core/codec';
import { toEntries } from '../../src/core/doc';
import { EMPTY_DOC } from '../../src/core/types';
import { chainDoc } from '../helpers/doc';
import { importCode } from '../helpers/import';
import { corpusCodes } from '../fixtures/corpus';

test.each(corpusCodes().slice(0, 40).map((c, i) => [i, c] as const))('matches a full encode (corpus %i)', (_i, code) => {
  const d = importCode(code);
  expect(codeSize(d).base64Chars).toBe(encode(toEntries(d)).length);
});
test('empty doc is "[]"', () => expect(codeSize(EMPTY_DOC)).toEqual({ jsonBytes: 2, base64Chars: 4 }));
test('deleting a part re-counts index digits exactly', () => {
  const d = chainDoc(11);
  const after = { ...d, order: d.order.slice(1), parts: new Map([...d.parts].filter(([id]) => id !== 1)) };
  const parts = new Map(after.parts);
  parts.set(2, { ...parts.get(2)!, conns: [] });
  const fixed = { ...after, parts };
  expect(codeSize(fixed).base64Chars).toBe(encode(toEntries(fixed)).length);
});
test('16K synthetic meter stays under budget', () => {
  const d = chainDoc(16_000);
  const t = performance.now();
  codeSize(d);
  const parts = new Map(d.parts);
  parts.set(5, { ...parts.get(5)!, props: { RGB: [1, 2, 3] } });
  codeSize({ ...d, parts });
  expect(performance.now() - t).toBeLessThan(300);
});
test('formatPercent', () => {
  expect(formatPercent(640_800, 8_000_000)).toBe('8.01');
  expect(formatPercent(0, 8_000_000)).toBe('0.00');
  expect(formatPercent(5, 0)).toBe('0.00');
});
```

```ts
// tests/core/stats.test.ts
import { buildStats } from '../../src/core/stats';
import { codeSize } from '../../src/core/size';
import { docOf, part, mount, pt } from '../helpers/doc';
test('counts, percents, and point bytes moved to the mounted child', () => {
  const d = docOf(part(1, 'Connector', [], {}, [pt('{a}'), pt('{b}')]), part(2, 'Part', [mount('1', 1, '{a}')]), part(3, 'Part'));
  const s = buildStats(d);
  expect(s).toMatchObject({ parts: 3, joints: 1, points: 2, roots: 2 });
  expect(s.types.map((t) => [t.type, t.count, t.partsPercent.toFixed(2)])).toEqual([['Part', 2, '66.67'], ['Connector', 1, '33.33']]);
  expect(s.types.reduce((a, t) => a + t.codeBytes, 0) + 2 + 2).toBe(codeSize(d).jsonBytes);
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/size.test.ts tests/core/stats.test.ts` → FAIL.
- [ ] **Step 3: Implement** `size.ts` and `stats.ts`.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(core): code-size meter and build stats"`

### Task 10: Conventions and pose solver

**Owner:** Inline

**Files:**
- Create: `src/core/conventions.ts`, `src/core/pose.ts`
- Test: `tests/core/conventions.test.ts`, `tests/core/pose.test.ts`

**Interfaces:**
- Consumes: Task 2 types; Task 3 `cfToMatrix4`, `matrix4ToCf`; Task 7 `approxSocketFrame`, `PLACEHOLDER_BOX`; Task 8 `topoPose`, `poseParent`.
- Produces:

```ts
// conventions.ts
export const DEFAULT_CONVENTIONS: Conventions; // { mating: 'rx180', orientationOrder: 'XYZ', orientationOnPoints: true }
export function matingMatrix(c: Conventions): Matrix4;
export function orientationMatrix(props: Readonly<Record<string, Json>>, c: Conventions): Matrix4; // degrees; missing keys = 0
export function childWorldViaSocket(parentWorld: Matrix4, parentSocket: Matrix4, childSocket: Matrix4, childProps: Readonly<Record<string, Json>>, c: Conventions): Matrix4;
export function childWorldViaPoint(hostWorld: Matrix4, subPart: Matrix4, point: Matrix4, childSocket: Matrix4, childProps: Readonly<Record<string, Json>>, c: Conventions): Matrix4;
export function pointFrameFor(hostWorld: Matrix4, subPart: Matrix4, childWorld: Matrix4, childSocket: Matrix4, childProps: Readonly<Record<string, Json>>, c: Conventions): CFrame12;
// pose.ts
export const POSE_APPROX = 1, POSE_CYCLE = 2, POSE_UNKNOWN_TYPE = 4;
export interface Poses { readonly world: ReadonlyMap<PartId, Matrix4>; readonly flags: ReadonlyMap<PartId, number>; readonly approxCount: number }
export const EMPTY_POSES: Poses;
export function socketMatrix(cat: Catalog, type: string, socket: SocketId): { m: Matrix4; approx: boolean };
export function subPartMatrix(cat: Catalog, type: string, partName: string): { m: Matrix4; approx: boolean };
export function defaultRootLayout(doc: Doc, cat: Catalog): Map<PartId, CFrame12>;
export function computePoses(doc: Doc, cat: Catalog, conv: Conventions): Poses;
```

**Formulas** (spec §10.2):
- Socket joint: `World(c) = World(q)·S(q,b)·R(c)·M·S(c,a)⁻¹`.
- Point mount: `World(c) = World(h)·Sub(h,partName)·CF(u)·Re(c)·M·S(c,a)⁻¹`. `Re` is the identity when `orientationOnPoints` is false.
- `pointFrameFor` is the exact inverse of `childWorldViaPoint`.

**Roots:** `doc.layout` is used, else `defaultRootLayout`. The first root sits at the origin; each later root sits along +X, 2 studs past the previous root's bbox (bbox from `mesh`, else `PLACEHOLDER_BOX`).

**Flags:** frames come from `socketMatrix`. An unknown type or socket gets an approx frame plus `POSE_UNKNOWN_TYPE`. `POSE_APPROX` and `POSE_CYCLE` propagate to children.

- [ ] **Step 1: Write the failing tests** (`tests/core/pose.test.ts`; `conventions.test.ts` holds the round-trip).

```ts
import { Matrix4, Vector3, Quaternion } from 'three';
import { computePoses, POSE_APPROX, POSE_CYCLE, POSE_UNKNOWN_TYPE } from '../../src/core/pose';
import { DEFAULT_CONVENTIONS as C } from '../../src/core/conventions';
import { docOf, part, sock, mount, pt, chainDoc } from '../helpers/doc';
import { MINI } from '../helpers/catalog';
const pos = (m: Matrix4) => new Vector3().setFromMatrixPosition(m).toArray().map((v) => +v.toFixed(9) + 0);
const axisY = (m: Matrix4) => new Vector3(0, 1, 0).transformDirection(m).toArray().map((v) => +v.toFixed(9) + 0);

test('Part on Part via 1→6 stacks one stud up, unrotated', () => {
  const p = computePoses(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')])), MINI, C);
  expect(pos(p.world.get(2)!)).toEqual([0, 1, 0]);
  expect(axisY(p.world.get(2)!)).toEqual([0, 1, 0]);
  expect(p.flags.get(2)).toBe(0);
});
test('Part on Part via 1→2 sits one stud along +X with its +Y facing +X', () => {
  const p = computePoses(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '2')])), MINI, C);
  expect(pos(p.world.get(2)!)).toEqual([1, 0, 0]);
  expect(axisY(p.world.get(2)!)).toEqual([1, 0, 0]);
});
test('a point mount seats the child socket on the point', () => {
  const d = docOf(part(1, 'Base', [], {}, [pt('{u}', [2, 0.25, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 'Base')]), part(2, 'Part', [mount('1', 1, '{u}')]));
  expect(pos(computePoses(d, MINI, C).world.get(2)!)).toEqual([2, 0.75, 0]);
});
test('OrientationY = 90 turns the child +90° about the parent socket normal', () => {
  const p = computePoses(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')], { OrientationY: 90 })), MINI, C);
  const q = new Quaternion().setFromRotationMatrix(p.world.get(2)!);
  expect(q.angleTo(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2))).toBeLessThan(1e-9);
  expect(pos(p.world.get(2)!)).toEqual([0, 1, 0]);
});
test('approximate frames flag the whole subtree', () => {
  const p = computePoses(docOf(part(1, 'Part'), part(2, 'Gate-AND', [sock('4', 1, '6')]), part(3, 'Light', [sock('1', 2, '1')])), MINI, C);
  expect(p.flags.get(2)! & POSE_APPROX).toBeTruthy();
  expect(p.flags.get(3)! & POSE_APPROX).toBeTruthy();
});
test('cycles terminate with pseudo-roots', () => {
  const p = computePoses(docOf(part(1, 'Part', [sock('1', 2, '6')]), part(2, 'Part', [sock('1', 1, '6')])), MINI, C);
  expect(p.world.size).toBe(2);
  expect(p.flags.get(2)! & POSE_CYCLE).toBeTruthy();
});
test('unknown types get a placeholder pose', () =>
  expect(computePoses(docOf(part(1, 'Part'), part(2, 'Mystery', [sock('1', 1, '6')])), MINI, C).flags.get(2)! & POSE_UNKNOWN_TYPE).toBeTruthy());
test('roots line up along +X with 2-stud gaps', () =>
  expect(pos(computePoses(docOf(part(1, 'Part'), part(2, 'Part')), MINI, C).world.get(2)!)).toEqual([3, 0, 0]));
test('a 16K chain computes in under 200 ms', () => {
  const t = performance.now();
  computePoses(chainDoc(16_000), MINI, C);
  expect(performance.now() - t).toBeLessThan(200);
});
```

```ts
// tests/core/conventions.test.ts
import { Matrix4, Vector3, Quaternion } from 'three';
import { childWorldViaPoint, pointFrameFor, DEFAULT_CONVENTIONS as C } from '../../src/core/conventions';
import { cfToMatrix4 } from '../../src/core/cframe';
test('pointFrameFor inverts childWorldViaPoint', () => {
  const rnd = (s: number) => new Matrix4().compose(new Vector3(s, 2 * s, -s), new Quaternion().setFromAxisAngle(new Vector3(1, s, 0.5).normalize(), s), new Vector3(1, 1, 1));
  const host = rnd(0.3), sub = rnd(0.1), child = rnd(0.7), sock = rnd(0.2);
  const props = { OrientationX: 90, OrientationZ: 45 };
  const cf = pointFrameFor(host, sub, child, sock, props, C);
  const back = childWorldViaPoint(host, sub, cfToMatrix4(cf), sock, props, C);
  back.elements.forEach((v, i) => expect(v).toBeCloseTo(child.elements[i], 9));
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/pose.test.ts tests/core/conventions.test.ts` → FAIL.
- [ ] **Step 3: Implement** `conventions.ts`, then `pose.ts`. The traversal uses `topoPose(doc).order`; matrices are float64 `Matrix4`.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(core): mating conventions and pose solver"`

### Task 11: Transactions and history

**Owner:** Inline

**Files:**
- Create: `src/core/ops/transact.ts`, `src/state/history.ts`
- Test: `tests/core/transact.test.ts`, `tests/state/history.test.ts`

**Interfaces:**
- Produces:

```ts
// transact.ts
export interface Draft {
  readonly base: Doc;
  get(id: PartId): Part | undefined;
  set(part: Part): void;        // replaces an existing part (throws when missing)
  add(part: Part): void;        // new id, appended to order (throws when present)
  delete(id: PartId): void;     // removes from parts, order and layout
  order(): readonly PartId[];
  setOrder(order: readonly PartId[]): void;
  layout(id: PartId): CFrame12 | undefined;
  setLayout(id: PartId, cf: CFrame12 | null): void;
  allocId(): PartId;
}
export interface Patch {
  readonly label: string;
  readonly parts: readonly (readonly [PartId, Part | undefined, Part | undefined])[];
  readonly order: readonly [readonly PartId[], readonly PartId[]] | null;
  readonly layout: readonly (readonly [PartId, CFrame12 | undefined, CFrame12 | undefined])[];
  readonly nextId: readonly [PartId, PartId];
}
export function transact(doc: Doc, label: string, fn: (d: Draft) => void): { doc: Doc; patch: Patch | null };
export function applyPatch(doc: Doc, patch: Patch, dir: 'redo' | 'undo'): Doc;
// history.ts
export interface History { readonly past: readonly Patch[]; readonly future: readonly Patch[] }
export function emptyHistory(): History;
export function record(h: History, p: Patch, cap?: number): History; // cap 500; clears future
export function undoStep(h: History, doc: Doc): { h: History; doc: Doc } | null;
export function redoStep(h: History, doc: Doc): { h: History; doc: Doc } | null;
```

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/core/transact.test.ts
import { transact, applyPatch } from '../../src/core/ops/transact';
import { docOf, part } from '../helpers/doc';
import { EMPTY_DOC } from '../../src/core/types';
test('records a patch; untouched parts keep identity; undo/redo are exact', () => {
  const d0 = docOf(part(1, 'Part'), part(2, 'Part'));
  const { doc: d1, patch } = transact(d0, 'paint', (d) => d.set({ ...d.get(1)!, props: { RGB: [1, 2, 3] } }));
  expect(d1.parts.get(2)).toBe(d0.parts.get(2));
  expect(patch!.parts).toHaveLength(1);
  expect(applyPatch(d1, patch!, 'undo')).toEqual(d0);
  expect(applyPatch(d0, patch!, 'redo')).toEqual(d1);
});
test('no-op transactions return a null patch', () => expect(transact(EMPTY_DOC, 'x', () => {}).patch).toBeNull());
test('add and delete keep order, layout and nextId consistent', () => {
  const { doc, patch } = transact(docOf(part(1, 'Part')), 'swap', (d) => {
    const id = d.allocId();
    d.add(part(id, 'Part'));
    d.setLayout(id, [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    d.delete(1);
  });
  expect(doc.order).toEqual([2]);
  expect(doc.nextId).toBe(3);
  expect([...doc.layout.keys()]).toEqual([2]);
  expect(applyPatch(doc, patch!, 'undo').order).toEqual([1]);
});
```

```ts
// tests/state/history.test.ts
import { emptyHistory, record, undoStep, redoStep } from '../../src/state/history';
import { transact } from '../../src/core/ops/transact';
import { docOf, part } from '../helpers/doc';
test('cap 500, record clears redo, undo/redo walk the stack', () => {
  let doc = docOf(part(1, 'Part'));
  let h = emptyHistory();
  for (let i = 0; i < 501; i++) {
    const r = transact(doc, `p${i}`, (d) => d.set({ ...d.get(1)!, props: { OrientationY: i } }));
    doc = r.doc;
    h = record(h, r.patch!);
  }
  expect(h.past).toHaveLength(500);
  const u = undoStep(h, doc)!;
  expect(u.doc.parts.get(1)!.props).toEqual({ OrientationY: 499 });
  expect(redoStep(u.h, u.doc)!.doc).toEqual(doc);
  expect(record(u.h, transact(u.doc, 'x', (d) => d.delete(1)).patch!).future).toHaveLength(0);
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/transact.test.ts tests/state/history.test.ts` → FAIL.
- [ ] **Step 3: Implement** both files. The draft copies `parts`/`order`/`layout` lazily on first write and records the first "before" value of every touched key.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(core): transactions with patch-based undo history"`

### Task 12: Application state

**Owner:** Inline

**Files:**
- Create: `src/state/store.ts`, `src/state/selection.ts`, `src/state/settings.ts`, `src/state/derived.ts`, `src/storage/prefs.ts`
- Test: `tests/state/store.test.ts`, `tests/state/selection.test.ts`, `tests/state/settings.test.ts`

**Interfaces:**
- Consumes: Tasks 7–11.
- Produces:

```ts
// store.ts
export const docSig: Signal<Doc>;
export const historySig: Signal<History>;
export const baseCatalogSig: Signal<Catalog | null>;
export const socketOverridesSig: Signal<SocketGeometryFile>;
export const catalogSig: ReadonlySignal<Catalog | null>; // applySocketGeometry(base, overrides)
export function commit(label: string, fn: (d: Draft) => void): Patch | null;
export function undo(): boolean;
export function redo(): boolean;
export function loadDoc(doc: Doc): void; // replaces the doc; clears history and selection
export type ViewEvent = { kind: 'frame-selection' } | { kind: 'frame-all' } | { kind: 'view'; axis: 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom' } | { kind: 'toggle-ortho' };
export const viewBus: { emit(e: ViewEvent): void; on(fn: (e: ViewEvent) => void): () => void };
export function resetStoreForTests(): void;
// selection.ts
export interface Selection { readonly parts: ReadonlySet<PartId>; readonly points: ReadonlySet<PointKey>; readonly active: PartId | PointKey | null }
export const selectionSig: Signal<Selection>;
export const selectModeSig: Signal<'part' | 'attached'>;
export const hiddenSig: Signal<ReadonlySet<PartId>>;
export function pointKey(host: PartId, uuid: Uuid): PointKey;
export function select(ids: Iterable<PartId>, op: 'replace' | 'add' | 'toggle' | 'remove'): void; // expands by selectModeSig
export function selectPoints(keys: Iterable<PointKey>, op: 'replace' | 'add' | 'toggle' | 'remove'): void;
export function sanitizeSelection(doc: Doc): void;
// settings.ts
export interface Settings {
  cameraScheme: 'blender' | 'studio'; emulate3Button: boolean; invertY: boolean; orbitSensitivity: number;
  flySpeed: number; theme: 'dark' | 'light'; limits: Limits; snapEnabled: boolean; snapMove: number;
  snapRotate: number; autoColor: boolean; activeColor: RGB; maxSockets: number; genPosDecimals: number;
  genRotDecimals: number; xray: boolean; desaturateApprox: boolean;
}
export const DEFAULT_SETTINGS: Settings; // blender, false, false, 1, 16, 'dark', DEFAULT_LIMITS, true, 0.25, 15, false, [163,162,165], 3000, 4, 5, false, true
export const settingsSig: Signal<Settings>; // loaded from pref 'settings'
export function updateSettings(patch: Partial<Settings>): void; // persists
// derived.ts
export const posesSig: ReadonlySignal<Poses>; // EMPTY_POSES while the catalog is null
export const issuesSig: ReadonlySignal<Issue[]>;
export const statsSig: ReadonlySignal<BuildStats>;
export const sizeSig: ReadonlySignal<{ jsonBytes: number; base64Chars: number }>;
// prefs.ts
export function loadPref<T>(key: string, fallback: T): T; // key prefixed 'grambyedit:'; try/catch
export function savePref(key: string, value: unknown): void;
```

- [ ] **Step 1: Write the failing tests** (jsdom for settings):

```ts
// tests/state/store.test.ts
import { docSig, commit, undo, redo, loadDoc, resetStoreForTests } from '../../src/state/store';
import { selectionSig, select, selectModeSig } from '../../src/state/selection';
import { chainDoc } from '../helpers/doc';
beforeEach(resetStoreForTests);
test('commit, undo, redo through the store; undo sanitises the selection', () => {
  loadDoc(chainDoc(2));
  commit('add', (d) => { const id = d.allocId(); d.add({ id, type: 'Part', conns: [], props: {}, points: null }); });
  select([3], 'replace');
  expect(undo()).toBe(true);
  expect(docSig.value.order).toEqual([1, 2]);
  expect(selectionSig.value.parts.size).toBe(0);
  expect(redo()).toBe(true);
  expect(docSig.value.order).toEqual([1, 2, 3]);
});
test('attached mode expands picks to pose descendants', () => {
  loadDoc(chainDoc(4));
  selectModeSig.value = 'attached';
  select([2], 'replace');
  expect([...selectionSig.value.parts].sort()).toEqual([2, 3, 4]);
});
```

```ts
// tests/state/settings.test.ts
// @vitest-environment jsdom
import { DEFAULT_SETTINGS, settingsSig, updateSettings } from '../../src/state/settings';
test('settings default and persist', () => {
  expect(DEFAULT_SETTINGS.limits).toEqual({ codeChars: 8_000_000, partSoftCap: 8_000, partWarn: 16_000 });
  updateSettings({ cameraScheme: 'studio' });
  expect(settingsSig.value.cameraScheme).toBe('studio');
  expect(JSON.parse(localStorage.getItem('grambyedit:settings')!).cameraScheme).toBe('studio');
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/state` → FAIL.
- [ ] **Step 3: Implement** the five files. Derived signals are `computed`, so they recompute lazily per committed doc version; drags never commit per frame.
- [ ] **Step 4: Run them again.** `npx vitest run tests/state` → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(state): store, selection, settings and derived signals"`

### Task 13: Viewport core

**Owner:** Inline

**Files:**
- Create: `src/assets/load.ts`, `src/assets/geometry.ts`, `src/viewport/index.ts`, `src/viewport/renderer.ts`, `src/viewport/scene.ts`, `src/viewport/grid.ts`, `src/viewport/nav-gizmo.ts`, `src/viewport/cameras/blender.ts`, `src/viewport/cameras/studio.ts`, `src/viewport/parts-layer.ts`, `src/viewport/slots.ts`, `src/viewport/debug.ts`
- Test: `tests/assets/geometry.test.ts`, `tests/viewport/slots.test.ts`

**Interfaces:**
- Consumes: Task 7 assets, Task 12 signals.
- Produces:

```ts
export interface Assets { readonly catalog: Catalog; readonly manifest: Manifest; readonly bin: ArrayBuffer }
export function loadAssets(baseUrl?: string): Promise<Assets>; // catalog.json, parts.json, parts.bin under BASE_URL + 'assets/'
export function partGeometry(assets: Assets, type: string): BufferGeometry; // cached; PLACEHOLDER_BOX cube when mesh is null
export function mountViewport(el: HTMLElement): () => void; // shows "WebGL2 is required" when unavailable
export class SlotAllocator {
  constructor(capacity: number);
  alloc(id: PartId): number; free(id: PartId): void; slotOf(id: PartId): number | undefined;
  get capacity(): number; get size(): number;
}
// dev only (import.meta.env.DEV): window.__ge
export interface GeDebug {
  importCode(code: string): void; instanceCount(type?: string): number; drawCalls(): number;
  doc(): Doc; poses(): Poses; selection(): PartId[]; fps(ms?: number): Promise<number>;
  project(id: PartId): { x: number; y: number }; pick(x: number, y: number): { part: PartId; subPart: string } | null;
}
```

**Rendering rules** (spec §11.1):
- one `InstancedMesh` per part type, with capacity doubling via `SlotAllocator`;
- an `onBeforeCompile` patch on `MeshStandardMaterial` takes `instanceColor` where the vertex paint flag is 255, and the baked vertex color otherwise;
- an `aFlags` instanced attribute (bit 1 selected, 2 hovered, 4 approximate, 8 hidden): approximate parts are desaturated 30% when `desaturateApprox` is on, and hidden instances collapse to zero scale;
- Neutral tone mapping;
- a hemisphere light plus one directional light;
- a shader grid (1-stud minor, 4-stud major lines) that fades with distance;
- the nav gizmo in the top-right corner, with clicks emitting `viewBus` view events;
- both camera schemes per spec §11.3, chosen by `settingsSig.cameraScheme`;
- `webglcontextlost` shows the overlay `The 3D view stopped.` with **Reload view**, which remounts the viewport without touching the doc.

- [ ] **Step 1: Write the failing unit tests.**

```ts
// tests/viewport/slots.test.ts
import { SlotAllocator } from '../../src/viewport/slots';
test('recycles freed slots and doubles capacity', () => {
  const s = new SlotAllocator(2);
  expect([s.alloc(10), s.alloc(11)]).toEqual([0, 1]);
  s.free(10);
  expect(s.alloc(12)).toBe(0);
  expect(s.alloc(13)).toBe(2);
  expect(s.capacity).toBe(4);
  expect(s.slotOf(11)).toBe(1);
});
```

```ts
// tests/assets/geometry.test.ts
import { buildAssets } from '../../scripts/build-assets';
import { partGeometry } from '../../src/assets/geometry';
test('decodes Part from the real pack', async () => {
  const { catalog, manifest, bin } = await buildAssets({ root: '.', outDir: null });
  const g = partGeometry({ catalog, manifest, bin: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) }, 'Part');
  expect(g.index!.count).toBe(36);
  g.computeBoundingBox();
  expect(g.boundingBox!.max.toArray().map((v) => +v.toFixed(3))).toEqual([0.5, 0.5, 0.5]);
  expect(g.getAttribute('color').itemSize).toBe(4);
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/viewport/slots.test.ts tests/assets/geometry.test.ts` → FAIL.
- [ ] **Step 3: Implement** the files. `App` renders a `<div class="viewport">` whose `useEffect` calls `mountViewport`, then loads the assets into `baseCatalogSig`. `debug.ts` registers `window.__ge`.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Browser check.**
  1. `npm run assets`, then start preview `dev` and evaluate `__ge.importCode(<spec Appendix A code>)`.
  2. Expected: `__ge.instanceCount() === 12`, and `__ge.drawCalls() <= 11` (7 part types + grid + nav gizmo + 2 spare).
  3. The screenshot shows 12 parts on the grid, and the console has no errors.
  4. Set `settingsSig` to `studio`: RMB-drag + WASD moves the camera.
- [ ] **Step 6: Commit:** `git commit -m "feat(viewport): instanced parts, cameras, grid and nav gizmo"`

### Task 14: Picking, outline, sockets layer and the Select tool

**Owner:** Inline

**Files:**
- Create: `src/viewport/bvh.ts`, `src/viewport/raycast.ts`, `src/viewport/outline.ts`, `src/viewport/id-pass.ts`, `src/viewport/sockets-layer.ts`, `src/tools/manager.ts`, `src/tools/select.ts`
- Test: `tests/viewport/bvh.test.ts`, `tests/tools/select.test.ts`

**Interfaces:**
- Produces:

```ts
// bvh.ts (pure)
export class SphereBVH {
  constructor(items: readonly { id: number; center: Vec3; radius: number }[]);
  rayCandidates(origin: Vec3, dir: Vec3): number[];
}
// raycast.ts
export interface Hit { part: PartId; point: Vector3; normal: Vector3; subPart: string; distance: number }
export function pickPart(ndc: Vector2): Hit | null;
export function pickSocket(ndc: Vector2): { part: PartId; socket: SocketId } | null;
export function pickPoint(ndc: Vector2): { host: PartId; uuid: Uuid } | null;
export function partsInRect(rect: { x0: number; y0: number; x1: number; y1: number }, mode: 'visible' | 'xray'): Set<PartId>; // CSS px
export function partsInDisc(center: { x: number; y: number }, radiusPx: number): Set<PartId>; // ~16 rays
// manager.ts
export type ToolId = 'select' | 'move' | 'rotate' | 'connect' | 'point' | 'paint' | 'place' | 'sockets';
export interface ToolPointer { kind: 'down' | 'move' | 'up'; button: number; x: number; y: number; ndc: Vector2; shift: boolean; ctrl: boolean; alt: boolean }
export interface Tool { readonly id: ToolId; activate(): void; deactivate(): void; onPointer?(e: ToolPointer): void; onKey?(e: KeyboardEvent): boolean }
export const toolSig: Signal<ToolId>;
export function registerTool(t: Tool): void;
export function setTool(id: ToolId): void;
// select.ts (pure helper + tool)
export function clickOp(hit: PartId | null, mods: { shift: boolean; ctrl: boolean }): { ids: PartId[]; op: 'replace' | 'add' | 'toggle' | 'remove' };
```

`rayCandidates` returns exactly the spheres whose distance to the ray is ≤ their radius. The distance is measured from the closest ray point with t ≥ 0, so a sphere containing the origin always counts.

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/viewport/bvh.test.ts
import { SphereBVH } from '../../src/viewport/bvh';
test('candidates equal brute force for 2,000 spheres and 100 rays', () => {
  let s = 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 100 - 50;
  const items = Array.from({ length: 2000 }, (_, id) => ({ id, center: [r(), r(), r()] as const, radius: 0.5 + Math.abs(r()) / 50 }));
  const bvh = new SphereBVH(items);
  for (let k = 0; k < 100; k++) {
    const o = [r(), r(), r()] as const, d0 = [r(), r(), r()], n = Math.hypot(...d0);
    const d = [d0[0] / n, d0[1] / n, d0[2] / n] as const;
    const brute = items.filter((it) => {
      const oc = [it.center[0] - o[0], it.center[1] - o[1], it.center[2] - o[2]];
      const t = Math.max(0, oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2]);
      const p = [o[0] + d[0] * t - it.center[0], o[1] + d[1] * t - it.center[1], o[2] + d[2] * t - it.center[2]];
      return Math.hypot(...p) <= it.radius;
    }).map((it) => it.id).sort((a, b) => a - b);
    expect(bvh.rayCandidates(o, d).sort((a, b) => a - b)).toEqual(brute);
  }
});
```

```ts
// tests/tools/select.test.ts
import { clickOp } from '../../src/tools/select';
test('click semantics', () => {
  expect(clickOp(5, { shift: false, ctrl: false })).toEqual({ ids: [5], op: 'replace' });
  expect(clickOp(5, { shift: true, ctrl: false })).toEqual({ ids: [5], op: 'toggle' });
  expect(clickOp(5, { shift: false, ctrl: true })).toEqual({ ids: [5], op: 'remove' });
  expect(clickOp(null, { shift: false, ctrl: false })).toEqual({ ids: [], op: 'replace' });
  expect(clickOp(null, { shift: true, ctrl: false })).toEqual({ ids: [], op: 'add' });
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/viewport/bvh.test.ts tests/tools/select.test.ts` → FAIL.
- [ ] **Step 3: Implement** the files (spec §11.1–§11.2 and §12.1).
  - The outline renders selected instances into a mask target, then runs an edge pass: `--select` color, white for hover, `--active` for the active part.
  - Sockets use instanced rings with the spec §11.1 state colors, capped at `settings.maxSockets` nearest.
  - The select tool handles click, Shift/Ctrl and empty-space box drag (using `xray` from settings), and `L` / `Ctrl+L` under the cursor.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Browser check.**
  - **Appendix A:** its Gate-AND is #10, and parts #2, #3, #7, #10 and #12 form a pose cycle, which the cycle handling must render.
    - Click `__ge.project(10)` → `__ge.selection()` is `[10]`, and the screenshot shows the orange outline.
    - A box drag over everything → 12 selected.
  - **Appendix B:**
    - Click the Gate-NOT, `__ge.project(3)` → `[3]`.
    - In attached mode → `[3, 4]`.
    - Click the Base in attached mode → `[1, 2, 3, 4]`.
  - Hovering a part shows its socket rings.
- [ ] **Step 6: Commit:** `git commit -m "feat(viewport): BVH picking, outline, sockets and Select tool"`

### Task 15: App shell and design system

**Owner:** Inline

**Files:**
- Create: `src/ui/tokens.css`, `src/ui/icons.tsx`, `src/ui/layout/Shell.tsx`, `src/ui/layout/Dock.tsx`, `src/ui/layout/Tabs.tsx`, `src/ui/layout/StatusBar.tsx`, `src/ui/layout/Toolbar.tsx`, `src/ui/layout/Toasts.tsx`, `src/ui/layout/Dialog.tsx`, `src/state/toasts.ts`, `src/state/ui.ts`
- Modify: `src/ui/App.tsx`
- Test: `tests/ui/shell.test.tsx`

**Interfaces:**
- Produces:
  - `Dialog({ title, open, onClose, children, footer? })`: Esc closes it, focus is trapped, and it restores focus on close.
  - `Tabs({ tabs: { id, label }[], active, onChange })`.
  - `Dock({ side: 'left' | 'right', children })`: collapsible and resizable; its width persists in pref `dock:<side>`.
  - `StatusBar({ children })`.
  - `Toolbar()`: the tool buttons from spec §12, the selection-mode segmented control, an auto-color toggle and the camera-scheme menu.
  - `toast(message: string, kind?: 'info' | 'warn' | 'error', action?: { label: string; run(): void })`, plus `toastsSig: Signal<readonly { id: number; message: string; kind: 'info' | 'warn' | 'error'; action?: { label: string; run(): void } }[]>`.
  - `src/state/ui.ts`:
    - `export type DialogName = 'import' | 'export' | 'library' | 'save' | 'settings' | 'about' | 'shortcuts' | 'palette'`;
    - `export const dialogSig: Signal<DialogName | null>`;
    - `export function openDialog(name: DialogName): void`;
    - `export function closeDialog(): void`.

    Every later dialog opens through these.
  - Icons: 18 px inline Lucide SVGs, each with `aria-hidden="true"`; icon buttons carry `aria-label`.

- [ ] **Step 1: Write the failing test** (`// @vitest-environment jsdom`; `vi.mock('../../src/viewport/index', () => ({ mountViewport: () => () => {} }))`):

```tsx
import { render, screen, fireEvent, act } from '@testing-library/preact';
import { Tabs } from '../../src/ui/layout/Tabs';
import { Dialog } from '../../src/ui/layout/Dialog';
import { toast, toastsSig } from '../../src/state/toasts';
test('tabs switch', () => {
  const on = vi.fn();
  render(<Tabs tabs={[{ id: 'a', label: 'Properties' }, { id: 'b', label: 'Outliner' }]} active="a" onChange={on} />);
  fireEvent.click(screen.getByText('Outliner'));
  expect(on).toHaveBeenCalledWith('b');
});
test('dialog closes on Escape', () => {
  const close = vi.fn();
  render(<Dialog title="Export" open onClose={close}><button>Copy</button></Dialog>);
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(close).toHaveBeenCalled();
});
test('toasts auto-dismiss after 4 s', () => {
  vi.useFakeTimers();
  toast('Saved');
  expect(toastsSig.value).toHaveLength(1);
  act(() => vi.advanceTimersByTime(4000));
  expect(toastsSig.value).toHaveLength(0);
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/ui/shell.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Lay out the shell per the spec §17 wireframe: the top bar, a left dock (Parts), the viewport, a right dock (tabs: Properties, Outliner, Stats, Issues) and the status bar. Theme tokens from the Global Constraints go on `:root`, and the light theme on `[data-theme="light"]`.
- [ ] **Step 4: Run it again.** `npx vitest run tests/ui` → PASS (the Task 1 app test included).
- [ ] **Step 5: Browser check:** the screenshot matches the wireframe layout in both themes, docks collapse and resize, and the credit sits in the footer.
- [ ] **Step 6: Commit:** `git commit -m "feat(ui): app shell, design tokens, dialogs and toasts"`

### Task 16: Stats, Issues, Outliner panels and meters

**Owner:** Haiku (dispatch E)

**Files:**
- Create: `src/ui/panels/StatsPanel.tsx`, `src/ui/panels/IssuesPanel.tsx`, `src/ui/panels/Outliner.tsx`, `src/ui/layout/Meters.tsx`, `src/ui/widgets/VirtualList.tsx`
- Test: `tests/ui/panels/stats.test.tsx`, `tests/ui/panels/issues.test.tsx`, `tests/ui/panels/outliner.test.tsx`, `tests/ui/meters.test.tsx`

**Interfaces:**
- Consumes: `statsSig`, `issuesSig`, `sizeSig`, `docSig`, `settingsSig`, `select`, `hiddenSig`, `formatPercent`, `poseDescendants` (Tasks 8, 9, 12).
- Produces:
  - `<StatsPanel/>`, `<IssuesPanel/>`, `<Outliner/>`, `<Meters/>`;
  - `VirtualList<T>({ items: T[]; rowHeight: number; render(item: T, index: number): JSX.Element; height: number })`;
  - `export function metersView(s: { base64Chars: number; parts: number }, limits: Limits): { codeText: string; codeLevel: 'ok' | 'warn' | 'bad'; partsText: string; partsLevel: 'ok' | 'warn' | 'high' | 'bad'; partsNote: '' | 'laggy' | 'beyond tested' }` (in `Meters.tsx`).
- Rules:
  - **Meter thresholds:**

    | meter | green | amber | other |
    |---|---|---|---|
    | code | < 75% | 75–100% | red > 100% |
    | parts | < 6,000 | 6,000–8,000 | orange 8,000–16,000 + `laggy`; red > 16,000 + `beyond tested` |

  - **Meter levels:** `metersView` returns code levels `ok` / `warn` / `bad` and part levels `ok` / `warn` / `high` / `bad`. Part `warn` starts at 75% of the soft cap.
  - **Stats:** a `<table>` with a header row and one `<tr>` per type. "Copy as text" writes one `type\tcount\t%parts\t%code` line per type.
  - **Outliner structure:** a tree by pose parent. Rows are `role="treeitem"` and 24 px tall; search is an `<input type="search">`. Search matches the type, or `#<1-based index>`.
  - **Outliner rows:** each row has an eye toggle (`aria-label="Hide <type> #<index>"`) bound to `hiddenSig`. Double-click selects the part and emits `{ kind: 'frame-selection' }` on `viewBus`. A **Group by type** toggle switches to a flat list grouped by type.
  - **Meter click:** clicking either meter calls `openDialog('export')`.

- [ ] **Step 1: Write the failing tests** (jsdom; `beforeEach(resetStoreForTests)`):

```tsx
// tests/ui/meters.test.tsx
import { render, screen } from '@testing-library/preact';
import { Meters } from '../../src/ui/layout/Meters';
import { metersView } from '../../src/ui/layout/Meters'; // pure helper exported for tests
test('two-decimal code meter and part meter text and classes', () => {
  expect(metersView({ base64Chars: 640_800, parts: 2_385 }, { codeChars: 8_000_000, partSoftCap: 8_000, partWarn: 16_000 })).toEqual({
    codeText: 'Code 8.01% used', codeLevel: 'ok', partsText: 'Parts 2,385 / 8,000', partsLevel: 'ok', partsNote: '',
  });
  expect(metersView({ base64Chars: 7_000_000, parts: 9_000 }, { codeChars: 8_000_000, partSoftCap: 8_000, partWarn: 16_000 }))
    .toMatchObject({ codeLevel: 'warn', partsLevel: 'high', partsNote: 'laggy' });
  expect(metersView({ base64Chars: 9_000_000, parts: 17_000 }, { codeChars: 8_000_000, partSoftCap: 8_000, partWarn: 16_000 }))
    .toMatchObject({ codeLevel: 'bad', partsLevel: 'bad', partsNote: 'beyond tested' });
  render(<Meters />);
  expect(screen.getByText('Code 0.00% used')).toBeTruthy();
});
```

```tsx
// tests/ui/panels/outliner.test.tsx
test('virtualises 16,000 rows', () => {
  loadDoc(chainDoc(16_000));
  const { container } = render(<Outliner />);
  expect(container.querySelectorAll('[role="treeitem"]').length).toBeLessThanOrEqual(60);
});
test('search by #index', async () => {
  loadDoc(chainDoc(30));
  render(<Outliner />);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: '#17' } });
  expect(screen.getAllByRole('treeitem')).toHaveLength(1);
});
```

```tsx
// tests/ui/panels/stats.test.tsx
test('rows sorted by count with two-decimal percentages; clicking selects the type', () => {
  loadDoc(docOf(part(1, 'Connector'), part(2, 'Part', [sock('1', 1, '1')]), part(3, 'Part', [sock('1', 1, '2')])));
  render(<StatsPanel />);
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows[0].textContent).toContain('Part');
  expect(rows[0].textContent).toContain('66.67');
  fireEvent.click(rows[0]);
  expect([...selectionSig.value.parts].sort()).toEqual([2, 3]);
});
```

```tsx
// tests/ui/panels/issues.test.tsx
test('issues grouped by severity select their parts on click', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Mystery')));
  render(<IssuesPanel />);
  fireEvent.click(screen.getByText(/Mystery/));
  expect([...selectionSig.value.parts]).toEqual([1]);
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/ui/panels tests/ui/meters.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the five files, exporting `metersView` from `Meters.tsx`.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(ui): stats, issues, outliner and limit meters"`

### Task 17: Import and Export dialogs

**Owner:** Haiku (dispatch F)

**Files:**
- Create: `src/state/io.ts`, `src/ui/dialogs/ImportDialog.tsx`, `src/ui/dialogs/ExportDialog.tsx`, `src/ui/dialogs/ExportErrorsDialog.tsx`
- Test: `tests/state/io.test.ts`, `tests/ui/dialogs/io.test.tsx`

**Interfaces:**
- Consumes: `parseShareText`, `toShareCode` (Task 4); `loadDoc`, `docSig`, `issuesSig` (Task 12); `Dialog`, `toast` (Task 15); `buildStats` (Task 9).
- Produces:

```ts
export function importText(text: string): { ok: true; doc: Doc; summary: { parts: number; types: number; errors: number; warnings: number } } | { ok: false; message: string };
export function exportCurrent(): { code: string; issues: Issue[] };
export function codePreview(code: string): string; // codes over 400 chars: first 200 + ' … ' + last 200
```

- Rules:
  - The Import dialog accepts a paste or a dropped `.txt`/`.json` file, shows the summary, then **Open (replace)**. When the doc has history entries, Open asks first: `Replace the current build? Unsaved changes are lost.`
  - The Export dialog shows the summary, `codePreview`, **Copy code** (`navigator.clipboard.writeText`), **Download .txt** (`GrambyEdit-<yyyy-mm-dd>.txt`) and **Download .json** (pretty-printed entries).
  - When there are error-severity issues, `ExportErrorsDialog` lists them first, one line each as `<code>: <message>`, with **Export anyway** and **Cancel**.

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/state/io.test.ts
import { importText, codePreview } from '../../src/state/io';
import { APPENDIX_A_CODE } from '../fixtures/spec-codes';
test('import summary and failure message', () => {
  const r = importText(APPENDIX_A_CODE);
  expect(r.ok && r.summary.parts).toBe(12);
  expect(importText('not a code!')).toEqual({ ok: false, message: 'Not a valid share code: invalid base64 at character 9.' });
});
test('previews of huge codes stay short', () => {
  const p = codePreview('A'.repeat(8_000_000));
  expect(p.length).toBe(403);
  expect(p).toContain(' … ');
});
```

```tsx
// tests/ui/dialogs/io.test.tsx
test('export dialog shows only a preview of huge codes', () => {
  loadDoc(chainDoc(16_000));
  const { container } = render(<ExportDialog open onClose={() => {}} />);
  expect(container.textContent!.length).toBeLessThan(2_000);
});
test('errors block export until confirmed', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Light', [mount('1', 2, '{x}')]), part(2, 'Part')));
  render(<ExportDialog open onClose={() => {}} />);
  expect(screen.getByText('Export anyway')).toBeTruthy();
  expect(screen.getByText(/E-UUID/)).toBeTruthy();
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/state/io.test.ts tests/ui/dialogs/io.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the four files. (`'not a code!'` → after whitespace is stripped, `!` is character 9 of `notacode!`.)
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(ui): import and export dialogs"`

### Task 18: M1 integration, performance check and first deploy

**Owner:** Inline

**Files:**
- Modify: `src/ui/App.tsx`, `src/ui/layout/Shell.tsx`, `src/viewport/debug.ts`
- Create: `tests/perf/budgets.test.ts`

**Interfaces:**
- Consumes: Tasks 12–17.

- [ ] **Step 1: Write the failing perf test** `tests/perf/budgets.test.ts`:

```ts
import { chainDoc } from '../helpers/doc';
import { computePoses } from '../../src/core/pose';
import { validate } from '../../src/core/rules';
import { buildStats } from '../../src/core/stats';
import { codeSize } from '../../src/core/size';
import { realCatalog } from '../helpers/real-catalog';
import { DEFAULT_LIMITS } from '../../src/core/types';
test('one 16K edit cycle (poses + issues + stats + size) under 400 ms', async () => {
  const cat = await realCatalog();
  const d = chainDoc(16_000);
  const t = performance.now();
  computePoses(d, cat, cat.conventions);
  validate(d, cat, DEFAULT_LIMITS, codeSize(d).base64Chars);
  buildStats(d);
  expect(performance.now() - t).toBeLessThan(400);
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/perf` → PASS, or optimise the slow module until it passes.
- [ ] **Step 3: Wire the panels and dialogs.**
  - Put Stats, Issues and Outliner in the right dock, and Meters in the status bar.
  - File menu: Import (`Ctrl+O`) and Export (`Ctrl+E`).
  - Add `__ge.fps()`.
- [ ] **Step 4: Browser check.**
  - Import Appendix A, then Export → Copy. Import the copied code again → identical stats.
  - Load `chainDoc(16000)` via `__ge.importCode`, then `await __ge.fps(3000)` while orbiting → ≥ 50 (record the GPU in the commit message).
- [ ] **Step 5: Deploy** (needs you).
  1. Ask you to create the empty `GrambyEdit` repo on github.com, public or private (spec §20), or to OK `winget install GitHub.cli`.
  2. Then `git remote add origin https://github.com/GamerHagyma/GrambyEdit.git` and `git push -u origin main`.
  3. Ask you to set **Settings → Pages → Source: GitHub Actions**.
  4. Expected: the Pages workflow succeeds, and `https://gamerhagyma.github.io/GrambyEdit/` loads and imports Appendix A.
- [ ] **Step 6: Commit:** `git commit -m "feat: M1 viewer integrated and deployed"`

---

## Milestone M1b — Socket Workbench (spec §12.7)

### Task 19: Socket and calibration probe codes

**Owner:** Haiku (dispatch G1)

**Files:**
- Create: `src/core/probes.ts`
- Test: `tests/core/probes.test.ts`

**Interfaces:**
- Consumes: `encode` (Task 3), `parseShareText` (Task 4), `validate` (Task 8), `realCatalog` (Task 7), `DEFAULT_LIMITS`.
- Produces:

```ts
export interface MarkerColor { readonly name: string; readonly rgb: RGB }
export const MARKER_COLORS: readonly MarkerColor[];
// exactly, in order: red [220,50,47], orange [255,140,0], yellow [255,215,0], green [46,160,67],
// cyan [0,188,212], blue [33,90,230], purple [142,68,173], pink [255,105,180]
export function probeUuid(i: number): Uuid; // `{00000000-0000-4000-8000-${String(i).padStart(12, '0')}}`
export interface ProbeLegend { readonly socket: SocketId | null; readonly side: 'parent' | 'child' | 'calibration'; readonly color: MarkerColor | null; readonly note: string }
export interface ProbeCode { readonly id: string; readonly title: string; readonly code: string; readonly legend: readonly ProbeLegend[] }
export function socketProbes(cat: Catalog, type: string): ProbeCode[];
export function calibrationProbes(cat: Catalog): ProbeCode[];
```

**Construction rules, exactly.**

*Parent probes* — `def.parentSockets` in catalog order, split into chunks of 8. Chunk k:
- id `${type}:parent:${k + 1}`;
- entries `[[type, [], []], ...chunk.map((s, i) => ['ShortStick', [['2', s, 1]], { RGB: MARKER_COLORS[i].rgb }])]`;
- one legend line per socket: `{ socket: s, side: 'parent', color, note: '<color> stick' }`.

*Child probes* — `def.childSockets` in chunks of 8. Chunk k with n sockets:
- id `${type}:child:${k + 1}`;
- entry 1 is `['Base', [], { EphemeralAttachments: { [probeUuid(i)]: { partName: 'Base', cframe: [x_i, 0.25, 0, 1,0,0, 0,1,0, 0,0,1] } } }]`, with `x_i = (i − (n − 1) / 2) × 3`;
- then, for each socket `c_i`: a grey cube `['Part', [['1', probeUuid(i), 1]], { RGB: [128, 128, 128] }]`, immediately followed by `[type, [[c_i, '6', <cube's 1-based index>]], []]`;
- legend: `{ socket: c_i, side: 'child', color: null, note: 'copy ' + (i + 1) + ' from the left: the face touching its grey cube' }`.

Types without parent sockets get no parent probe; types without child sockets get no child probe.

*Calibration probes* — ids `P1`…`P6`. Each legend has `side: 'calibration'`, `socket: null` and one note stating the question:

| id | entries | question (the legend note) |
|---|---|---|
| P1 | `[['Part', [], { RGB: [128,128,128] }], ['Gate-AND', [['4', '6', 1]], []]]` | Which way do the gate's inputs face relative to the cube? |
| P2 | P1 with `{ OrientationX: 90 }` on the gate | Describe how the gate is tilted. |
| P3 | P1 with `{ OrientationY: 90 }` on the gate | Describe how the gate is turned. |
| P4 | `[['Base', [], { EphemeralAttachments: { [probeUuid(1)]: { partName: 'Base', cframe: [1, 0.25, 0, 0,0,1, 0,1,0, -1,0,0] } } }], ['Gate-AND', [['4', probeUuid(1), 1]], []]]` | Is the gate turned 90° about the vertical? |
| P5 | `[['Base', [], { OrientationY: 90, EphemeralAttachments: { [probeUuid(1)]: { partName: 'Base', cframe: [1.5, 0.25, 0, 1,0,0, 0,1,0, 0,0,1] } } }], ['Gate-AND', [['4', probeUuid(1), 1]], []]]` | Does the gate sit along the Base's +X or along Z? |
| P6 | `[['Roof', [], { EphemeralAttachments: { [probeUuid(1)]: { partName: 'Glass', cframe: <identity> }, [probeUuid(2)]: { partName: 'Roof', cframe: <identity> } } }], ['Part', [['1', probeUuid(1), 1]], { RGB: [220,50,47] }], ['Part', [['1', probeUuid(2), 1]], { RGB: [33,90,230] }]]` | Where do the red (Glass) and blue (Roof) cubes sit? |

- [ ] **Step 1: Write the failing tests.**

```ts
import { socketProbes, calibrationProbes, probeUuid } from '../../src/core/probes';
import { parseShareText } from '../../src/core/share';
import { decode } from '../../src/core/codec';
import { validate } from '../../src/core/rules';
import { DEFAULT_LIMITS } from '../../src/core/types';
import { realCatalog } from '../helpers/real-catalog';
const entries = (code: string) => { const r = decode(code); if (!r.ok) throw new Error('bad'); return r.value as any[]; };

test('Splitter_2 parent probe puts a colored ShortStick on sockets 4, 6, 10', async () => {
  const p = socketProbes(await realCatalog(), 'Splitter_2').find((x) => x.id === 'Splitter_2:parent:1')!;
  const e = entries(p.code);
  expect(e[0]).toEqual(['Splitter_2', [], []]);
  expect(e.slice(1).map((x) => x[1][0])).toEqual([['2', '4', 1], ['2', '6', 1], ['2', '10', 1]]);
  expect(e[1]).toEqual(['ShortStick', [['2', '4', 1]], { RGB: [220, 50, 47] }]);
  expect(p.legend.map((l) => [l.socket, l.color!.name])).toEqual([['4', 'red'], ['6', 'orange'], ['10', 'yellow']]);
});
test('Chassis parent sockets split into four codes of eight', async () =>
  expect(socketProbes(await realCatalog(), 'Chassis').filter((p) => p.id.includes(':parent:')).map((p) => p.legend.length)).toEqual([8, 8, 8, 8]));
test('child probe mounts each copy by one child socket onto a grey cube', async () => {
  const e = entries(socketProbes(await realCatalog(), 'Switch').find((x) => x.id === 'Switch:child:1')!.code);
  expect(e[1]).toEqual(['Part', [['1', probeUuid(0), 1]], { RGB: [128, 128, 128] }]);
  expect(e[2]).toEqual(['Switch', [['1', '6', 2]], []]);
  expect(e[4]).toEqual(['Switch', [['3', '6', 4]], []]);
});
test('every probe imports and validates without errors', async () => {
  const cat = await realCatalog();
  for (const type of ['Part', 'Connector', 'Gate-AND', 'Splitter_4', 'Chassis', 'Wire', 'Base', 'Switch'])
    for (const p of [...socketProbes(cat, type), ...calibrationProbes(cat)]) {
      const r = parseShareText(p.code);
      expect(r.ok, p.id).toBe(true);
      if (r.ok) expect(validate(r.doc, cat, DEFAULT_LIMITS, p.code.length).filter((i) => i.severity === 'error'), p.id).toEqual([]);
    }
});
test('calibration probes P1–P6', async () =>
  expect(calibrationProbes(await realCatalog()).map((p) => p.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']));
```

- [ ] **Step 2: Run it.** `npx vitest run tests/core/probes.test.ts` → FAIL.
- [ ] **Step 3: Implement** `probes.ts`.
- [ ] **Step 4: Run it again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(core): socket and calibration probe codes"`

### Task 20: Socket Workbench mode

**Owner:** Inline

**Files:**
- Create: `src/storage/idb.ts`, `src/storage/sockets.ts`, `src/state/workbench.ts`, `src/tools/workbench.ts`, `src/viewport/workbench-view.ts`
- Modify: `src/viewport/index.ts` (workbench mode), `src/ui/layout/Toolbar.tsx` (Sockets button)
- Test: `tests/storage/idb.test.ts`, `tests/state/workbench.test.ts`

**Interfaces:**
- Consumes: `frameFromNormal` (Task 2), socket-geometry (Task 7), `socketOverridesSig` / `catalogSig` (Task 12), picking (Task 14).
- Produces:

```ts
// storage/idb.ts
export type StoreName = 'creations' | 'autosave' | 'thumbs' | 'sockets';
export class StorageError extends Error { constructor(readonly kind: 'quota' | 'unavailable' | 'other', message: string) }
export function openDb(): Promise<IDBDatabase>; // 'grambyedit' v1, creates the four stores ('creations' keyPath 'id')
export function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined>;
export function idbPut(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void>;
export function idbDelete(store: StoreName, key: IDBValidKey): Promise<void>;
export function idbAll<T>(store: StoreName): Promise<T[]>;
// storage/sockets.ts
export function loadSocketOverrides(): Promise<SocketGeometryFile>; // key 'overrides'; empty file when absent
export function saveSocketOverrides(file: SocketGeometryFile): Promise<void>;
// state/workbench.ts
export const wbTypeSig: Signal<string | null>;
export const wbSocketSig: Signal<SocketId | null>;
export function captureSocket(type: string, socket: SocketId, cframe: CFrame12): Promise<void>; // updates socketOverridesSig, persists
export function clearSocket(type: string, socket: SocketId): Promise<void>;
export function captureProgress(cat: Catalog, file: SocketGeometryFile): { type: string; captured: number; total: number; corpusCount: number }[]; // corpusCount desc, then type
export function exportSocketFile(file: SocketGeometryFile, now?: Date): string; // 2-space JSON, captured = yyyy-mm-dd
export function importSocketFile(text: string): Promise<{ ok: true } | { ok: false; error: string }>; // replaces overrides
export function candidateSpots(cat: Catalog, type: string): { label: string; cframe: CFrame12 }[];
```

**Candidate spots, exactly:**
- the six bbox face centres, labelled `Face +X`, `Face −X`, `Face +Y`, `Face −Y`, `Face +Z`, `Face −Z`, using `approxSocketFrame` rotations;
- one per sub-part centroid, labelled `Sub-part <name>`;
- one per named socket, labelled `Hint: <name>`.

**Workbench view:**
- One instance of the chosen part, framed in the viewport.
- Socket rings: solid when captured, hollow when approximate.
- Candidate dots.
- A `TransformControls` gizmo on the selected socket frame.
- **Test mate** attaches a grey `Part` cube to the selected socket using the current conventions.
- A click on the mesh with a socket selected captures `frameFromNormal(hit.point, hit.normal)` in part space.

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/storage/idb.test.ts
import 'fake-indexeddb/auto';
import { idbPut, idbGet, idbAll, idbDelete } from '../../src/storage/idb';
test('put, get, all, delete', async () => {
  await idbPut('sockets', { a: 1 }, 'overrides');
  expect(await idbGet('sockets', 'overrides')).toEqual({ a: 1 });
  await idbPut('creations', { id: 'x', name: 'n' });
  expect((await idbAll<any>('creations')).map((r) => r.id)).toEqual(['x']);
  await idbDelete('creations', 'x');
  expect(await idbAll('creations')).toEqual([]);
});
```

```ts
// tests/state/workbench.test.ts
import 'fake-indexeddb/auto';
import { baseCatalogSig, catalogSig, resetStoreForTests } from '../../src/state/store';
import { captureSocket, captureProgress, exportSocketFile, importSocketFile, candidateSpots } from '../../src/state/workbench';
import { loadSocketOverrides } from '../../src/storage/sockets';
import { emptySocketGeometry, parseSocketGeometry } from '../../src/core/socket-geometry';
import { MINI } from '../helpers/catalog';
beforeEach(() => { resetStoreForTests(); baseCatalogSig.value = MINI; });
test('a capture overrides the effective catalog at once and persists', async () => {
  await captureSocket('Connector', '5', [0, -0.2, 0, 1, 0, 0, 0, -1, 0, 0, 0, -1]);
  expect(catalogSig.value!.parts.Connector.sockets['5'].frameSource).toBe('captured');
  expect((await loadSocketOverrides()).parts.Connector.sockets['5'].cframe[1]).toBe(-0.2);
});
test('progress is sorted by corpus usage', () =>
  expect(captureProgress(MINI, emptySocketGeometry())[0]).toEqual({ type: 'Connector', captured: 0, total: 6, corpusCount: 11484 }));
test('export parses back; import reports bad files', async () => {
  expect(parseSocketGeometry(JSON.parse(exportSocketFile(emptySocketGeometry(), new Date('2026-10-23')))).ok).toBe(true);
  expect(await importSocketFile('{"format":"x"}')).toEqual({ ok: false, error: 'format must be "grambyedit-sockets"' });
});
test('Part candidates include the +X face frame', () =>
  expect(candidateSpots(MINI, 'Part')).toContainEqual({ label: 'Face +X', cframe: [0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0] }));
```

- [ ] **Step 2: Run them.** `npx vitest run tests/storage/idb.test.ts tests/state/workbench.test.ts` → FAIL.
- [ ] **Step 3: Implement** the files. `parseSocketGeometry` (Task 7) reports `format must be "grambyedit-sockets"` first, then the `frameConvention` error.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Browser check.**
  1. Toolbar → Sockets → pick `Connector`. One Connector fills the view, with 6 hollow rings and the candidate dots.
  2. Select socket 5 and click the `Face −Y` dot. Progress reads `1/6`, the ring turns solid, and **Test mate** shows a cube under it.
  3. Reload the page: the capture is still there.
  4. **Export** downloads a file that `parseSocketGeometry` accepts.
- [ ] **Step 6: Commit:** `git commit -m "feat(workbench): socket capture mode with live catalog overrides"`

### Task 21: Workbench panel

**Owner:** Haiku (dispatch G2)

**Files:**
- Create: `src/ui/panels/WorkbenchPanel.tsx`, `src/ui/widgets/CopyButton.tsx`
- Test: `tests/ui/panels/workbench.test.tsx`

**Interfaces:**
- Consumes: Task 20 workbench API, Task 19 probes, `catalogSig`, `socketOverridesSig`.
- Produces: `<WorkbenchPanel/>` (left dock in Sockets mode); `CopyButton({ text, label })`, which shows `Copied` for 2 s.

**Rules:**
- **Part list:** a list (`role="listbox"`, rows `role="option"`) with search. Each row shows the type, `${captured}/${total}` and the corpus count; rows follow `captureProgress` order.
- **Socket table:** for the chosen type, one row per socket with id, side, role, name and status (`captured` / `approx`), plus **Clear** on captured rows. Clicking a row sets `wbSocketSig`.
- **Probes section:** every `ProbeCode` with its title, a `CopyButton` and its legend rows (color swatch + note).
- **Calibration section:** `calibrationProbes`.
- **Footer:** **Export file** downloads `socket_geometry.json`; **Import file** takes a file input and shows the returned error text.

- [ ] **Step 1: Write the failing tests** (jsdom + `fake-indexeddb/auto`):

```tsx
import { render, screen, fireEvent } from '@testing-library/preact';
import { WorkbenchPanel } from '../../../src/ui/panels/WorkbenchPanel';
import { baseCatalogSig, resetStoreForTests } from '../../../src/state/store';
import { MINI } from '../../helpers/catalog';
beforeEach(() => { resetStoreForTests(); baseCatalogSig.value = MINI; });
test('parts listed by usage with progress', () => {
  render(<WorkbenchPanel />);
  const first = screen.getAllByRole('option')[0];
  expect(first.textContent).toContain('Connector');
  expect(first.textContent).toContain('0/6');
});
test('choosing Splitter_2 shows six sockets and the red-stick legend', () => {
  render(<WorkbenchPanel />);
  fireEvent.click(screen.getByText('Splitter_2'));
  expect(screen.getAllByRole('row').filter((r) => /approx|captured/.test(r.textContent!))).toHaveLength(6);
  expect(screen.getByText('red stick')).toBeTruthy();
});
test('copy button copies a probe code', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<WorkbenchPanel />);
  fireEvent.click(screen.getByText('Splitter_2'));
  fireEvent.click(screen.getAllByText('Copy code')[0]);
  expect(writeText.mock.calls[0][0]).toMatch(/^[A-Za-z0-9+/]+=*$/);
  expect(await screen.findByText('Copied')).toBeTruthy();
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/ui/panels/workbench.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the two files.
- [ ] **Step 4: Run it again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(ui): socket workbench panel"`

---

## Milestone M2 — Editing

### Task 22: Editing operations

**Owner:** Haiku (dispatch H)

**Files:**
- Create: `src/core/ops/parts.ts`, `src/core/ops/props.ts`, `src/core/ops/paint.ts`, `src/core/ops/conns.ts`, `src/core/ops/points.ts`, `tests/helpers/random.ts`
- Test: `tests/core/ops/parts.test.ts`, `tests/core/ops/props.test.ts`, `tests/core/ops/conns.test.ts`, `tests/core/ops/points.test.ts`, `tests/core/ops/random.test.ts`

**Interfaces:**
- Consumes: `Draft`, `transact`, `applyPatch` (Task 11); rules and graph (Task 8); `Poses`, `computePoses`, `DEFAULT_CONVENTIONS` (Task 10); `matrix4ToCf` (Task 3); `newUuid` (Task 3); `checkInvariants`, `fromEntries` (Task 4).
- Produces:

```ts
// parts.ts
export function addPart(d: Draft, type: string, props?: Record<string, Json>, conns?: Conn[]): PartId;
export function deleteParts(d: Draft, ids: Iterable<PartId>, poses: Poses): { reposed: PartId[]; loosened: PartId[] };
// props.ts
export const UNSET: unique symbol;
export function propApplies(cat: Catalog, part: Part, key: string): boolean; // key in def.props, or already set on the part
export function setProp(d: Draft, cat: Catalog, ids: Iterable<PartId>, key: string, value: Json | typeof UNSET): { applied: PartId[]; skipped: PartId[] };
// paint.ts
export function paint(d: Draft, cat: Catalog, ids: Iterable<PartId>, rgb: RGB): { applied: PartId[]; skipped: PartId[] };
// conns.ts
export function addConn(d: Draft, cat: Catalog, id: PartId, conn: Conn, opts: { asPose: boolean }): Verdict;
export function removeConn(d: Draft, id: PartId, index: number): void;
export function detach(d: Draft, id: PartId, poses: Poses): void;
export function makePoseJoint(d: Draft, id: PartId, index: number): Verdict;
// points.ts
export function addPoint(d: Draft, host: PartId, cframe: CFrame12, partName: string, uuid?: Uuid): Uuid;
export function setPointCFrame(d: Draft, host: PartId, uuid: Uuid, cframe: CFrame12): void;
export function deletePoint(d: Draft, host: PartId, uuid: Uuid, childPolicy: 'detach' | 'delete', poses: Poses): void;
// tests/helpers/random.ts
export function mulberry32(seed: number): () => number;
```

**Rules, exactly:**
- **`deleteParts`:**
  - Drops every surviving conn that targets a deleted part.
  - If a survivor lost `conns[0]`, its first remaining conn for which `wouldCreatePoseCycle` is false moves to index 0. If none qualifies, the order stays.
  - With no conns left, the survivor gets `setLayout(id, matrix4ToCf(poses.world.get(id)))`.
  - Deletes points that only the deleted parts' conns used.
  - `reposed` lists survivors whose `conns[0]` changed; `loosened` lists those that became roots.
- **`addConn`:**
  - Verdict = `canBeChild` (kind `mount` for point targets, else `joint`) plus `canBeParent` (socket targets) or `canTakeChild` (point targets).
  - When `asPose` is true, or the part has no conns, and `wouldCreatePoseCycle` → `{ ok: false, code: 'pose-cycle', message: 'That joint would make this part hold itself up through its own children.' }`.
  - On success: insert at 0 for `asPose`, else append. A former root loses its layout.
- **`detach`:** removes `conns[0]`, then applies the same promotion and loosening rules.
- **`makePoseJoint`:** moves `conns[index]` to index 0 unless that creates a pose cycle (same message).
- **`addPoint`:** uuid defaults to `newUuid()`; a null `points` becomes a new Map.
- **`deletePoint`:** a child on the point is detached (`'detach'`) or deleted (`'delete'`) first. An emptied map stays a Map (exported `[]`).
- **`setProp`:** throws `Error('use point ops for EphemeralAttachments')` for that key. `UNSET` deletes the key.
- **`paint`:** applies only to `def.paintable` types.

- [ ] **Step 1: Write the failing tests** (key cases; mirror each rule above with one test):

```ts
// tests/core/ops/props.test.ts — the user's example
import { transact } from '../../../src/core/ops/transact';
import { setProp, UNSET } from '../../../src/core/ops/props';
import { paint } from '../../../src/core/ops/paint';
import { docOf, part } from '../../helpers/doc';
import { MINI } from '../../helpers/catalog';
test('Bullets on 2 Mags + 1 ShortStick changes only the mags', () => {
  const d0 = docOf(part(1, 'Mag', [], { Bullets: 10 }), part(2, 'Mag', [], { Bullets: 20 }), part(3, 'ShortStick'));
  let res: unknown;
  const { doc } = transact(d0, 'bullets', (d) => { res = setProp(d, MINI, [1, 2, 3], 'Bullets', 30); });
  expect(res).toEqual({ applied: [1, 2], skipped: [3] });
  expect(doc.parts.get(2)!.props.Bullets).toBe(30);
  expect(doc.parts.get(3)!.props).toEqual({});
  expect(transact(doc, 'reset', (d) => setProp(d, MINI, [1], 'Bullets', UNSET)).doc.parts.get(1)!.props).toEqual({});
});
test('paint skips types that cannot be painted', () => {
  let res: unknown;
  transact(docOf(part(1, 'Part'), part(2, 'Gate-AND')), 'paint', (d) => { res = paint(d, MINI, [1, 2], [1, 2, 3]); });
  expect(res).toEqual({ applied: [1], skipped: [2] });
});
```

```ts
// tests/core/ops/parts.test.ts
test('deleting a parent promotes a non-cycling secondary joint or loosens the child', () => {
  const d0 = docOf(part(1, 'Gate-AND'), part(2, 'Gate-AND'), part(3, 'Wire', [sock('1', 1, '1'), sock('3', 2, '2')]), part(4, 'Part'), part(5, 'Part', [sock('1', 4, '6')]));
  const poses = computePoses(d0, MINI, DEFAULT_CONVENTIONS);
  let res: any;
  const { doc } = transact(d0, 'del', (d) => { res = deleteParts(d, [1, 4], poses); });
  expect(doc.parts.get(3)!.conns).toEqual([sock('3', 2, '2')]);
  expect(res).toEqual({ reposed: [3], loosened: [5] });
  expect(doc.layout.get(5)).toEqual(matrix4ToCf(poses.world.get(5)!));
});
test('deleting a mounted part removes its point; unused points survive', () => {
  const d0 = docOf(part(1, 'Base', [], {}, [pt('{a}'), pt('{b}')]), part(2, 'Part', [mount('1', 1, '{a}')]));
  const { doc } = transact(d0, 'del', (d) => deleteParts(d, [2], computePoses(d0, MINI, DEFAULT_CONVENTIONS)));
  expect([...doc.parts.get(1)!.points!.keys()]).toEqual(['{b}']);
});
```

```ts
// tests/core/ops/conns.test.ts
test('addConn refuses unavailable sockets and pose cycles', () => {
  const d0 = docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')]), part(3, 'Part'));
  transact(d0, 'x', (d) => {
    expect(addConn(d, MINI, 3, sock('1', 1, '6'), { asPose: true })).toMatchObject({ ok: false, code: 'socket-used' });
    expect(addConn(d, MINI, 1, sock('1', 2, '6'), { asPose: true })).toMatchObject({ ok: false, code: 'pose-cycle' });
    expect(addConn(d, MINI, 3, sock('1', 2, '6'), { asPose: true })).toEqual({ ok: true });
  });
});
```

```ts
// tests/core/ops/points.test.ts
test('deleting a point with a child: detach keeps the child where it was', () => {
  const d0 = docOf(part(1, 'Base', [], {}, [pt('{a}', [2, 0.25, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])]), part(2, 'Part', [mount('1', 1, '{a}')]));
  const poses = computePoses(d0, MINI, DEFAULT_CONVENTIONS);
  const { doc } = transact(d0, 'x', (d) => deletePoint(d, 1, '{a}', 'detach', poses));
  expect(doc.parts.get(2)!.conns).toEqual([]);
  expect(doc.layout.get(2)).toEqual(matrix4ToCf(poses.world.get(2)!));
  expect(doc.parts.get(1)!.points!.size).toBe(0);
});
```

```ts
// tests/core/ops/random.test.ts — Review Focus 5
test('1,000 random ops keep invariants and create no structural errors', () => {
  const rnd = mulberry32(7);
  const start = (fromEntries(APPENDIX_B_JSON as Json[]) as any).doc;
  let doc = start;
  const patches: Patch[] = [];
  const ops = ['addOnSocket', 'addOnPoint', 'delete', 'paint', 'detach', 'deletePoint', 'removeSecondary'];
  for (let i = 0; i < 1000; i++) {
    const op = ops[Math.floor(rnd() * ops.length)];
    const poses = computePoses(doc, MINI, DEFAULT_CONVENTIONS);
    const r = transact(doc, op, (d) => applyRandomOp(d, op, rnd, poses));
    doc = r.doc;
    if (r.patch) patches.push(r.patch);
    expect(checkInvariants(doc)).toEqual([]);
    const bad = validate(doc, MINI, DEFAULT_LIMITS, 0).filter((x) => ['E-MATE', 'E-TEAR', 'E-POINT-SHARED', 'E-UUID', 'E-REF'].includes(x.code));
    expect(bad).toEqual([]);
  }
  for (const p of patches.reverse()) doc = applyPatch(doc, p, 'undo');
  expect(doc).toEqual(start);
});
```

  `applyRandomOp` is a test-local helper. It picks random targets and only uses ops through their public functions:
  - `addOnSocket`: a new `Part` joined to a random free parent socket via `addConn` with `asPose: true`; it is deleted again if the verdict fails.
  - `addOnPoint`: `addPoint` plus a mounted `Part`.
  - `delete`, `paint`, `detach`, `deletePoint` (random policy) and `removeSecondary` (a conn at index > 0).

- [ ] **Step 2: Run them.** `npx vitest run tests/core/ops` → FAIL.
- [ ] **Step 3: Implement** the five op files and `mulberry32`.
- [ ] **Step 4: Run them again.** `npx vitest run tests/core/ops` → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(core): editing operations with invariant-checked random tests"`

### Task 23: Move semantics

**Owner:** Inline

**Files:**
- Create: `src/core/ops/move.ts`
- Test: `tests/core/ops/move.test.ts`

**Interfaces:**
- Consumes: Task 22 ops, Task 10 conventions/pose, Task 8 rules/graph.
- Produces:

```ts
export type PoseTarget =
  | { kind: 'socket'; part: PartId; socket: SocketId; childSocket?: SocketId }
  | { kind: 'point'; part: PartId; uuid: Uuid }
  | { kind: 'surface'; part: PartId; frame: Matrix4 /* desired child-socket frame, world space */; partName: string };
export type MoveResult = { ok: true; via: 'point' | 'layout' } | { ok: false; reason: string };
export function chooseMountSocket(doc: Doc, cat: Catalog, id: PartId): SocketId | null;
export function makeFreeMovable(d: Draft, cat: Catalog, conv: Conventions, poses: Poses, id: PartId): MoveResult;
export function setWorldPose(d: Draft, cat: Catalog, conv: Conventions, poses: Poses, id: PartId, world: Matrix4): void;
export function retargetPose(d: Draft, cat: Catalog, conv: Conventions, poses: Poses, id: PartId, target: PoseTarget): Verdict;
export function topmost(doc: Doc, ids: Iterable<PartId>): PartId[];
export function nativeRotate(d: Draft, cat: Catalog, conv: Conventions, poses: Poses, id: PartId, axis: 'X' | 'Y', degrees: number): void;
```

**Rules:**
- Spec §9.3, cases 1–4.
- `chooseMountSocket` returns the first child socket whose whole piece is unused, ignoring the joint being replaced. It tries `defaultMount` first, then catalog order.
- New points use the parent's `mainPartName` and `pointFrameFor`, so poses do not change.
- The refusal reason is exactly: `${type} #${index} has no free connection point to mount on without breaking its joint to ${parentType} #${parentIndex}. Detach it first to move it freely.`
- `retargetPose`:
  - refuses targets inside `poseDescendants(id)` with `{ ok: false, code: 'pose-cycle', message: 'A part cannot be attached to its own children.' }`;
  - a signal joint at `conns[0]` is kept as a secondary connection (§9.3).
- `nativeRotate`: on socket-joined parts where `propApplies(Orientation<axis>)`, adds `degrees` to that prop. Otherwise it calls `makeFreeMovable` and rotates the point frame about the part's own origin.

- [ ] **Step 1: Write the failing tests.**

```ts
import { Matrix4 } from 'three';
import { transact } from '../../../src/core/ops/transact';
import { makeFreeMovable, retargetPose, nativeRotate } from '../../../src/core/ops/move';
import { computePoses } from '../../../src/core/pose';
import { DEFAULT_CONVENTIONS as C } from '../../../src/core/conventions';
import { isSocketUsed, validate } from '../../../src/core/rules';
import { DEFAULT_LIMITS } from '../../../src/core/types';
import { docOf, part, sock } from '../../helpers/doc';
import { MINI } from '../../helpers/catalog';
import { importCode } from '../../helpers/import';
import { realCatalog } from '../../helpers/real-catalog';
import { corpusCodes } from '../../fixtures/corpus';
const same = (a: Matrix4, b: Matrix4) => a.elements.forEach((v, i) => expect(v).toBeCloseTo(b.elements[i], 9));

test('a structural socket joint becomes a point on the same parent without moving', () => {
  const d0 = docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')]));
  const poses = computePoses(d0, MINI, C);
  const { doc } = transact(d0, 'free', (d) => expect(makeFreeMovable(d, MINI, C, poses, 2)).toEqual({ ok: true, via: 'point' }));
  expect(doc.parts.get(2)!.conns[0].target.kind).toBe('point');
  expect(isSocketUsed(doc, 1, '6')).toBe(false);
  same(computePoses(doc, MINI, C).world.get(2)!, poses.world.get(2)!);
});
test('moving a signal-joined Splitter keeps its signal joint', () => {
  const d0 = docOf(part(1, 'Gate-AND'), part(2, 'Splitter_2', [sock('3', 1, '1')]));
  const { doc } = transact(d0, 'free', (d) => makeFreeMovable(d, MINI, C, computePoses(d0, MINI, C), 2));
  const conns = doc.parts.get(2)!.conns;
  expect(conns[0]).toMatchObject({ self: '5', target: { kind: 'point', part: 1 } });
  expect(conns[1]).toEqual(sock('3', 1, '1'));
  expect(validate(doc, MINI, DEFAULT_LIMITS, 0).filter((i) => i.code === 'E-TEAR')).toEqual([]);
});
test('a Light on a gate output cannot be freed and says why', () => {
  const d0 = docOf(part(1, 'Gate-AND'), part(2, 'Light', [sock('1', 1, '1')]));
  transact(d0, 'free', (d) => expect(makeFreeMovable(d, MINI, C, computePoses(d0, MINI, C), 2)).toEqual({ ok: false,
    reason: 'Light #2 has no free connection point to mount on without breaking its joint to Gate-AND #1. Detach it first to move it freely.' }));
});
test("retargetPose refuses the part's own children", () => {
  const d0 = docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')]), part(3, 'Part', [sock('1', 2, '6')]));
  transact(d0, 'x', (d) => expect(retargetPose(d, MINI, C, computePoses(d0, MINI, C), 2, { kind: 'socket', part: 3, socket: '2' }))
    .toMatchObject({ ok: false, code: 'pose-cycle' }));
});
test('native rotate writes OrientationY on socket joints', () => {
  const d0 = docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')]));
  expect(transact(d0, 'r', (d) => nativeRotate(d, MINI, C, computePoses(d0, MINI, C), 2, 'Y', 90)).doc.parts.get(2)!.props.OrientationY).toBe(90);
});
test('freeing any corpus relay never creates E-TEAR or E-MATE', async () => {
  const cat = await realCatalog();
  for (const code of corpusCodes().slice(0, 60)) {
    const d0 = importCode(code);
    const poses = computePoses(d0, cat, cat.conventions);
    const relays = [...d0.parts.values()].filter((p) => /^(Wire|Splitter_\d)$/.test(p.type)).slice(0, 50);
    for (const p of relays) {
      const { doc } = transact(d0, 'free', (d) => makeFreeMovable(d, cat, cat.conventions, poses, p.id));
      const before = validate(d0, cat, DEFAULT_LIMITS, 0).filter((i) => i.code === 'E-TEAR' || i.code === 'E-MATE').length;
      const after = validate(doc, cat, DEFAULT_LIMITS, 0).filter((i) => i.code === 'E-TEAR' || i.code === 'E-MATE').length;
      expect(after).toBe(before);
    }
  }
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/ops/move.test.ts` → FAIL.
- [ ] **Step 3: Implement** `move.ts`.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(core): signal-safe move semantics"`

### Task 24: Clipboard, prefab insertion and duplicate

**Owner:** Haiku (dispatch I)

**Files:**
- Create: `src/core/ops/clipboard.ts`
- Test: `tests/core/ops/clipboard.test.ts`

**Interfaces:**
- Consumes: Task 22 ops, Task 23 `retargetPose`/`PoseTarget`, Task 10 poses/conventions, Task 3 `newUuid`.
- Produces:

```ts
export function extractSubDoc(doc: Doc, poses: Poses, ids: Iterable<PartId>): Doc;
export function insertSubDoc(d: Draft, cat: Catalog, conv: Conventions, poses: Poses, sub: Doc,
  at: { target: PoseTarget } | { root: CFrame12 }): Map<PartId, PartId>;
export function duplicate(d: Draft, cat: Catalog, conv: Conventions, poses: Poses, ids: Iterable<PartId>): PartId[];
```

**Rules:**
- **`extractSubDoc`:**
  - Renumbers parts 1..n in doc order.
  - Keeps conns between included parts, and only the points those conns use; drops everything else.
  - Parts left without conns become roots. Their layout = `inverse(world(firstRoot)) · world(part)`, so the first root sits at identity.
- **`insertSubDoc`:**
  - Allocates new ids in sub order and appends them.
  - Regenerates every uuid, keeping each host's old→new mapping consistent for its children.
  - `{ root }` → each sub root's layout = `root · subLayout`.
  - `{ target }` → the first sub root attaches via `retargetPose`; the other roots are laid out relative to its resulting world pose.
- **`duplicate`:**
  - Runs extract, then insert.
  - Re-attaches each copied top-level part to its original's pose host through a new point at the original's world pose: a `retargetPose` surface target whose frame is `world(original) · S(copy, mount)`.
  - Copies that cannot mount become roots at the same world pose.
  - Returns the new ids.

- [ ] **Step 1: Write the failing tests:**

```ts
test('extract keeps internal joints and used points, drops outside joints', () => {
  const d0 = docOf(part(1, 'Base', [], {}, [pt('{a}'), pt('{b}')]), part(2, 'Part', [mount('1', 1, '{a}')]), part(3, 'Part', [sock('1', 2, '6')]));
  const sub = extractSubDoc(d0, computePoses(d0, MINI, C), [2, 3]);
  expect(sub.order).toEqual([1, 2]);
  expect(sub.parts.get(1)!.conns).toEqual([]);
  expect(sub.parts.get(2)!.conns).toEqual([sock('1', 1, '6')]);
  expect(sub.layout.get(1)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
});
test('inserting a prefab twice gives fresh ids and fresh uuids', () => {
  const sub = docOf(part(1, 'Base', [], {}, [pt('{a}')]), part(2, 'Part', [mount('1', 1, '{a}')]));
  const d0 = docOf(part(1, 'Part'));
  const { doc } = transact(d0, 'ins', (d) => {
    insertSubDoc(d, MINI, C, computePoses(d0, MINI, C), sub, { root: [5, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] });
    insertSubDoc(d, MINI, C, computePoses(d0, MINI, C), sub, { root: [9, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] });
  });
  const uuids = [...doc.parts.values()].flatMap((p) => [...(p.points?.keys() ?? [])]);
  expect(doc.order).toEqual([1, 2, 3, 4, 5]);
  expect(new Set(uuids).size).toBe(2);
  expect(uuids).not.toContain('{a}');
  expect(checkInvariants(doc)).toEqual([]);
});
test('duplicate keeps world poses and mounts copies on the same host', () => {
  const d0 = docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')]));
  const poses = computePoses(d0, MINI, C);
  let ids: number[] = [];
  const { doc } = transact(d0, 'dup', (d) => { ids = duplicate(d, MINI, C, poses, [2]); });
  expect(doc.parts.get(ids[0])!.conns[0].target).toMatchObject({ kind: 'point', part: 1 });
  computePoses(doc, MINI, C).world.get(ids[0])!.elements.forEach((v, i) => expect(v).toBeCloseTo(poses.world.get(2)!.elements[i], 9));
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/ops/clipboard.test.ts` → FAIL.
- [ ] **Step 3: Implement** `clipboard.ts`.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(core): sub-doc extract/insert and duplicate"`

### Task 25: Transform tools

**Owner:** Inline

**Files:**
- Create: `src/tools/transform.ts`, `src/tools/modal.ts`, `src/viewport/gizmo.ts`
- Test: `tests/tools/transform.test.ts`

**Interfaces:**
- Consumes: Task 23 move API, Task 14 tool manager and picking, Task 12 store.
- Produces (pure helpers, used by the tools):

```ts
export function pivotOf(poses: Poses, ids: readonly PartId[], mode: 'median' | 'active' | 'individual', active: PartId | null): Vector3;
export function snapValue(v: number, step: number): number; // round half away from zero to the step
export function constrainDelta(delta: Vector3, axis: 'X' | 'Y' | 'Z' | null): Vector3;
```

**Behaviour** (spec §12.4, §9.3):
- **Gizmo moves and rotates:** `TransformControls` (restyled to the tokens) on a proxy at `pivotOf`, with World/Local space and snapping from settings.
- **Modal G/R:** X/Y/Z constraints, typed numbers, Enter or LMB to confirm, Esc or RMB to cancel.
- **Drag re-attach:** snaps to free sockets (via `canBeParent` + `defaultChildSocket`), else to part surfaces. Empty space cancels.
- **`Ctrl+R` / `Ctrl+T`:** `nativeRotate` by 90° about Y / X.
- **Commits:** the preview renders an override during the drag and commits one transaction on release (label `Move ${n} parts` / `Rotate ${n} parts`), calling `makeFreeMovable` + `setWorldPose` on `topmost(selection)`. Refused parts produce a toast listing their reasons.

- [ ] **Step 1: Write the failing tests:**

```ts
import { Matrix4 } from 'three';
import { pivotOf, snapValue, constrainDelta } from '../../src/tools/transform';
import { Vector3 } from 'three';
test('pivot, snapping and axis constraints', () => {
  const poses = { world: new Map([[1, new Matrix4().makeTranslation(0, 0, 0)], [2, new Matrix4().makeTranslation(2, 0, 0)], [3, new Matrix4().makeTranslation(4, 3, 0)]]), flags: new Map(), approxCount: 0 };
  expect(pivotOf(poses, [1, 2, 3], 'median', null).toArray()).toEqual([2, 1, 0]);
  expect(pivotOf(poses, [1, 2, 3], 'active', 3).toArray()).toEqual([4, 3, 0]);
  expect([snapValue(0.37, 0.25), snapValue(0.38, 0.25), snapValue(-0.38, 0.25)]).toEqual([0.25, 0.5, -0.5]);
  expect(constrainDelta(new Vector3(1, 2, 3), 'Y').toArray()).toEqual([0, 2, 0]);
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/tools/transform.test.ts` → FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run it again.** Same command → PASS.
- [ ] **Step 5: Browser check.**
  1. **Modal move:** select a point-mounted part, press `G`, `X`, type `2`, Enter → it moves +2 studs along X, with exactly one new history entry. Repeat and press Esc → the doc is unchanged.
  2. **Gizmo conversion:** gizmo-drag a socket-joined `Part` → it converts to a point mount without jumping.
  3. **Native rotate:** `Ctrl+R` on a socket-joined part → `OrientationY` reads +90 in Properties.
  4. **Drag re-attach:** drag a part onto a free socket → it re-attaches.
  5. **Refusal:** try to move a `Light` that sits on a gate output → the refusal toast shows.
- [ ] **Step 6: Commit:** `git commit -m "feat(tools): gizmo, modal transforms and drag re-attach"`

### Task 26: Part browser, picker, thumbnails and favourites

**Owner:** Haiku (dispatch J)

**Files:**
- Create: `src/ui/panels/PartBrowser.tsx`, `src/ui/widgets/PartPicker.tsx`, `src/ui/widgets/PartCard.tsx`, `src/ui/widgets/fuzzy.ts`, `src/state/favourites.ts`, `src/assets/thumbnails.ts`
- Test: `tests/ui/panels/browser.test.tsx`, `tests/state/favourites.test.ts`, `tests/ui/fuzzy.test.ts`, `tests/assets/thumbnails.test.ts`

**Interfaces:**
- Consumes: `catalogSig`, `statsSig`, `loadPref`/`savePref`, `idbGet`/`idbPut` (Task 20), `CATEGORIES`.
- Produces:

```ts
// favourites.ts
export const favouritesSig: Signal<readonly string[]>; // pref 'favourites'
export function toggleFavourite(type: string): void;
export function moveFavourite(type: string, toIndex: number): void;
export const recentsSig: Signal<readonly string[]>; // pref 'recents'; newest first, unique, max 12
export function pushRecent(type: string): void;
// fuzzy.ts
export function fuzzyScore(query: string, text: string): number; // 0 = no match; case-insensitive subsequence, bonus for prefix and word starts
// thumbnails.ts
export type ThumbRenderer = (type: string) => Promise<Blob>;
export function setThumbnailRenderer(r: ThumbRenderer): void;
export function thumbnailUrl(type: string, version: string): Promise<string>; // cache key `${version}:${type}` in IndexedDB 'thumbs'
// PartPicker / PartBrowser
export type PickChoice = { kind: 'part'; type: string } | { kind: 'creation'; id: string };
export interface PartPickerProps { eligible(type: string): boolean; onPick(c: PickChoice): void; onClose(): void; anchor: { x: number; y: number }; creations?: readonly { id: string; name: string }[] }
export interface PartBrowserProps { onArm(c: PickChoice): void; creations?: readonly { id: string; name: string }[] }
```

**Rules:**
- **Browser sections, in this order:** `★ Favourites`, `Recent`, the seven categories in `CATEGORIES` order, then `My creations`. Each heading is an `<h3>` and always renders. Empty sections show `Nothing here yet`.
- **Search:** filters every section by the best `fuzzyScore` over type, tooltip and category.
- **Card contents:**
  - a 64 px thumbnail, with a placeholder until it loads;
  - the name;
  - a badge with the part's count in the current build;
  - a star button with `aria-label="Favourite <type>"`.
- **Card behaviour:**
  - The hover tooltip reads `<tooltip> · <n> sockets · used <corpusCount en-US>× in 185 real builds`.
  - Dragging sets `application/x-grambyedit-part` to the type.
  - Dropping a favourite card onto another favourite card calls `moveFavourite`.
- **Picker:**
  - The search box takes focus on open.
  - Only `eligible` types are listed.
  - Enter picks the first match, arrow keys move, Esc closes.
- **Thumbnails:** the real WebGL renderer is set by the viewport at mount; tests inject a fake.

- [ ] **Step 1: Write the failing tests:**

```ts
// tests/ui/fuzzy.test.ts
import { fuzzyScore } from '../../src/ui/widgets/fuzzy';
test('fuzzy matching', () => {
  expect(['Gate-AND', 'Gate-OR', 'Gate-NOT', 'Part'].filter((t) => fuzzyScore('gate', t) > 0)).toEqual(['Gate-AND', 'Gate-OR', 'Gate-NOT']);
  expect(fuzzyScore('conb', 'ConnectorBall')).toBeGreaterThan(0);
  expect(fuzzyScore('gate', 'Gate-AND')).toBeGreaterThan(fuzzyScore('gate', 'MatchingGyro'));
});
```

```ts
// tests/state/favourites.test.ts (jsdom)
test('favourites persist and reorder; recents are unique and capped at 12', () => {
  toggleFavourite('Part');
  toggleFavourite('Connector');
  moveFavourite('Connector', 0);
  expect(favouritesSig.value).toEqual(['Connector', 'Part']);
  expect(JSON.parse(localStorage.getItem('grambyedit:favourites')!)).toEqual(['Connector', 'Part']);
  for (let i = 0; i < 14; i++) pushRecent(`T${i}`);
  pushRecent('T13');
  expect(recentsSig.value).toHaveLength(12);
  expect(recentsSig.value[0]).toBe('T13');
});
```

```tsx
// tests/ui/panels/browser.test.tsx (jsdom)
test('sections in order and search filters', () => {
  baseCatalogSig.value = MINI;
  render(<PartBrowser onArm={() => {}} />);
  const heads = screen.getAllByRole('heading').map((h) => h.textContent);
  expect(heads.slice(0, 2)).toEqual(['★ Favourites', 'Recent']);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'gate' } });
  expect(screen.queryByText('Connector')).toBeNull();
  expect(screen.getByText('Gate-AND')).toBeTruthy();
});
test('picker lists only eligible types and Enter picks the first', () => {
  baseCatalogSig.value = MINI;
  const onPick = vi.fn();
  render(<PartPicker eligible={(t) => t !== 'Chassis'} onPick={onPick} onClose={() => {}} anchor={{ x: 0, y: 0 }} />);
  expect(screen.queryByText('Chassis')).toBeNull();
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'conn' } });
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
  expect(onPick).toHaveBeenCalledWith({ kind: 'part', type: 'Connector' });
});
```

```ts
// tests/assets/thumbnails.test.ts (fake-indexeddb)
test('renders each type once per version', async () => {
  const r = vi.fn(async () => new Blob(['x']));
  setThumbnailRenderer(r);
  await thumbnailUrl('Part', 'v1');
  await thumbnailUrl('Part', 'v1');
  await thumbnailUrl('Part', 'v2');
  expect(r).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/ui/fuzzy.test.ts tests/state/favourites.test.ts tests/ui/panels/browser.test.tsx tests/assets/thumbnails.test.ts` → FAIL.
- [ ] **Step 3: Implement** the six files.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(ui): part browser, picker, thumbnails and favourites"`

### Task 27: Connect and Point tools

**Owner:** Inline

**Files:**
- Create: `src/core/defaults.ts`, `src/tools/connect.ts`, `src/tools/point.ts`
- Test: `tests/core/defaults.test.ts`

**Interfaces:**
- Consumes: Tasks 8, 22, 23, 26 (`PartPicker`), 14 (picking), 12 (settings).
- Produces:

```ts
export function defaultChildSocket(cat: Catalog, childType: string, parentType: string, parentSocket: SocketId): SocketId | null;
export function eligibleForSocket(cat: Catalog, type: string): boolean; // has at least one child socket
export function eligibleForPoint(cat: Catalog, type: string): boolean; // defaultMount !== null
export function newPartProps(cat: Catalog, type: string, s: { autoColor: boolean; activeColor: RGB }): Record<string, Json>;
```

**`defaultChildSocket` rule:**
1. The child socket with the highest `pairs[pairKey(childType, cs, parentType, parentSocket)]`; ties go to catalog order.
2. If every count is 0: the first child socket whose role complements the parent socket's role (output↔input, conductor↔input/output/conductor, socket↔mount).
3. Else `defaultMount`.
4. Else the first child socket.
5. Else `null`.

**`newPartProps`:** returns `{ RGB: activeColor }` when `autoColor` is on and the type is paintable; `{}` otherwise.

**Tool behaviour:** spec §12.2 and §12.3:
- picker popover with "attach by socket N ▾";
- the picked type stays armed;
- Shift+click places on several sockets;
- socket-to-socket wiring by drag or click-click, with a green/red preview line and the verdict message;
- points: the normal comes from `frameFromNormal` snapped to host axes within 10°, a "+" handle mounts a part, and deleting a point that carries a part asks which `childPolicy` to use.

- [ ] **Step 1: Write the failing tests:**

```ts
import { defaultChildSocket, eligibleForSocket, eligibleForPoint, newPartProps } from '../../src/core/defaults';
import { realCatalog } from '../helpers/real-catalog';
import { MINI } from '../helpers/catalog';
test('corpus pairs pick the attaching socket', async () => {
  const cat = await realCatalog();
  expect(defaultChildSocket(cat, 'Splitter_2', 'Switch', '2')).toBe('3');
  expect(defaultChildSocket(cat, 'Part', 'Part', '6')).toBe('1');
});
test('without corpus data, the role complement decides', () =>
  expect(defaultChildSocket({ ...MINI, pairs: {} }, 'Switch', 'Gate-AND', '2')).toBe('1'));
test('eligibility and auto-color props', () => {
  expect(eligibleForSocket(MINI, 'Chassis')).toBe(false);
  expect(eligibleForPoint(MINI, 'Mag')).toBe(true);
  expect(newPartProps(MINI, 'Part', { autoColor: true, activeColor: [1, 2, 3] })).toEqual({ RGB: [1, 2, 3] });
  expect(newPartProps(MINI, 'Mag', { autoColor: true, activeColor: [1, 2, 3] })).toEqual({});
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/core/defaults.test.ts` → FAIL.
- [ ] **Step 3: Implement** `defaults.ts`, then the two tools.
- [ ] **Step 4: Run it again.** Same command → PASS.
- [ ] **Step 5: Browser check.**
  1. **Connect a part:** Connect tool → click a free Base socket → the picker opens → pick `Part` → it is placed and selected.
  2. **Armed repeat:** the next click on another socket places another `Part`.
  3. **Multi-place:** Shift+click 3 sockets, then pick → 3 placed in one history entry.
  4. **Wiring:** drag from a `Wire` socket 3 to a Gate-AND socket 2 → green line, joint created. Dragging onto a used socket → red line plus the `socket-used` message.
  5. **Points:** Point tool → click a Base face → the point and its gizmo appear. "+" → pick `Gate-AND` → it mounts by socket 4.
  6. **Point delete:** delete that point → the dialog offers Detach / Delete part / Cancel.
- [ ] **Step 6: Commit:** `git commit -m "feat(tools): connect and point tools with smart socket defaults"`

### Task 28: Paint tool and color panel

**Owner:** Haiku (dispatch K)

**Files:**
- Create: `src/core/palette.ts`, `src/tools/paint.ts`, `src/ui/panels/PaintPanel.tsx`
- Test: `tests/core/palette.test.ts`, `tests/tools/paint.test.ts`, `tests/ui/panels/paint.test.tsx`

**Interfaces:**
- Consumes: `paint` (Task 22), `component`/`poseDescendants` (Task 8), `commit`/`settingsSig`/`updateSettings` (Task 12), `toast` (Task 15), the `Tool` interface (Task 14).
- Produces:

```ts
// palette.ts
export function buildPalette(doc: Doc): { rgb: RGB; count: number }[]; // distinct RGB props, count desc
export function pushRecentColor(list: readonly RGB[], c: RGB): RGB[]; // unique, newest first, max 12
export function rgbToHex(c: RGB): string; // "#c62828"
export function hexToRgb(h: string): RGB | null;
// paint.ts
export type PaintMode = 'click' | 'fill' | 'box' | 'brush' | 'branch';
export type FillMatch = 'color' | 'type' | 'any';
export function paintTargets(doc: Doc, mode: 'click' | 'fill' | 'branch', hit: PartId, match: FillMatch): PartId[];
export interface PaintPickers {
  part(ndc: Vector2): PartId | null;
  inRect(rect: { x0: number; y0: number; x1: number; y1: number }, mode: 'visible' | 'xray'): Set<PartId>;
  inDisc(c: { x: number; y: number }, r: number): Set<PartId>;
}
export function createPaintTool(pickers: PaintPickers): Tool;
export const paintModeSig: Signal<PaintMode>; // 'click'
export const fillMatchSig: Signal<FillMatch>; // 'color'
export const brushRadiusSig: Signal<number>; // 24 px
```

**Rules:**
- **Commits:** each click, fill, box, brush stroke or branch is one commit labelled `Paint ${n} parts`. Skipped parts produce the toast `Skipped ${k} parts that can't be painted.`
- **Eyedropper:** Alt+click sets `settings.activeColor`.
- **Panel contents:**
  - a color input with hex and R/G/B integer fields;
  - 12 fixed swatches;
  - recent colors (pref `recentColors`);
  - the build palette: click picks the color, Shift+click selects every part with it;
  - mode buttons, fill-match select and brush radius;
  - **Paint selection**;
  - an auto-color toggle bound to `settings.autoColor`.

- [ ] **Step 1: Write the failing tests:**

```ts
// tests/core/palette.test.ts + tests/tools/paint.test.ts
test('fill floods joint-connected parts of the same color only', () => {
  const d = docOf(part(1, 'Part', [], { RGB: [1, 1, 1] }), part(2, 'Part', [sock('1', 1, '6')], { RGB: [1, 1, 1] }),
    part(3, 'Part', [sock('1', 2, '6')], { RGB: [9, 9, 9] }), part(4, 'Part', [sock('1', 3, '6')], { RGB: [1, 1, 1] }));
  expect(paintTargets(d, 'fill', 1, 'color').sort()).toEqual([1, 2]);
  expect(paintTargets(d, 'fill', 1, 'type').sort()).toEqual([1, 2, 3, 4]);
  expect(paintTargets(d, 'branch', 2, 'color').sort()).toEqual([2, 3, 4]);
});
test('palette and hex helpers', () => {
  const d = docOf(part(1, 'Part', [], { RGB: [198, 40, 40] }), part(2, 'Part', [], { RGB: [198, 40, 40] }), part(3, 'Part', [], { RGB: [0, 0, 0] }));
  expect(buildPalette(d)).toEqual([{ rgb: [198, 40, 40], count: 2 }, { rgb: [0, 0, 0], count: 1 }]);
  expect(rgbToHex([198, 40, 40])).toBe('#c62828');
  expect(hexToRgb('#C62828')).toEqual([198, 40, 40]);
  expect(hexToRgb('nope')).toBeNull();
});
```

```tsx
// tests/ui/panels/paint.test.tsx (jsdom)
test('Paint selection paints paintables and reports the rest', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part'), part(2, 'Gate-AND')));
  select([1, 2], 'replace');
  updateSettings({ activeColor: [10, 20, 30] });
  render(<PaintPanel />);
  fireEvent.click(screen.getByText('Paint selection'));
  expect(docSig.value.parts.get(1)!.props.RGB).toEqual([10, 20, 30]);
  expect(toastsSig.value.at(-1)!.message).toBe("Skipped 1 parts that can't be painted.");
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/palette.test.ts tests/tools/paint.test.ts tests/ui/panels/paint.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(tools): paint modes and color panel"`

### Task 29: Properties panel with multi-edit

**Owner:** Haiku (dispatch L)

**Files:**
- Create: `src/core/propview.ts`, `src/ui/panels/Properties.tsx`, `src/ui/widgets/PropField.tsx`, `src/ui/widgets/NumberScrub.tsx`, `src/ui/widgets/KeyCapture.tsx`, `src/ui/widgets/ColorField.tsx`, `src/ui/widgets/JsonField.tsx`
- Test: `tests/core/propview.test.ts`, `tests/ui/panels/properties.test.tsx`

**Interfaces:**
- Consumes: `setProp`/`UNSET`/`propApplies`, `removeConn`, `makePoseJoint` (Task 22); `commit`, `selectionSig` (Task 12); `posesSig` flags; `codeSize` cache via `entryOf`.
- Produces:

```ts
export interface PropRow { readonly key: string; readonly meta: PropMeta; readonly value: Json | undefined; readonly mixed: boolean; readonly applies: number; readonly total: number }
export function unionProps(doc: Doc, cat: Catalog, ids: readonly PartId[]): PropRow[]; // RGB, OrientationX/Y/Z first, then the rest by label
export function selectionHeader(doc: Doc, ids: readonly PartId[]): string; // "3 parts — 2 Mag, 1 ShortStick"
export function otherProps(doc: Doc, cat: Catalog, id: PartId): Record<string, Json>; // keys without PropMeta
export function robloxKeyName(code: string): string | null; // KeyboardEvent.code → Roblox KeyCode name
```

**Rules:**
- **Row values:**
  - `applies` counts the selected parts where `propApplies` is true.
  - `value` is shared only when every applicable part has the same set value; unset counts as different from any set value.
  - `mixed` is true otherwise.
  - Rows where `applies < total` show `applies to <applies> of <total>`.
  - Inputs are labelled with `PropMeta.label` (`getByLabelText` works).
- **Header chips:** the header shows `selectionHeader` with one chip per type. Clicking a chip narrows the selection to that type.
- **Editing:** edits commit `Set <label>` through `setProp` on the whole selection, which filters to applicable parts. **Reset** commits `UNSET`.
- **Widgets, per `PropMeta`:**
  - bool: tri-state (`indeterminate` when mixed);
  - NumberScrub: one step per 4 px of drag, ×10 with Shift;
  - KeyCapture: the next keydown, mapped with `robloxKeyName` — `ShiftLeft→LeftShift`, `ShiftRight→RightShift`, `ControlLeft→LeftControl`, `KeyW→W`, `Digit1→One` … `Digit0→Zero`, `Space→Space`, `ArrowUp→Up`, `Enter→Return`;
  - ColorField: swatch + hex + R/G/B;
  - orientation: a number field with ±90 buttons.
- **Single selection adds:**
  - **Connections:** a pose badge on index 0, `self <socket name|id> → <TargetType> #<index> <socket>`, and **Disconnect** / **Make pose joint** buttons;
  - **Points**, for hosts;
  - **Info:** type, category, `#index`, `≈ approximate position` when flagged, and `<n> chars`.

- [ ] **Step 1: Write the failing tests:**

```ts
// tests/core/propview.test.ts
test('two Mags and a ShortStick', () => {
  const d = docOf(part(1, 'Mag', [], { Bullets: 10 }), part(2, 'Mag', [], { Bullets: 20 }), part(3, 'ShortStick'));
  const rows = unionProps(d, MINI, [1, 2, 3]);
  expect(rows.find((r) => r.key === 'Bullets')).toMatchObject({ applies: 2, total: 3, mixed: true });
  expect(rows.find((r) => r.key === 'RGB')).toMatchObject({ applies: 1, total: 3 });
  expect(selectionHeader(d, [1, 2, 3])).toBe('3 parts — 2 Mag, 1 ShortStick');
  expect(robloxKeyName('ShiftLeft')).toBe('LeftShift');
  expect(robloxKeyName('Digit1')).toBe('One');
});
```

```tsx
// tests/ui/panels/properties.test.tsx (jsdom)
test('editing Bullets on a mixed selection writes only to the mags', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Mag', [], { Bullets: 10 }), part(2, 'Mag', [], { Bullets: 20 }), part(3, 'ShortStick')));
  select([1, 2, 3], 'replace');
  render(<Properties />);
  expect(screen.getByText('applies to 2 of 3')).toBeTruthy();
  const input = screen.getByLabelText('Bullets') as HTMLInputElement;
  fireEvent.input(input, { target: { value: '30' } });
  fireEvent.blur(input);
  expect(docSig.value.parts.get(1)!.props.Bullets).toBe(30);
  expect(docSig.value.parts.get(2)!.props.Bullets).toBe(30);
  expect(docSig.value.parts.get(3)!.props).toEqual({});
});
test('a single selection lists its connections with the pose badge', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Gate-AND'), part(2, 'Wire', [sock('1', 1, '1'), sock('3', 1, '2')])));
  select([2], 'replace');
  render(<Properties />);
  expect(screen.getAllByText(/Gate-AND #1/)).toHaveLength(2);
  expect(screen.getByText('pose')).toBeTruthy();
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/propview.test.ts tests/ui/panels/properties.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the seven files.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(ui): multi-edit properties panel"`

### Task 30: Commands, keymaps and editing actions

**Owner:** Inline

**Files:**
- Create: `src/state/commands.ts`, `src/state/keymap.ts`, `src/state/clipboard.ts`
- Modify: `src/tools/manager.ts` (key routing), `src/ui/App.tsx`
- Test: `tests/state/keymap.test.ts`, `tests/state/commands.test.ts`

**Interfaces:**
- Consumes: Tasks 12, 14, 22–25, 27.
- Produces:

```ts
export interface Command { readonly id: string; readonly label: string; run(): void; enabled?(): boolean }
export function registerCommand(c: Command): void;
export function runCommand(id: string): boolean;
export function allCommands(): readonly Command[];
export interface KeyBinding { readonly keys: string; readonly command: string } // 'G', 'Shift+D', 'Ctrl+Shift+P', 'Numpad7', 'Delete', 'Escape', 'Alt+Z'
export const KEYMAPS: Readonly<Record<'blender' | 'studio', readonly KeyBinding[]>>; // spec Appendix A
export function keyString(e: { key: string; code: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }): string;
export function resolveKey(e: Parameters<typeof keyString>[0], scheme: 'blender' | 'studio'): string | null;
export function isTypingTarget(t: EventTarget | null): boolean;
export function copySelection(): Promise<void>; // internal sub-doc + system clipboard share code
export function pasteFromClipboard(): Promise<void>; // arms place after Task 33; before that, inserts at the origin
```

**Command ids (exact):**

| group | ids |
|---|---|
| tool | `tool.select`, `tool.move`, `tool.rotate`, `tool.connect`, `tool.point`, `tool.paint`, `tool.sockets` |
| mode | `mode.toggle` |
| select | `select.all`, `select.none`, `select.invert`, `select.box`, `select.linked`, `select.connected`, `select.similarType`, `select.similarColor` |
| edit | `edit.delete`, `edit.duplicate`, `edit.copy`, `edit.paste`, `edit.undo`, `edit.redo`, `edit.detach`, `edit.makeFree` |
| view | `view.hide`, `view.unhide`, `view.isolate`, `view.frameSelected`, `view.frameAll`, `view.front`, `view.back`, `view.right`, `view.left`, `view.top`, `view.bottom`, `view.ortho`, `view.xray` |
| transform | `transform.grab`, `transform.rotate`, `transform.rotY90`, `transform.rotX90` |
| file | `file.save`, `file.saveSelection`, `file.library`, `file.import`, `file.export` |
| app | `app.palette`, `app.shortcuts`, `app.cancel` |

`Escape` maps to `app.cancel` in both schemes. It cancels the active tool operation first; with nothing to cancel, it runs `select.none` (Studio scheme).

**`keyString`, exactly:**
- Modifier prefixes in this order: `Ctrl+`, `Alt+`, `Shift+`. `metaKey` counts as Ctrl.
- The main key:
  - numpad keys use `e.code` (`Numpad7`; `NumpadDecimal` → `Numpad.`);
  - letters use the upper-case letter from `KeyX` codes (`KeyD` → `D`);
  - digits use the digit from `DigitN` codes (`Digit2` → `2`);
  - everything else uses `e.key` (`Tab`, `Escape`, `Delete`, `Home`, `F3`, `?`).
- `Shift+` is left out when the main key is a punctuation symbol (`?`).

- [ ] **Step 1: Write the failing tests:**

```ts
// tests/state/keymap.test.ts
const ev = (key: string, code: string, m: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) =>
  ({ key, code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...m });
test('Appendix A bindings resolve per scheme', () => {
  expect(resolveKey(ev('D', 'KeyD', { shiftKey: true }), 'blender')).toBe('edit.duplicate');
  expect(resolveKey(ev('7', 'Numpad7'), 'blender')).toBe('view.top');
  expect(resolveKey(ev('g', 'KeyG'), 'blender')).toBe('transform.grab');
  expect(resolveKey(ev('x', 'KeyX'), 'blender')).toBe('edit.delete');
  expect(resolveKey(ev('Tab', 'Tab'), 'blender')).toBe('mode.toggle');
  expect(resolveKey(ev('d', 'KeyD', { ctrlKey: true }), 'studio')).toBe('edit.duplicate');
  expect(resolveKey(ev('2', 'Digit2', { ctrlKey: true }), 'studio')).toBe('tool.move');
  expect(resolveKey(ev('y', 'KeyY', { ctrlKey: true }), 'studio')).toBe('edit.redo');
  expect(resolveKey(ev('w', 'KeyW'), 'studio')).toBeNull();
});
test('typing targets are ignored', () => {
  const input = document.createElement('input');
  expect(isTypingTarget(input)).toBe(true);
  expect(isTypingTarget(document.body)).toBe(false);
});
```

```ts
// tests/state/commands.test.ts
test('select.similarType and view.isolate', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part'), part(3, 'Connector')));
  select([1], 'replace');
  runCommand('select.similarType');
  expect([...selectionSig.value.parts].sort()).toEqual([1, 2]);
  runCommand('view.isolate');
  expect([...hiddenSig.value]).toEqual([3]);
});
test('edit.delete commits one undoable step', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part')));
  select([1], 'replace');
  runCommand('edit.delete');
  expect(docSig.value.order).toEqual([]);
  runCommand('edit.undo');
  expect(docSig.value.order).toEqual([1]);
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/state/keymap.test.ts tests/state/commands.test.ts` → FAIL.
- [ ] **Step 3: Implement** the files and register every command. The manager routes keydown → `resolveKey` → `runCommand` unless `isTypingTarget`.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Browser check:** run every Appendix A binding once in each scheme. Copy + paste across two tabs works through the system clipboard.
- [ ] **Step 6: Commit:** `git commit -m "feat(state): command registry, keymaps and editing actions"`

### Task 31: Command palette, shortcuts, context menu, history list, quick fixes

**Owner:** Haiku (dispatch M)

**Files:**
- Create: `src/ui/dialogs/CommandPalette.tsx`, `src/ui/dialogs/ShortcutsOverlay.tsx`, `src/ui/widgets/ContextMenu.tsx`, `src/ui/panels/HistoryPanel.tsx`
- Modify: `src/ui/panels/IssuesPanel.tsx` (quick-fix buttons)
- Test: `tests/ui/dialogs/palette.test.tsx`, `tests/ui/widgets/context-menu.test.tsx`, `tests/ui/panels/history.test.tsx`, `tests/ui/panels/issues-fix.test.tsx`

**Interfaces:**
- Consumes: `allCommands`, `runCommand`, `KEYMAPS` (Task 30); `fuzzyScore` (Task 26); `historySig`, `undo`, `redo` (Task 12); `deletePoint`, `removeConn` (Task 22).
- Produces:
  - `<CommandPalette open onClose/>`;
  - `<ShortcutsOverlay open onClose/>`;
  - `ContextMenu({ items: { label: string; command: string; disabled?: boolean }[]; x: number; y: number; onClose })`;
  - `<HistoryPanel/>`.

**Rules:**
- **Palette:** fuzzy-filters command labels, shows the active scheme's key next to each, runs on Enter, moves with ↑/↓.
- **Overlay:** groups `KEYMAPS[scheme]` by command prefix, in this order: tool, mode, select, edit, view, transform, file, app.
- **Context menu:** ↑/↓, Enter, Esc. The part menu is `edit.delete`, `edit.duplicate`, `edit.copy`, `edit.paste`, `view.hide`, `select.linked`, `select.similarType`, `edit.detach`, `edit.makeFree`, `file.saveSelection`.
- **History panel:** lists past labels, then greyed future labels. Clicking an entry undoes or redoes to that point.
- **Quick fixes:** `I-POINT-UNUSED` → **Remove point**; `E-MATE` → **Remove this joint** (removes the later conn). Each fix is one commit.

- [ ] **Step 1: Write the failing tests:**

```tsx
test('palette filters and runs', () => {
  const run = vi.fn();
  registerCommand({ id: 'test.hello', label: 'Say hello', run });
  render(<CommandPalette open onClose={() => {}} />);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'hello' } });
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
  expect(run).toHaveBeenCalled();
});
test('shortcuts overlay shows Shift+D for Duplicate in the Blender scheme', () => {
  render(<ShortcutsOverlay open onClose={() => {}} />);
  expect(screen.getByText('Shift+D')).toBeTruthy();
});
test('history click jumps back two steps', () => {
  loadDoc(chainDoc(1));
  commit('a', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 1 } }));
  commit('b', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 2 } }));
  commit('c', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 3 } }));
  render(<HistoryPanel />);
  fireEvent.click(screen.getByText('a'));
  expect(docSig.value.parts.get(1)!.props).toEqual({ OrientationY: 1 });
});
test('quick fix removes an unused point', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Base', [], {}, [pt('{u}')])));
  render(<IssuesPanel />);
  fireEvent.click(screen.getByText('Remove point'));
  expect(docSig.value.parts.get(1)!.points!.size).toBe(0);
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/ui/dialogs/palette.test.tsx tests/ui/widgets tests/ui/panels/history.test.tsx tests/ui/panels/issues-fix.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(ui): command palette, shortcuts, context menu, history and quick fixes"`

---

## Milestone M3 — Library and generators

### Task 32: Library storage

**Owner:** Haiku (dispatch N)

**Files:**
- Create: `src/storage/library.ts`, `src/storage/bundle.ts`, `src/storage/autosave.ts`
- Test: `tests/storage/library.test.ts`, `tests/storage/bundle.test.ts`, `tests/storage/autosave.test.ts`

**Interfaces:**
- Consumes: `idbGet`/`idbPut`/`idbDelete`/`idbAll`, `StorageError` (Task 20).
- Produces:

```ts
export interface EditorMeta { readonly rootLayout: Readonly<Record<number, CFrame12>>; readonly camera?: { readonly position: Vec3; readonly target: Vec3 } }
export interface CreationRecord {
  readonly id: string; readonly name: string; readonly code: string; readonly hash: string; readonly partCount: number;
  readonly codeLength: number; readonly thumb: Blob | null; readonly tags: readonly string[]; readonly notes: string;
  readonly createdAt: number; readonly updatedAt: number; readonly editorMeta: EditorMeta; readonly schemaVersion: 1;
}
export function sha256Hex(text: string): Promise<string>;
export function saveCreation(input: { id?: string; name: string; code: string; partCount: number; thumb: Blob | null; editorMeta: EditorMeta; tags?: string[]; notes?: string }): Promise<CreationRecord>;
export function listCreations(): Promise<CreationRecord[]>; // updatedAt desc
export function getCreation(id: string): Promise<CreationRecord | undefined>;
export function renameCreation(id: string, name: string): Promise<void>;
export function duplicateCreation(id: string): Promise<CreationRecord>; // name `${name} (copy)`
export function deleteCreation(id: string): Promise<void>;
export function exportBundle(records: readonly CreationRecord[]): string; // { format: 'grambyedit-library', version: 1, exportedAt, creations } without thumb
export function importBundle(json: string): Promise<{ added: number; skipped: number; renamed: number }>;
export interface AutosaveRecord { readonly code: string; readonly editorMeta: EditorMeta; readonly savedAt: number; readonly creationId: string | null }
export function writeAutosave(a: AutosaveRecord): Promise<void>;
export function readAutosave(): Promise<AutosaveRecord | undefined>;
export function clearAutosave(): Promise<void>;
```

**Rules:**
- **Records:** `id` is `crypto.randomUUID()`; `codeLength` is `code.length`.
- **Storage full:** `QuotaExceededError` becomes `StorageError('quota', 'Browser storage is full. Export your library and delete old creations.')`.
- **`importBundle`:**
  - skips records whose `hash` already exists;
  - renames name collisions to `Name (2)`, `Name (3)`, …;
  - throws `Error('Not a GrambyEdit library file.')` on any other format.

- [ ] **Step 1: Write the failing tests** (`fake-indexeddb/auto`):

```ts
test('save, list, rename, duplicate, delete', async () => {
  const a = await saveCreation({ name: 'Car', code: 'W1tdXQ==', partCount: 0, thumb: null, editorMeta: { rootLayout: {} } });
  expect(a.hash).toBe(await sha256Hex('W1tdXQ=='));
  await renameCreation(a.id, 'Kart');
  const b = await duplicateCreation(a.id);
  expect(b.name).toBe('Kart (copy)');
  expect((await listCreations()).map((r) => r.name)).toEqual(['Kart (copy)', 'Kart']);
  await deleteCreation(a.id);
  expect(await getCreation(a.id)).toBeUndefined();
});
test('bundle round-trip skips duplicates and renames collisions', async () => {
  const a = await saveCreation({ name: 'Car', code: 'AAAA', partCount: 0, thumb: null, editorMeta: { rootLayout: {} } });
  const json = exportBundle([a, { ...a, id: 'z', code: 'BBBB', hash: await sha256Hex('BBBB') }]);
  expect(JSON.parse(json).creations[0].thumb).toBeUndefined();
  expect(await importBundle(json)).toEqual({ added: 1, skipped: 1, renamed: 1 });
  expect((await listCreations()).map((r) => r.name).sort()).toEqual(['Car', 'Car (2)']);
  await expect(importBundle('{"format":"x"}')).rejects.toThrow('Not a GrambyEdit library file.');
});
test('autosave read/write/clear', async () => {
  await writeAutosave({ code: 'AAAA', editorMeta: { rootLayout: {} }, savedAt: 1, creationId: null });
  expect((await readAutosave())!.code).toBe('AAAA');
  await clearAutosave();
  expect(await readAutosave()).toBeUndefined();
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/storage` → FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run them again.** `npx vitest run tests/storage` → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(storage): creation library, bundles and autosave"`

### Task 33: Place tool, prefabs and library flows

**Owner:** Inline

**Files:**
- Create: `src/state/place.ts`, `src/state/library.ts`, `src/tools/place.ts`, `src/viewport/ghost.ts`
- Modify: `src/state/clipboard.ts` (paste arms place)
- Test: `tests/state/library.test.ts`, `tests/state/place.test.ts`

**Interfaces:**
- Consumes: Tasks 24, 27, 32, 4.
- Produces:

```ts
// state/place.ts
export type PlaceSource = { kind: 'part'; type: string } | { kind: 'creation'; id: string } | { kind: 'paste'; sub: Doc } | { kind: 'generated'; sub: Doc };
export const placeSig: Signal<PlaceSource | null>;
export function arm(src: PlaceSource): void;
export function disarm(): void;
export function resolveSub(src: PlaceSource): Promise<Doc>; // part → 1-part sub-doc with newPartProps; creation → parseShareText(record.code)
// state/library.ts
export const creationsSig: Signal<readonly CreationRecord[]>;
export function refreshCreations(): Promise<void>;
export function editorMetaOf(doc: Doc): EditorMeta; // rootLayout keyed by 0-based entry index
export function saveCurrent(name: string, id?: string): Promise<CreationRecord>;
export function saveSelectionAsCreation(name: string): Promise<CreationRecord>;
export function openCreation(id: string): Promise<void>;
export function startAutosave(): () => void; // writes 2 s after the last committed change
```

**Persistence:** the first `saveCurrent` of a session calls `navigator.storage.persist()` and stores the answer for the Library's `Persistent: yes|no`.

**Place tool behaviour** (spec §12.6):
- A ghost of the resolved sub-doc follows the cursor and snaps to sockets, points and surfaces.
- A click inserts the sub-doc via `insertSubDoc` with a target.
- In empty space, a click inserts at `{ root }` on the ground plane and shows the status hint `Root positions are not stored in share codes.`
- Esc disarms.

- [ ] **Step 1: Write the failing tests** (`fake-indexeddb/auto`, fake timers for autosave):

```ts
test('save and reopen keep the code and the root layout', async () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part')));
  commit('lay', (d) => d.setLayout(2, [7, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
  const rec = await saveCurrent('Two cubes');
  expect(rec.code).toBe(toShareCode(docSig.value));
  expect(rec.editorMeta.rootLayout[1]).toEqual([7, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  loadDoc(EMPTY_DOC);
  await openCreation(rec.id);
  expect(docSig.value.layout.get(2)).toEqual([7, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
});
test('autosave writes once, 2 s after the last commit', async () => {
  vi.useFakeTimers();
  const stop = startAutosave();
  loadDoc(chainDoc(1));
  commit('a', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 1 } }));
  commit('b', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 2 } }));
  await vi.advanceTimersByTimeAsync(1999);
  expect(await readAutosave()).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect((await readAutosave())!.code).toBe(toShareCode(docSig.value));
  stop();
  vi.useRealTimers();
});
test('arming a part resolves a one-part sub-doc with auto color', async () => {
  baseCatalogSig.value = MINI;
  updateSettings({ autoColor: true, activeColor: [5, 6, 7] });
  const sub = await resolveSub({ kind: 'part', type: 'Part' });
  expect(sub.parts.get(1)!.props).toEqual({ RGB: [5, 6, 7] });
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/state/library.test.ts tests/state/place.test.ts` → FAIL.
- [ ] **Step 3: Implement** the four files. Then register `file.save`, `file.saveSelection` and `file.library`, and switch `pasteFromClipboard` to `arm({ kind: 'paste', sub })`.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Browser check.**
  1. Arm `Part` → the ghost snaps to sockets and surfaces; a click places it.
  2. Save the build, then arm it from **My creations** → a ghost of the whole prefab appears; a click inserts it.
  3. Click in empty space → a new root, and the hint shows.
  4. Paste a code copied from another tab → the place ghost appears.
- [ ] **Step 6: Commit:** `git commit -m "feat(tools): place tool, prefabs, save/open and autosave"`

### Task 34: Library UI and My creations

**Owner:** Haiku (dispatch O)

**Files:**
- Create: `src/ui/dialogs/LibraryDialog.tsx`, `src/ui/dialogs/SaveDialog.tsx`, `src/ui/dialogs/RestorePrompt.tsx`
- Modify: `src/ui/panels/PartBrowser.tsx` (My creations section), `src/ui/widgets/PartPicker.tsx` (creations section), `src/ui/dialogs/ImportDialog.tsx` (Insert button)
- Test: `tests/ui/dialogs/library.test.tsx`

**Interfaces:**
- Consumes: Task 33 (`creationsSig`, `saveCurrent`, `openCreation`, `arm`), Task 32 storage, `formatPercent`, `settingsSig.limits`.
- Produces: `<LibraryDialog open onClose/>`, `<SaveDialog open onClose selectionOnly?/>`, `<RestorePrompt/>`.

**Rules:**
- **Cards** show name, parts, `${formatPercent(codeLength, limits.codeChars)}% of code limit`, the updated date (`toLocaleDateString()`) and the thumbnail.
- **Search** covers name and tags. **Sort** options: updated, name, parts.
- **Card actions:**
  - **Open** — asks before replacing a doc with history;
  - **Insert as part** — `arm({ kind: 'creation', id })`;
  - **Rename** — inline;
  - **Duplicate**;
  - **Export** — `.txt` with the code;
  - **Delete** — an icon button with `aria-label="Delete <name>"`; it shows the toast `Deleted "<name>". Undo` for 5 s, and Undo re-saves the record.
- **Toolbar:** Import bundle, Export all (`GrambyEdit-library-<yyyy-mm-dd>.json`), storage usage from `navigator.storage.estimate()`, and `Persistent: yes|no`.
- **SaveDialog fields:** name (required), tags (comma-separated), notes.
- **RestorePrompt:** when `readAutosave()` returns a record at startup, shows `Restore unsaved work from <time>?` with Restore / Discard.
- **My creations** are listed in both the browser and the picker.
- **ImportDialog:** gains **Insert into current build** → `arm({ kind: 'paste', sub })`.

- [ ] **Step 1: Write the failing tests** (jsdom + `fake-indexeddb/auto`):

```tsx
test('cards show the share of the code limit; delete can be undone', async () => {
  await saveCreation({ name: 'Car', code: 'A'.repeat(640_800), partCount: 3, thumb: null, editorMeta: { rootLayout: {} } });
  await refreshCreations();
  render(<LibraryDialog open onClose={() => {}} />);
  expect(await screen.findByText('8.01% of code limit')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Delete Car'));
  fireEvent.click(await screen.findByText('Undo'));
  await waitFor(async () => expect((await listCreations()).map((r) => r.name)).toEqual(['Car']));
});
test('My creations appear in the picker and arm a prefab', async () => {
  baseCatalogSig.value = MINI;
  const rec = await saveCreation({ name: 'Wheelset', code: 'W1tdXQ==', partCount: 0, thumb: null, editorMeta: { rootLayout: {} } });
  await refreshCreations();
  const onPick = vi.fn();
  render(<PartPicker eligible={() => true} onPick={onPick} onClose={() => {}} anchor={{ x: 0, y: 0 }} creations={creationsSig.value} />);
  fireEvent.click(screen.getByText('Wheelset'));
  expect(onPick).toHaveBeenCalledWith({ kind: 'creation', id: rec.id });
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/ui/dialogs/library.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(ui): library dialog, save, restore and My creations"`

### Task 35: Shapes, part 1 — line, grid, box, ring, cylinder, sphere

**Owner:** Haiku (dispatch P1)

**Files:**
- Create: `src/core/generators/line.ts`, `src/core/generators/grid.ts`, `src/core/generators/box.ts`, `src/core/generators/ring.ts`, `src/core/generators/cylinder.ts`, `src/core/generators/sphere.ts`
- Test: `tests/core/generators/shapes1.test.ts`

**Interfaces:**
- Consumes: `ShapeDef`, `ShapeInput` (Task 2, `generators/types.ts`); `frameFromNormal` (Task 2, `src/core/frames.ts`).
- Produces: `export const line: ShapeDef`, `grid`, `box`, `ring`, `cylinder`, `sphere` (one per file).

**Shape rules, exactly.**

*Common to every shape:*
- Shapes are centred on the origin in X and Z. The lowest element sits at y = 0.
- Orientation:
  - `orient: 'fixed'` → identity rotation;
  - `'outward'` → `frameFromNormal(pos, outwardNormal)`;
  - `'tangent'` → `frameFromNormal(pos, pathTangent)`.
- `n` below always means `floor(size / spacing) + 1` unless stated.

*Per shape:*

| shape | params (default) | fills | positions |
|---|---|---|---|
| line | `length` (10) | `solid` | `x_i = (i − (n−1)/2)·spacing`; tangent +X |
| grid | `width` (10), `depth` (10) | `solid`, `outline` | `nx × nz` points; `outline` keeps the border only; outward +Y |
| box | `width` (6), `height` (6), `depth` (6) | `solid`, `shell`, `frame` | `nx × ny × nz` points, y = 0…(ny−1)·spacing. `shell` keeps any boundary index; `frame` keeps points with ≥ 2 boundary indices. Outward = the first boundary face in X, Y, Z order |
| ring | `radius` (5) | `outline`, `solid` | `outline`: `n = max(3, round(2πr/spacing))` points at `θ_i = 2πi/n`, at `(r cos θ, 0, r sin θ)`. `solid`: rings at `r_j = r − j·spacing` while `r_j > spacing/2`, plus the centre. Outward `(cos θ, 0, sin θ)`; tangent `(−sin θ, 0, cos θ)` |
| cylinder | `radius` (3), `height` (6) | `shell`, `solid` | layers `y_k = k·spacing`, `k = 0…floor(height/spacing)`; each layer is a ring `outline` (`shell`) or `solid` disc |
| sphere | `radius` (4) | `shell`, `solid` | `shell`: `n = max(4, round(4πr²/spacing²))` Fibonacci points with `y = 1 − 2(i + 0.5)/n`, `ρ = √(1 − y²)`, `φ = i·π(3 − √5)`, `p = r·(ρ cos φ, y, ρ sin φ) + (0, r, 0)`. `solid`: grid points within r of the centre. Outward = `(p − c)/r` |

- [ ] **Step 1: Write the failing tests:**

```ts
import { line } from '../../../src/core/generators/line';
import { grid } from '../../../src/core/generators/grid';
import { box } from '../../../src/core/generators/box';
import { ring } from '../../../src/core/generators/ring';
import { cylinder } from '../../../src/core/generators/cylinder';
import { sphere } from '../../../src/core/generators/sphere';
const run = (s: any, params: any, fill: any, orient: any = 'fixed', spacing = 1) => s.generate({ params, fill, orient, spacing });
const yAxis = (cf: readonly number[]) => [cf[4], cf[7], cf[10]];

test('counts', () => {
  expect(run(line, { length: 10 }, 'solid')).toHaveLength(11);
  expect([run(grid, { width: 10, depth: 10 }, 'solid').length, run(grid, { width: 10, depth: 10 }, 'outline').length]).toEqual([121, 40]);
  expect(['solid', 'shell', 'frame'].map((f) => run(box, { width: 2, height: 2, depth: 2 }, f).length)).toEqual([27, 26, 20]);
  expect(run(ring, { radius: 5 }, 'outline')).toHaveLength(31);
  expect(run(cylinder, { radius: 1, height: 2 }, 'shell')).toHaveLength(18);
  expect(run(sphere, { radius: 2 }, 'shell')).toHaveLength(50);
});
test('line spans -5..5 and boxes rest on y = 0', () => {
  const l = run(line, { length: 10 }, 'solid');
  expect([l[0][0], l[10][0]]).toEqual([-5, 5]);
  expect(Math.min(...run(box, { width: 2, height: 2, depth: 2 }, 'solid').map((c: number[]) => c[1]))).toBe(0);
});
test('outward orientation follows the radial normal', () => {
  const r = run(ring, { radius: 5 }, 'outline', 'outward');
  expect(r[0].slice(0, 3)).toEqual([5, 0, 0]);
  yAxis(r[0]).forEach((v, i) => expect(v).toBeCloseTo([1, 0, 0][i], 12));
  for (const cf of run(sphere, { radius: 2 }, 'shell', 'outward')) {
    const p = [cf[0], cf[1] - 2, cf[2]];
    expect(Math.hypot(...p)).toBeCloseTo(2, 9);
    yAxis(cf).forEach((v, i) => expect(v).toBeCloseTo(p[i] / 2, 9));
  }
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/generators/shapes1.test.ts` → FAIL.
- [ ] **Step 3: Implement** the six files.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(generators): line, grid, box, ring, cylinder, sphere"`

### Task 36: Shapes, part 2 — cone, torus, arc, helix, stairs, text

**Owner:** Haiku (dispatch P2)

**Files:**
- Create: `src/core/generators/cone.ts`, `src/core/generators/torus.ts`, `src/core/generators/arc.ts`, `src/core/generators/helix.ts`, `src/core/generators/stairs.ts`, `src/core/generators/text.ts`
- Test: `tests/core/generators/shapes2.test.ts`

**Interfaces:**
- Consumes: as Task 35.
- Produces: `export const cone: ShapeDef`, `torus`, `arc`, `helix`, `stairs`, `text`; also `export const FONT_5X7: Readonly<Record<string, readonly string[]>>` (in `text.ts`).

**Shape rules, exactly:**

| shape | params (default) | fills | positions |
|---|---|---|---|
| cone | `radius` (3), `height` (6), `sides` (0 = round, 3–8 = pyramid) | `shell`, `solid` | layers `y_k = k·spacing` with `r_k = radius·(1 − y_k/height)`. A layer with `r_k < spacing/2` is a single apex point. Round layers: rings of `max(3, round(2πr_k/spacing))`. Pyramids: points every `spacing` along the `sides`-gon perimeter |
| torus | `major` (6), `minor` (1.5) | `shell` | `n1 = max(3, round(2πR/spacing))`, `n2 = max(3, round(2πr/spacing))`; `p = ((R + r cos ψ) cos θ, r + r sin ψ, (R + r cos ψ) sin θ)`; outward `(cos ψ cos θ, sin ψ, cos ψ sin θ)` |
| arc | `radius` (5), `angle` (90, 1–360) | `outline` | `n = max(2, round(angle·π/180·r/spacing) + 1)`, θ from 0 toward +Z |
| helix | `radius` (3), `height` (10), `turns` (3) | `outline` | path length `L = √((2πr·turns)² + height²)`; `n = floor(L/spacing) + 1`; `t_i = i/(n − 1)`; `θ = 2π·turns·t`; `p = (r cos θ, height·t, r sin θ)`; tangent from the derivative |
| stairs | `steps` (8), `rise` (1), `run` (1), `width` (4) | `solid` | for step s: a row of `floor(width/spacing) + 1` elements along Z at `x = s·run`, `y = s·rise` |
| text | `text` ('GRAMBY') | `solid` | `FONT_5X7` glyphs are 7 strings of 5 `'0'/'1'` (A–Z, 0–9, space, `.`, `,`, `!`, `?`, `-`; unknown characters render blank). A lit pixel at glyph column c and row r (top = 0) sits at `x = (charIndex·6 + c)·spacing`, `y = (6 − r)·spacing`, `z = 0`, then the shape is centred in X. Glyph `I` is exactly `["11111","00100","00100","00100","00100","00100","11111"]` |

- [ ] **Step 1: Write the failing tests:**

```ts
const run = (s: any, params: any, fill: any, orient: any = 'fixed', spacing = 1) => s.generate({ params, fill, orient, spacing });
test('counts', () => {
  expect(run(cone, { radius: 2, height: 2, sides: 0 }, 'shell')).toHaveLength(20);
  expect(run(torus, { major: 3, minor: 1 }, 'shell')).toHaveLength(114);
  expect(run(arc, { radius: 5, angle: 90 }, 'outline')).toHaveLength(9);
  expect(run(helix, { radius: 1, height: 0, turns: 1 }, 'outline')).toHaveLength(7);
  expect(run(stairs, { steps: 3, rise: 1, run: 1, width: 2 }, 'solid')).toHaveLength(9);
  expect([run(text, { text: 'I' }, 'solid').length, run(text, { text: ' ' }, 'solid').length, run(text, { text: 'II' }, 'solid').length]).toEqual([15, 0, 30]);
});
test('font covers A–Z and 0–9 with 7 rows of 5', () => {
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
    expect(FONT_5X7[ch], ch).toHaveLength(7);
    FONT_5X7[ch].forEach((row) => expect(row).toMatch(/^[01]{5}$/));
  }
});
test('text is centred and advances six columns per character', () => {
  const xs = run(text, { text: 'II' }, 'solid').map((c: number[]) => c[0]);
  expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 9);
  expect(Math.max(...xs) - Math.min(...xs)).toBe(10);
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/generators/shapes2.test.ts` → FAIL.
- [ ] **Step 3: Implement** the six files.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(generators): cone, torus, arc, helix, stairs, text"`

### Task 37: Generator registry and sub-doc build

**Owner:** Inline

**Files:**
- Create: `src/core/generators/index.ts`, `src/core/generators/build.ts`
- Test: `tests/core/generators/build.test.ts`

**Interfaces:**
- Consumes: Tasks 35–36 shapes; `pointFrameFor`, `socketMatrix`, `subPartMatrix` (Task 10); `roundCf`, `cfToMatrix4`, `newUuid` (Task 3); `mulberry32` (Task 22 helper, copied into `build.ts` as a private function).
- Produces:

```ts
export const SHAPES: Readonly<Record<ShapeId, ShapeDef>>;
export type GenColor = { mode: 'single'; rgb: RGB } | { mode: 'gradient'; from: RGB; to: RGB; axis: 'x' | 'y' | 'z' } | { mode: 'random'; palette: readonly RGB[]; seed: number };
export interface GenRequest { shape: ShapeId; input: ShapeInput; element: string; host: string; color: GenColor; transform: CFrame12; posDecimals: number; rotDecimals: number; maxElements: number }
export function buildGeneratedSubDoc(req: GenRequest, cat: Catalog, conv: Conventions): { ok: true; sub: Doc; elements: number } | { ok: false; error: string };
```

**Rules:**
- **Structure:** part 1 is the host (`req.host`, empty props, a points map). Parts 2…n+1 are `req.element`, each mounted by its `defaultMount` on point i.
- **Point frames:** `cframe = roundCf(pointFrameFor(I, Sub(host, mainPartName), transform·pose_i, S(element, mount), {}, conv), posDecimals, rotDecimals)`. Each point's `partName` is the host's `mainPartName`.
- **Color:** `RGB` is set only on paintable elements.
  - `gradient`: t is the element's normalised position along the axis.
  - `random`: draws from the palette with a `mulberry32(seed)` sequence.
- **Errors, exactly:**
  - `"${element}" cannot be mounted on a point: it has no child socket.`
  - `This shape would create ${n} parts; the limit is ${max}.`

- [ ] **Step 1: Write the failing tests:**

```ts
import { buildGeneratedSubDoc, SHAPES, type GenRequest } from '../../../src/core/generators/index';
import { computePoses } from '../../../src/core/pose';
import { validate } from '../../../src/core/rules';
import { DEFAULT_CONVENTIONS as C } from '../../../src/core/conventions';
import { DEFAULT_LIMITS } from '../../../src/core/types';
import { MINI } from '../../helpers/catalog';
const req = (over: Partial<GenRequest> = {}): GenRequest => ({ shape: 'line', input: { params: { length: 99 }, fill: 'solid', orient: 'fixed', spacing: 1 },
  element: 'Part', host: 'Connector', color: { mode: 'single', rgb: [1, 2, 3] }, transform: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  posDecimals: 4, rotDecimals: 5, maxElements: 20_000, ...over });

test('registry has all twelve shapes', () => expect(Object.keys(SHAPES).sort()).toEqual(['arc', 'box', 'cone', 'cylinder', 'grid', 'helix', 'line', 'ring', 'sphere', 'stairs', 'text', 'torus']));
test('a 100-part line becomes one host with 100 points and 100 mounted parts', () => {
  const r = buildGeneratedSubDoc(req(), MINI, C);
  if (!r.ok) throw new Error(r.error);
  expect(r.elements).toBe(100);
  expect(r.sub.order).toHaveLength(101);
  expect(r.sub.parts.get(1)!.points!.size).toBe(100);
  expect(r.sub.parts.get(2)!.conns[0]).toMatchObject({ self: '1', target: { kind: 'point', part: 1 } });
  expect(r.sub.parts.get(2)!.props).toEqual({ RGB: [1, 2, 3] });
  expect(validate(r.sub, MINI, DEFAULT_LIMITS, 0).filter((i) => i.severity === 'error')).toEqual([]);
  const w = computePoses(r.sub, MINI, C).world;
  expect(w.get(2)!.elements[12]).toBeCloseTo(-49.5, 4);
  expect(w.get(101)!.elements[12]).toBeCloseTo(49.5, 4);
});
test('gradient endpoints and errors', () => {
  const g = buildGeneratedSubDoc(req({ color: { mode: 'gradient', from: [0, 0, 0], to: [255, 255, 255], axis: 'x' } }), MINI, C);
  if (!g.ok) throw new Error(g.error);
  expect([g.sub.parts.get(2)!.props.RGB, g.sub.parts.get(101)!.props.RGB]).toEqual([[0, 0, 0], [255, 255, 255]]);
  expect(buildGeneratedSubDoc(req({ element: 'Chassis' }), MINI, C)).toEqual({ ok: false, error: '"Chassis" cannot be mounted on a point: it has no child socket.' });
  expect(buildGeneratedSubDoc(req({ maxElements: 50 }), MINI, C)).toEqual({ ok: false, error: 'This shape would create 100 parts; the limit is 50.' });
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/generators/build.test.ts` → FAIL.
- [ ] **Step 3: Implement** `index.ts` and `build.ts`.
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(generators): shape registry and host-and-points sub-doc build"`

### Task 38: Generators panel

**Owner:** Haiku (dispatch Q)

**Files:**
- Create: `src/state/generators.ts`, `src/ui/panels/GeneratorsPanel.tsx`
- Test: `tests/state/generators.test.ts`, `tests/ui/panels/generators.test.tsx`

**Interfaces:**
- Consumes: `SHAPES`, `buildGeneratedSubDoc`, `GenRequest` (Task 37); `insertSubDoc` (Task 24); `codeSize`, `formatPercent` (Task 9); `arm` (Task 33); `PartPicker` (Task 26); `settingsSig`, `loadPref`/`savePref`.
- Produces:

```ts
export const genRequestSig: Signal<GenRequest>; // ring, Part, Connector, spacing 1, 'outline', 'fixed', single activeColor, identity, decimals from settings, maxElements 20000
export interface CostPreview { addParts: number; addChars: number; codeBefore: string; codeAfter: string; partsBefore: number; partsAfter: number; crossings: string[]; text: string }
export function costPreview(doc: Doc, cat: Catalog, conv: Conventions, req: GenRequest, limits: Limits): { ok: true; cost: CostPreview } | { ok: false; error: string };
export function savePreset(name: string, req: GenRequest): void; // pref 'genPresets'
export function loadPresets(): Record<string, GenRequest>;
```

**Rules:**
- **Cost:** `addChars` = `codeSize` after inserting the sub-doc at `{ root: identity }` in a scratch `transact`, minus `codeSize` before.
- **Text format:** `+${addParts en-US} parts · +${addChars en-US} chars · code ${codeBefore}% → ${codeAfter}% · parts ${partsBefore en-US} → ${partsAfter en-US}`.
- **`crossings`** lists every threshold crossed: `code 75%`, `code 100%`, `part soft cap`, `part warning`.
- **Panel:**
  - the 12 shapes;
  - a param form built from `ShapeDef.params`;
  - fill and orient selects (fills limited to the shape's `fills`);
  - element and host pickers;
  - spacing;
  - color-mode controls;
  - the cost line, with the crossings as warnings;
  - **Generate** → `arm({ kind: 'generated', sub })`;
  - save and load presets.

- [ ] **Step 1: Write the failing tests:**

```ts
// tests/state/generators.test.ts
test('cost preview text and threshold crossings', () => {
  const r = costPreview(EMPTY_DOC, MINI, DEFAULT_CONVENTIONS, { ...genRequestSig.value, shape: 'line', input: { params: { length: 9 }, fill: 'solid', orient: 'fixed', spacing: 1 } }, DEFAULT_LIMITS);
  if (!r.ok) throw new Error(r.error);
  expect(r.cost.addParts).toBe(11);
  expect(r.cost.text).toMatch(/^\+11 parts · \+[\d,]+ chars · code 0\.00% → \d+\.\d\d% · parts 0 → 11$/);
  const near = costPreview(chainDoc(7_995), MINI, DEFAULT_CONVENTIONS, { ...genRequestSig.value, shape: 'line', input: { params: { length: 9 }, fill: 'solid', orient: 'fixed', spacing: 1 } }, DEFAULT_LIMITS);
  expect(near.ok && near.cost.crossings).toEqual(['part soft cap']);
});
```

```tsx
// tests/ui/panels/generators.test.tsx (jsdom)
test('form follows the chosen shape and Generate arms place mode', () => {
  baseCatalogSig.value = MINI;
  render(<GeneratorsPanel />);
  fireEvent.click(screen.getByText('Torus'));
  expect(screen.getByLabelText('Major')).toBeTruthy();
  fireEvent.click(screen.getByText('Generate'));
  expect(placeSig.value?.kind).toBe('generated');
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/state/generators.test.ts tests/ui/panels/generators.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Labels come from `ShapeParam.label` (Title Case: `major` → `Major`).
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(ui): generators panel with live cost preview"`

### Task 39: Settings, About, first run and the code optimiser

**Owner:** Haiku (dispatch R)

**Files:**
- Create: `src/core/optimize.ts`, `src/core/examples.ts`, `src/ui/dialogs/SettingsDialog.tsx`, `src/ui/dialogs/AboutDialog.tsx`, `src/ui/dialogs/FirstRun.tsx`
- Test: `tests/core/optimize.test.ts`, `tests/ui/dialogs/settings.test.tsx`

**Interfaces:**
- Consumes: `Draft`, `transact` (Task 11); `roundCf` (Task 3); `settingsSig`, `updateSettings`, `loadPref`/`savePref` (Task 12); `importText`, `loadDoc` (Tasks 12, 17); `CREDITS` (Task 1).
- Produces:

```ts
export interface OptimizeOptions { posDecimals: number; rotDecimals: number; dropUnusedPoints: boolean; dropEmptyAttachments: boolean }
export function optimizeDoc(d: Draft, opts: OptimizeOptions): { pointsRemoved: number; numbersRounded: number; emptiedRemoved: number };
export const EXAMPLES: readonly { readonly name: string; readonly code: string }[]; // [Appendix B as a code, Appendix A]
```

**Rules:**
- **Optimiser:**
  - Rounds point `cframe`s only.
  - "Unused" means no conn targets the point.
  - `dropEmptyAttachments` turns an empty points map into `null`.
  - Never touches conns or any other prop.
  - Registered as command `edit.optimize`, labelled `Optimize code size`.
- **Settings dialog:** the spec §13.10 sections, bound to `updateSettings`. Each numeric field commits on blur. The limit fields are labelled `Code limit (characters)`, `Part soft cap` and `Part warning`.
- **About dialog:** `CREDITS`, the assets `version.txt`, and links to `https://github.com/JuanCrakYT/RtG-Format` and `https://github.com/jirrob/GrambysWorkshop`.
- **First run:** shows once (pref `firstRunDone`) with three tips, **Load example** (imports `EXAMPLES[0]`) and **Start empty**.

- [ ] **Step 1: Write the failing tests:**

```ts
// tests/core/optimize.test.ts
test('rounds point frames, drops unused points and empty attachment lists, keeps joints', () => {
  const d0 = docOf(part(1, 'Base', [], {}, [pt('{a}', [1.234567, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), pt('{b}')]),
    part(2, 'Part', [mount('1', 1, '{a}')]), part(3, 'Base', [], {}, []));
  let res: unknown;
  const { doc } = transact(d0, 'opt', (d) => { res = optimizeDoc(d, { posDecimals: 4, rotDecimals: 5, dropUnusedPoints: true, dropEmptyAttachments: true }); });
  expect(res).toEqual({ pointsRemoved: 1, numbersRounded: 1, emptiedRemoved: 1 });
  expect(doc.parts.get(1)!.points!.get('{a}')!.cframe[0]).toBe(1.2346);
  expect(doc.parts.get(3)!.points).toBeNull();
  expect(doc.parts.get(2)!.conns).toEqual(d0.parts.get(2)!.conns);
});
```

```tsx
// tests/ui/dialogs/settings.test.tsx (jsdom)
test('limit edits persist; About credits Mumble Games; first run shows once', () => {
  render(<SettingsDialog open onClose={() => {}} />);
  fireEvent.input(screen.getByLabelText('Code limit (characters)'), { target: { value: '9000000' } });
  fireEvent.blur(screen.getByLabelText('Code limit (characters)'));
  expect(settingsSig.value.limits.codeChars).toBe(9_000_000);
  render(<AboutDialog open onClose={() => {}} />);
  expect(screen.getByText(CREDITS)).toBeTruthy();
  const first = render(<FirstRun />);
  fireEvent.click(screen.getByText('Start empty'));
  first.unmount();
  const again = render(<FirstRun />);
  expect(again.container.textContent).toBe('');
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/core/optimize.test.ts tests/ui/dialogs/settings.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Same command → PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat: settings, about, first run and code optimiser"`

---

## Milestone M4 — Calibration (starts once you have captured sockets in the Workbench)

### Task 40: Merge captured sockets and calibrate conventions

**Owner:** Inline, with you

**Files:**
- Create: `data/socket_geometry.json` (your Workbench export), `data/conventions.json`, `scripts/calibration-report.ts`, `tests/calibration/adjacency.test.ts`, `tests/calibration/baseline.json`

**Interfaces:**
- Consumes: Tasks 7, 10, 19.
- Produces:
  - `npm run calibrate`, which prints the per-pair report;
  - the regression test, which compares the report against `baseline.json` once you have approved it.

- [ ] **Step 1: Bring in your captures.** Copy your Workbench export to `data/socket_geometry.json` and run `npm run assets` → the report shows your captured count.
- [ ] **Step 2: Write the report script.** For each of the 60 most frequent `pairs`, mate the two parts with each candidate mating (`rx180`, `rz180`) and measure the bbox gap and the overlap along the mating axis. A pair passes when gap ≤ 0.05 studs and overlap ≤ 25% of the smaller part. Run `npx tsx scripts/calibration-report.ts` → a table of pairs × candidates, plus failing sockets.
- [ ] **Step 3: Review with you.** Run the probe pack P1–P6 (Workbench → Calibration) in-game and tell me what you see. Write `data/conventions.json`, for example `{ "mating": "rx180", "orientationOrder": "XYZ", "orientationOnPoints": true }`.
- [ ] **Step 4: Freeze the baseline.** `npx tsx scripts/calibration-report.ts --write-baseline` → `tests/calibration/baseline.json`. `tests/calibration/adjacency.test.ts` fails if any pair that passed in the baseline now fails.
- [ ] **Step 5: Run it.** `npx vitest run tests/calibration` → PASS.
- [ ] **Step 6: Commit:** `git commit -m "data: captured socket geometry and calibrated conventions"`

---

## Milestone M5 — Hardening

### Task 41: End-to-end smoke tests

**Owner:** Inline

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/roundtrip.spec.ts`, `tests/e2e/connect.spec.ts`, `tests/e2e/paint.spec.ts`, `tests/e2e/library.spec.ts`, `tests/e2e/generator.spec.ts`
- Modify: `package.json` (script `e2e`), `src/viewport/debug.ts` (add `exportCode()` and `projectSocket(part, socket)` to `__ge`)

**Interfaces:**
- Consumes: the whole app through the UI and `window.__ge`.

- [ ] **Step 1: Configure.** `playwright.config.ts`: Chromium only; `webServer: npm run dev -- --port 5174 --strictPort`; `baseURL: http://localhost:5174/GrambyEdit/`. Then `npx playwright install chromium`. **Ask before running this: it downloads about 150 MB.**
- [ ] **Step 2: Write the five specs** (spec §19.3), with these exact assertions:
  - **roundtrip:** import spec Appendix A through the Import dialog, then `normalizeEntries(decode(await __ge.exportCode()))` equals the Appendix A JSON, normalised.
  - **connect:** with Appendix B loaded, run the Connect tool on Base socket 5 → pick `Part` → `__ge.doc().order.length === 5`. `Ctrl+Z` → 4; `Ctrl+Shift+Z` → 5.
  - **paint:** with Appendix B loaded, set the color to `#c62828` and box-paint everything → every paintable part in the export has `RGB` `[198, 40, 40]`.
  - **library:** save as "E2E", reload the page, open "E2E" → same `exportCode()`.
  - **generator:** ring of 100 → Generate → click empty space → the exported host has 100 `EphemeralAttachments`.
- [ ] **Step 3: Run them.** `npm run e2e` → 5 passed.
- [ ] **Step 4: Commit:** `git commit -m "test: end-to-end smoke suite"`

### Task 42: Performance pass

**Owner:** Inline

**Files:**
- Modify: `tests/perf/budgets.test.ts`, plus whichever modules the measurements implicate.

- [ ] **Step 1: Add the import budget.** Extend `tests/perf/budgets.test.ts` with `test('decode + model of an 8K-part code under 500 ms')`. It times `parseShareText` on `toShareCode(chainDoc(8000))` and asserts < 500 ms.
- [ ] **Step 2: Run it.** `npx vitest run tests/perf` → PASS, or profile and fix.
- [ ] **Step 3: Browser budgets** (spec §19.4) with `__ge` on `chainDoc(16000)`:
  - first render with cached assets < 2 s;
  - `__ge.fps(3000)` ≥ 50 while orbiting;
  - a click-select round trip < 50 ms (`performance.now()` around `__ge.pick`);
  - meter update < 300 ms after a paint.
  Record the measurements in the commit message.
- [ ] **Step 4: Commit:** `git commit -m "perf: meet the v1 budgets at 16K parts"`

### Task 43: Accessibility checks and the user guide

**Owner:** Haiku (dispatch S)

**Files:**
- Create: `scripts/contrast.ts`, `tests/a11y/labels.test.tsx`, `tests/a11y/contrast.test.ts`
- Modify: `README.md` (a **User guide** section)

**Interfaces:**
- Consumes: `App` (with `vi.mock` of `src/viewport/index`), `src/ui/tokens.css`, `KEYMAPS`.
- Produces: `export function contrastRatio(fg: string, bg: string): number` (WCAG 2.x, hex input), in `scripts/contrast.ts`.

**Rules:**
- **Labels:** every `button` and `[role=button]` rendered by `<App/>` has an accessible name, from its text or `aria-label`.
- **Contrast:** for both themes (`:root` and `[data-theme="light"]`), `--text` and `--muted` on `--bg` and on `--panel` are ≥ 4.5.
- **User guide** sections:
  - Getting started;
  - Controls (generated from `KEYMAPS`, both schemes);
  - Tools;
  - Socket Workbench capture workflow;
  - Limits;
  - Library & backups;
  - Credits.

- [ ] **Step 1: Write the failing tests:**

```ts
// tests/a11y/contrast.test.ts
import { readFileSync } from 'node:fs';
import { contrastRatio } from '../../scripts/contrast';
test('WCAG ratio helper', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  expect(contrastRatio('#e6e8eb', '#1d1f23')).toBeGreaterThan(4.5);
});
test('text tokens reach 4.5:1 in both themes', () => {
  const css = readFileSync('src/ui/tokens.css', 'utf8');
  for (const scope of [':root', '[data-theme="light"]']) {
    const block = css.slice(css.indexOf(scope + ' {'));
    const v = (n: string) => block.match(new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`))![1];
    for (const fg of ['text', 'muted']) for (const bg of ['bg', 'panel']) expect(contrastRatio(v(fg), v(bg)), `${scope} ${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
  }
});
```

```tsx
// tests/a11y/labels.test.tsx (jsdom)
vi.mock('../../src/viewport/index', () => ({ mountViewport: () => () => {} }));
test('every button has an accessible name', () => {
  const { container } = render(<App />);
  for (const b of container.querySelectorAll('button, [role="button"]')) expect((b.getAttribute('aria-label') ?? b.textContent ?? '').trim(), b.outerHTML).not.toBe('');
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/a11y` → FAIL (or PASS where earlier tasks already complied; fix any failure in the owning component).
- [ ] **Step 3: Implement** `contrast.ts`, fix the labels and tokens the tests flag, and write the README user guide.
- [ ] **Step 4: Run them again.** `npx vitest run tests/a11y` → PASS.
- [ ] **Step 5: Commit:** `git commit -m "a11y: label and contrast checks; user guide"`

### Task 44: Release v1

**Owner:** Inline

- [ ] **Step 1: Full gate.** `npm run typecheck && npx vitest run && npm run build && npm run e2e` → all green.
- [ ] **Step 2: Review the branch.**
  1. Do a whole-branch review against `docs/EDITOR_DESIGN.md` with superpowers:requesting-code-review.
  2. Fix the findings.
  3. Re-run Step 1.
- [ ] **Step 3: In-game spot check (you).** Spawn the five exported scenarios from spec §19.5 and confirm.
- [ ] **Step 4: Tag and deploy** (with your OK). `git tag v1.0.0 && git push origin main --tags`. The Pages workflow is green, and the live site loads and round-trips Appendix A.
- [ ] **Step 5: Report** what shipped, what was measured, and what is still open (calibration answers, any residual role conflicts).

---

## Spec coverage map

| spec section | tasks |
|---|---|
| §5 data pipeline, role and frame fixes | 5, 6, 7 |
| §6 core model, fidelity, codec | 2, 3, 4 |
| §7 rules and issues | 8, 16, 31 |
| §8 graph queries | 8 |
| §9 edits, history, move rules | 11, 22, 23, 24 |
| §10 spatial model, calibration | 10, 19, 40 |
| §11 viewport, picking, cameras | 13, 14 |
| §12.1 select | 14, 30 |
| §12.2 connect | 26, 27 |
| §12.3 points | 27 |
| §12.4 move/rotate | 23, 25 |
| §12.5 paint | 28 |
| §12.6 place | 33 |
| §12.7 Socket Workbench | 19, 20, 21 |
| §13.1 browser and favourites | 26 |
| §13.2 outliner, §13.4 stats, §13.5 meters, §13.6 issues | 16 |
| §13.3 properties | 29 |
| §13.7 import/export | 17, 34 |
| §13.8 library, append as parts | 32, 33, 34 |
| §13.9 / §15 generators | 35, 36, 37, 38 |
| §13.10 settings, shortcuts, palette | 30, 31, 39 |
| §14 storage | 20, 32 |
| §16 tier-1 quality of life | 11, 22–24, 26, 27, 30, 31, 33, 39 |
| §17 visual design | 15, 43 |
| §18 errors, support, accessibility | 13, 15, 43 |
| §19 testing and performance | every task; 18, 41, 42 |
| §20 deployment, credit | 1, 18, 44 |

