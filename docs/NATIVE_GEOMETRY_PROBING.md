# Read-only native game geometry probes

This workflow compares an exported creation with **actual spawned BasePart CFrames**, rather than reconstructing two exports through the same editor math. It resolved the GasCap calibration and the broader point-mount rotation issue on 2026-10-26. The [results](superpowers/research/2026-10-26-point-mount-rotation.md) and measured regression fixtures remain in the repo.

## Tools and scope

| File | Purpose |
| --- | --- |
| `scripts/rotation-probe.ts` | Generate a 171-part / 130-sample creation, copy-code gallery and slot manifest |
| `scripts/capture-rotation-probe.py` | Windows-only, read-only capture of named probe geometry near its root |
| `scripts/lib/roblox-geometry-layout.json` | Known DataModel RTTI RVAs and the SHA256 of the executable whose geometry layout was verified |
| `scripts/compare-rotation-probe.ts` | Offline unique sample assignment and native/editor comparison |
| `tests/fixtures/rotation-probe-native.json` | Direct native observations for ten types and point/socket/hinge cases |
| `tests/fixtures/servo-point-native.json` | Original servo observation and all five Splitter bodies |
| `tests/fixtures/gascap-native-pitched.json` | Independent earlier GasCap observations on two rotated hosts |

Node 24+, installed repo dependencies, Python 3 on Windows, and an accessible Roblox Player are sufficient. No executor, injected Lua, Studio plugin or memory-writing library is used. The tools are research utilities, outside the deployed browser bundle.

**Authorization:** obtain session authorization before reading the running game's geometry. If the user already explicitly authorized this capture, proceed without asking again. Preparing a creation, reading saved captures and running the offline comparison do not need a new live capture. The capture script also requires `--allow-live-read` to make the operator's intent explicit; that flag is not a substitute for authorization.

## Repeat the experiment

Run from the repo root. Use the normal `node`/`python` binaries or the environment's bundled runtimes; do not assume a previous session's absolute runtime paths or PID still exist.

```powershell
node --import tsx scripts/rotation-probe.ts .claude/rotation-probe
```

Open `.claude/rotation-probe/index.html` through the local Vite server, for example `http://127.0.0.1:5193/GrambyEdit/.claude/rotation-probe/index.html` when that is the current dev-server address. The generator writes the **full** code to `rotation-probe.txt`; the gallery Copy button copies that file. It also writes the SHA256, exact point frames, entry numbers, types, property values and grid slots to `manifest.json`.

Ask the user to spawn this code, let it settle, leave it spawned and avoid activating the servos or interacting with doors. Prefer one test build with no nearby duplicate root/build. The yellow SteeringGyro is the unique root; gray parts are physical-socket hosts. The probe covers:

- Ten types: Part, Connector, ShortStick, InputSensor, Bearing, Servo, Servo_Physics, DoorA, GasCap and Spoiler.
- Nine point-frame / Orientation combinations per type, including mixed noncommuting rotations.
- Thirty ordinary-socket controls, four physical door-hinge controls and six spinning-output controls.

After the user says it is spawned and has authorized the read:

```powershell
Get-Process -Name RobloxPlayerBeta | Select-Object Id, Path
python scripts/capture-rotation-probe.py --pid <current-pid> --manifest .claude/rotation-probe/manifest.json --output .claude/rotation-probe/live-native.json --allow-live-read
node --import tsx scripts/compare-rotation-probe.ts .claude/rotation-probe
```

The capture validates the process name and executable hash, then its live RTTI descriptor and multiple vtable pointers, before traversing the verified Workspace. The known successful probe found **171 models and one root candidate**. The comparison validates the code/manifest/capture hashes, rejects missing or ambiguous assignments, writes `comparison-current.json`, and exits nonzero on a failed pose check. It never replaces native observations with predictions.

Expected output for the saved 2026-10-26 probe is `samples: 130`, `fixedPassed: 126`, `freeAxisPassed: 4`, `failed: 0`. Maximum measured center error was approximately **0.000271 studs**. Those counts are specific to this probe, not a guarantee for an edited creation or a new client version.

Keep manifests, codes and raw captures together in an ignored `.claude/` folder. Commit only the minimum direct observations needed for a regression, plus provenance/hash and the independently verified convention. The user can remove the spawned probe after capture; offline comparison does not require it to stay in game.

## What the capture actually reads

`OpenProcess(0x410)` requests only `PROCESS_QUERY_INFORMATION | PROCESS_VM_READ`. The script calls `QueryFullProcessImageNameW`, `EnumProcessModules`, `VirtualQueryEx` and `ReadProcessMemory`. It does not write process memory, inject code, hook the game or use network calls.

The profile stores **relative virtual addresses**, not reusable live pointers. ASLR is handled with the current module base. Finding the DataModel's primary vtable alone is insufficient: its Instance header was at another native base subobject, offset **496** in the verified client. The script checks each profiled vtable offset and accepts the Instance base only when its children include Workspace, ReplicatedStorage and Players. Those names identify the container; player/chat data are not captured.

For the verified executable, these observations explain the field reads in the script:

| Structure | Verified field/layout |
| --- | --- |
| Instance | Name string pointer `+0x68`, parent pointer `+0x60`, children vector pointer `+0x70` |
| Children vector | Three pointers: first/end/capacity; 16-byte entries; each child's parent must point back to the owner |
| Model | PrimaryPart pointer `+0x240`; it must be one of that model's direct children |
| BasePart | Primitive pointer `+0x178` |
| Primitive | Twelve float32 transform values at `+0xB0`; size at `+0x1C4` |
| Saved CFrame | Position followed by the row-major 3×3 rotation, in Roblox `GetComponents()` order |

Strings, vectors and reads have length bounds. Frames must be finite and orthonormal; sizes must be finite and positive. Workspace discovery is bounded by time/bytes and traversal by time/instance count. A discovery/traversal failure writes no partial capture. Only the manifest's type allowlist near the root is retained, including direct piece CFrames/sizes; unrelated attributes, scripts, identities and raw memory dumps are not output.

## Comparing without fooling yourself

1. Use the **measured root/host frame** to remove the build's arbitrary world position and rotation. Fit a rigid transform from many known parts only when the host identity is independently established; check unique matches and residuals.
2. Identify samples by type and separated manifest slot. Physical door panels can extend outside their slot center; the comparison uses a tight socket-center assignment based on the measured host for those cases, then checks the independently captured rotation. If that assumption fails, stop and inspect the assignment rather than enlarging the tolerance until it passes.
3. Compare all relevant pieces. Wires, Splitters, switches and similar parts have independent body frames. `poses.world` is the lead body, which can be an output; it is not always the native Handle. Use `poses.bodies` and the catalog's subpart frames for piece centers.
4. Separate point-frame, physical-socket and Orientation effects with the controls. Use neutral and mixed rotations; flat squares alone cannot distinguish in-plane axes or half-thickness offsets.
5. Treat free angles as physical state. Bearing and physics-servo outputs are checked for mount center and axis, not a snapshot's free rotation angle. Do not change pose conventions to fit arbitrary simulation motion.
6. Store **direct raw CFrames** as expected values. Re-exported attachment coordinates prove serialization fidelity, not world placement. An editor export re-imported through the same wrong rule is circular evidence.
7. Add a regression that fails before changing the rule. Recheck inverse placement, free movement, copying, symmetry and cache context as well as forward posing. Preserve the existing native GasCap and physical-door checks.

For this probe, the common effective point socket is `S * Rx(90°) * Ry(-90°)`, with captured translation intact. A servo-only fixed `T(position) * Rz(180°)` happens to be equivalent for that family's socket frame; it is not the general rule. Orientation order/signs already matched the measured controls.

## When Roblox updates

**Stop on a hash or layout mismatch.** The strict executable binding is intentional: valid DataModel RTTI does not prove BasePart/Primitive field offsets stayed unchanged. Do not disable the check or copy new RVAs into the profile and call the geometry verified.

The original RTTI discovery, if a new authorized calibration is needed, was:

1. Read the current PE section table and module base. Search mapped `.rdata`/`.data` for the MSVC decorated type string `.?AVDataModel@RBX@@`; the TypeDescriptor starts 16 bytes before the string.
2. In mapped `.rdata`, find 32-bit references to that descriptor RVA. Candidate x64 Complete Object Locators are six uint32 values starting 12 bytes before the reference: signature, base-subobject offset, constructor displacement, type-descriptor RVA, class-descriptor RVA and self RVA. Require signature 1, the expected type RVA and a self RVA equal to the candidate's location.
3. Find 64-bit pointers to each locator's current address. The vtable begins eight bytes after the pointer. Record its RVA and base-subobject offset; validate multiple tables on live instances.
4. Locate the Instance base through actual parent/children/name invariants, then validate Model PrimaryPart and primitive layout against a known Part/Connector's dimensions, rigid frames and controlled transforms. These are version-specific observations, not universal Roblox offsets.
5. Only after independent geometry checks, update the version-bound profile and its executable SHA256, record the client/version/date and rerun the probe. Preserve old native fixtures; explain any intentional convention change with new evidence.

Prefer a supported game/Studio export when it supplies the needed world geometry. The memory reader is a narrowly scoped measurement fallback; future sessions should not expand it into a general game-memory tool merely because this runbook exists.
