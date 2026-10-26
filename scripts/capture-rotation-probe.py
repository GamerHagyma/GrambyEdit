"""Read-only native geometry measurement for a user-authorized rotation probe.

No process writes, injection, hooks, network access or modification of capture templates.
Only CFrames/sizes for named probe types near its SteeringGyro root are written to output.
Requires explicit --pid and --output; validates Roblox executable and cached RTTI layout.
Do not run until the user authorizes reading live Roblox geometry memory.
"""
import argparse
import hashlib
import ctypes
import datetime
import json
import math
import os
from pathlib import Path
import struct
import time
from ctypes import wintypes


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pid", type=int, required=True)
    ap.add_argument("--layout", type=Path, default=Path(__file__).parent / "lib" / "roblox-geometry-layout.json")
    ap.add_argument("--allow-live-read", action="store_true", help="Confirm the user authorized this live geometry capture")
    ap.add_argument("--manifest", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()
    if not args.allow_live_read:
        raise RuntimeError("Live read not enabled; obtain session authorization and pass --allow-live-read.")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if manifest.get("format") != "grambyedit-rotation-probe-v1":
        raise RuntimeError("Invalid rotation-probe manifest")
    allowed = {manifest["root"]["type"]} | {s["type"] for s in manifest["samples"]} | {s["hostType"] for s in manifest["samples"]}
    k = ctypes.WinDLL("kernel32", use_last_error=True)
    ps = ctypes.WinDLL("psapi", use_last_error=True)
    k.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    k.OpenProcess.restype = wintypes.HANDLE
    k.CloseHandle.argtypes = [wintypes.HANDLE]
    k.ReadProcessMemory.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t)]
    k.ReadProcessMemory.restype = wintypes.BOOL
    k.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    ps.EnumProcessModules.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.HMODULE), wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
    ps.EnumProcessModules.restype = wintypes.BOOL
    handle = k.OpenProcess(0x410, False, args.pid)  # QUERY_INFORMATION | VM_READ only
    if not handle:
        raise OSError(ctypes.get_last_error(), "OpenProcess read/query")
    try:
        path = ctypes.create_unicode_buffer(32768)
        length = wintypes.DWORD(len(path))
        if not k.QueryFullProcessImageNameW(handle, 0, path, ctypes.byref(length)) or Path(path.value).name.lower() != "robloxplayerbeta.exe":
            raise RuntimeError("Target is not the Roblox Player; stopped.")
        modules = (wintypes.HMODULE * 1024)()
        needed = wintypes.DWORD()
        if not ps.EnumProcessModules(handle, modules, ctypes.sizeof(modules), ctypes.byref(needed)):
            raise OSError(ctypes.get_last_error(), "EnumProcessModules")
        base = modules[0]

        def read(address, size):
            if not address or size < 0 or size > 4 * 1024 * 1024:
                return None
            data = ctypes.create_string_buffer(size)
            got = ctypes.c_size_t()
            if not k.ReadProcessMemory(handle, address, data, size, ctypes.byref(got)) or got.value != size:
                return None
            return data.raw

        def u64(data, off=0):
            return struct.unpack_from("<Q", data, off)[0]

        strings = {}
        def string(address):
            if address in strings:
                return strings[address]
            data = read(address, 32)
            result = None
            if data:
                n, capacity = struct.unpack_from("<QQ", data, 16)
                if 0 <= n <= 256 and n <= capacity <= 100000:
                    raw = data[:n] if capacity < 16 else read(u64(data), n)
                    if raw is not None:
                        try:
                            result = raw.decode("utf-8")
                        except UnicodeDecodeError:
                            pass
            strings[address] = result
            return result

        def node(address):
            data = read(address, 152)
            return (string(u64(data, 0x68)), u64(data, 0x60)) if data else (None, 0)

        def children(address):
            data = read(address, 152)
            vec = read(u64(data, 0x70), 24) if data else None
            if not vec:
                return []
            first, end, capacity = struct.unpack("<QQQ", vec)
            if not first <= end <= capacity or (end - first) % 16 or end - first > 1_600_000:
                return []
            entries = read(first, end - first)
            if entries is None:
                return []
            return [u64(entries, i) for i in range(0, len(entries), 16) if node(u64(entries, i))[1] == address]

        # Bind the known field offsets to the executable used for the verified probe.
        # A new client requires a new calibration; RTTI validation alone is not enough.
        layout = json.loads(args.layout.read_text(encoding="utf-8"))
        if layout.get("format") != "grambyedit-readonly-geometry-layout-v1":
            raise RuntimeError("Unsupported geometry layout profile.")
        digest = hashlib.sha256(Path(path.value).read_bytes()).hexdigest()
        if digest != layout["validatedExecutableSHA256"]:
            raise RuntimeError("Roblox executable changed; stop and recalibrate using docs/NATIVE_GEOMETRY_PROBING.md.")
        model_type = layout["dataModelType"]
        descriptor = layout["typeDescriptorRva"]
        if read(base + descriptor + 16, len(model_type)) != model_type.encode():
            raise RuntimeError("DataModel RTTI descriptor does not match this process.")
        cls = {"vtables": layout["vtables"]}
        primary = next(v for v in cls["vtables"] if v["offset"] == 0)
        secondary = next(v for v in cls["vtables"] if v["offset"] != 0)
        needle = struct.pack("<Q", base + primary["rva"])

        class MBI(ctypes.Structure):
            _fields_ = [("BaseAddress", ctypes.c_void_p), ("AllocationBase", ctypes.c_void_p),
                ("AllocationProtect", wintypes.DWORD), ("PartitionId", wintypes.WORD),
                ("RegionSize", ctypes.c_size_t), ("State", wintypes.DWORD),
                ("Protect", wintypes.DWORD), ("Type", wintypes.DWORD)]
        k.VirtualQueryEx.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.POINTER(MBI), ctypes.c_size_t]
        k.VirtualQueryEx.restype = ctypes.c_size_t
        address, scanned, started = 0, 0, time.monotonic()
        workspace = None
        matches, validated = 0, 0
        while workspace is None:
            mbi = MBI()
            if not k.VirtualQueryEx(handle, address, ctypes.byref(mbi), ctypes.sizeof(mbi)):
                break
            region, size = mbi.BaseAddress or 0, mbi.RegionSize
            address = region + size
            if not size or time.monotonic() - started > 45 or scanned > 8 * 1024**3:
                break
            if mbi.State != 0x1000 or mbi.Type != 0x20000 or mbi.Protect & 0x100 or mbi.Protect & 0xff not in (2, 4, 8, 0x20, 0x40, 0x80):
                continue
            for offset in range(0, size, 4 * 1024 * 1024):
                data = read(region + offset, min(4 * 1024 * 1024, size - offset))
                if data is None:
                    continue
                scanned += len(data)
                start = 0
                while True:
                    at = data.find(needle, start)
                    if at < 0:
                        break
                    candidate = region + offset + at
                    start = at + 8
                    matches += 1
                    if candidate % 8 or read(candidate + secondary["offset"], 8) != struct.pack("<Q", base + secondary["rva"]):
                        continue
                    validated += 1
                    # DataModel has multiple native base subobjects. Instance's
                    # header is not necessarily the primary vtable at offset 0.
                    for table in cls["vtables"]:
                        instance = candidate + table["offset"]
                        names = {node(c)[0]: c for c in children(instance)}
                        if "Workspace" in names and "ReplicatedStorage" in names and "Players" in names:
                            workspace = names["Workspace"]
                            print(json.dumps({"validatedDataModel": node(instance)[0], "instanceBaseOffset": table["offset"]}), flush=True)
                            break
                    if workspace is not None:
                        break
                if workspace is not None:
                    break
        if workspace is None:
            raise RuntimeError(f"Could not validate a live Workspace; read {scanned // 1024**2} MiB, primary matches {matches}, secondary matches {validated}; no geometry file written.")

        def primitive(address):
            data = read(address, 0x180)
            value = read(u64(data, 0x178), 0x1d4) if data else None
            if not value:
                return None
            r = struct.unpack_from("<12f", value, 0xb0)
            sizes = struct.unpack_from("<3f", value, 0x1c4)
            if not all(math.isfinite(n) for n in (*r, *sizes)) or not all(0 < n < 10000 for n in sizes):
                return None
            for i in range(3):
                for j in range(3):
                    dot = sum(r[3*k+i] * r[3*k+j] for k in range(3))
                    if abs(dot - (1 if i == j else 0)) > 1e-3:
                        return None
            return {"cframe": [*r[9:], *r[:9]], "size": list(sizes)}

        # Only geometry for the explicit probe type allowlist. No attributes,
        # player identity, scripts, chat, credentials, writes or network calls.
        stack, seen, models = [workspace], set(), []
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            if len(seen) > 100000 or time.monotonic() - started > 90:
                raise RuntimeError("Workspace traversal limit reached; no partial capture written.")
            name, _ = node(current)
            kids = children(current)
            if name in allowed:
                header = read(current, 0x248)
                root = u64(header, 0x240) if header else 0
                p = primitive(root) if root and root in kids else None
                if p:
                    pieces = []
                    for kid in kids:
                        geometry = primitive(kid)
                        if geometry:
                            pieces.append({"name": node(kid)[0], **geometry})
                    models.append({"name": name, "primaryPart": node(root)[0], **p, "children": pieces})
            stack.extend(kids)
        roots = [m for m in models if m["name"] == manifest["root"]["type"]]
        if not roots:
            raise RuntimeError("No spawned SteeringGyro root found; no geometry file written.")
        nearby = [m for m in models if any(sum((m["cframe"][i] - r["cframe"][i])**2 for i in range(3)) < 160**2 for r in roots)]
        payload = {"format": "readonly-live-rotation-probe-geometry", "pid": args.pid,
            "probeSHA256": manifest["codeSHA256"], "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "models": nearby}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(json.dumps({"models": len(nearby), "rootCandidates": len(roots), "output": str(args.output)}))
    finally:
        k.CloseHandle(handle)


if __name__ == "__main__":
    main()
