"""Merge community research + the real-sharecode corpus into one part catalogue.

Outputs (all under ../data):
    part_catalog.json  per part: sockets (child/parent), roles, pieces, props, mesh
    socket_table.json  the socket inventory alone (what a 3D editor needs to snap)
    props_schema.json  prop key -> json type, which parts use it
    corpus_stats.json  corpus-level counters

Sources, all local:
    ../docs/community/rtg-ai-tokens.json  community per-part socket IDs
    ../data/corpus/wiki_codes.txt          185 real sharecodes (ground truth)
    ../docs/community/RtG-Format/old-files/obj_ids-spanish.md
                                         community socket-ID -> semantic name
    ../docs/community/RtG-Format/blocks/parts/*/parts-id.md
                                         community part -> category
    ../meshes/rtg-format/<Part>/<Part>.obj + .json
                                         geometry, scale, LocalPoints
    ../vendor/grambys-workshop/.../Part.tscn
                                         socket transforms for the generic Part

Run:  python build_catalog.py
"""
import base64
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA = ROOT / "data"
CORPUS = DATA / "corpus" / "wiki_codes.txt"
TOKENS = ROOT / "docs" / "community" / "rtg-ai-tokens.json"
OBJ_IDS = ROOT / "docs" / "community" / "RtG-Format" / "old-files" / "obj_ids-spanish.md"
PARTS_ID = ROOT / "docs" / "community" / "RtG-Format" / "blocks" / "parts"
MESHES = ROOT / "meshes" / "rtg-format"
WORKSHOP_TSCN = (ROOT / "vendor" / "grambys-workshop" / "Scripts" /
                 "GrambyObjects" / "Part" / "Part.tscn")

# ---------------------------------------------------------------------------
# Socket roles, established by in-game tests (RTG_BLUEPRINT_FORMAT.md section 4).
# "child" = the socket number used in the self_socket slot of a joint.
# "parent" = the socket number used in the parent_socket slot of a joint.
# ---------------------------------------------------------------------------
ROLES = {
    # part: {socket: role}
    "Gate-AND": {"1": "output", "2": "input", "3": "input", "4": "mount"},
    "Gate-OR": {"1": "output", "2": "input", "3": "input", "4": "mount"},
    "Gate-NOT": {"1": "output", "2": "input", "4": "mount"},
    "Switch": {"1": "output", "2": "input", "3": "mount"},
    "Light": {"1": "input"},
    "BrakeLight": {"1": "input"},
    "Splitter_1": {"3": "input", "5": "output", "4": "input", "6": "output"},
    "Splitter_2": {"3": "input", "5": "output", "9": "output",
                   "4": "input", "6": "output", "10": "output"},
    "Splitter_3": {"3": "input", "5": "output", "7": "output", "9": "output",
                   "4": "input", "6": "output", "8": "output", "10": "output"},
    "Splitter_4": {"1": "input", "3": "input", "5": "output", "7": "output",
                   "9": "output", "2": "input", "4": "output", "6": "output",
                   "8": "output", "10": "output"},
    "Wire": {"1": "input", "3": "output", "2": "input", "4": "output"},
    "Looper": {"1": "input", "2": "output", "3": "output", "4": "output"},
    "Delayer": {"2": "input", "1": "output"},
    "TripWire": {"1": "input", "3": "mount", "2": "input"},
    "Button": {"1": "output", "3": "mount", "2": "input"},
    "RemoteButton": {"1": "output", "3": "mount", "2": "input"},
    "Base": {"3": "mount", "1": "left", "2": "right", "4": "front",
             "5": "top", "6": "bottom"},
    "Anchor": {"1": "mount", "2": "socket", "3": "socket", "4": "socket",
               "5": "socket"},
    "Connector": {"5": "mount", "1": "socket", "2": "socket", "3": "socket",
                  "4": "socket", "6": "socket"},
    "Part": {"1": "mount", "2": "socket", "3": "socket", "4": "socket",
             "5": "socket", "6": "socket"},
    "Stick": {"2": "mount", "1": "socket"},
    "ShortStick": {"2": "mount", "1": "socket"},
    "LongStick": {"2": "mount", "1": "socket"},
    "InputSensor": {"2": "mount", "1": "output"},
    "VelocitySensor": {"2": "mount", "1": "output"},
    "AltitudeSensor": {"2": "mount", "1": "output"},
    "FuelTank": {"2": "mount", "1": "socket"},
    "Bumper": {"1": "mount", "2": "socket"},
}

# The two faces of one physical piece (RTG_BLUEPRINT_FORMAT.md section 3.1).
# One joint per piece, ever.
PIECE_FACES = {
    "Splitter_1": {"3": "A", "4": "A", "5": "B", "6": "B"},
    "Splitter_2": {"3": "A", "4": "A", "5": "B", "6": "B", "9": "C", "10": "C"},
    "Splitter_3": {"3": "A", "4": "A", "5": "B", "6": "B", "7": "C", "8": "C",
                   "9": "D", "10": "D"},
    "Splitter_4": {"1": "A", "2": "A", "3": "B", "4": "B", "5": "C", "6": "C",
                   "7": "D", "8": "D", "9": "E", "10": "E"},
    "Wire": {"1": "A", "2": "A", "3": "B", "4": "B"},
}


# ---------------------------------------------------------------------------
# corpus
# ---------------------------------------------------------------------------
def load_corpus():
    raw = CORPUS.read_text(encoding="utf-8", errors="replace")
    codes = re.findall(r"W1si[A-Za-z0-9+/=]{20,}", raw)
    parsed = []
    for c in codes:
        try:
            objs = json.loads(base64.b64decode(c + "=" * (-len(c) % 4)))
        except Exception:
            continue
        if isinstance(objs, list) and objs and isinstance(objs[0], list):
            parsed.append((c, objs))
    return codes, parsed


def scan_corpus(parsed):
    child_sock = defaultdict(Counter)
    parent_sock = defaultdict(Counter)
    parent_uuid = defaultdict(Counter)
    part_names = Counter()
    props = defaultdict(Counter)
    prop_types = defaultdict(Counter)
    prop_parts = defaultdict(set)
    pairs = Counter()
    entry_count = 0
    joint_count = 0
    for _code, objs in parsed:
        n = len(objs)
        for i, entry in enumerate(objs):
            if not isinstance(entry, list) or len(entry) != 3:
                continue
            name, conns, pr = entry
            part_names[name] += 1
            entry_count += 1
            if isinstance(pr, dict):
                for k, v in pr.items():
                    props[name][k] += 1
                    prop_types[k][type(v).__name__] += 1
                    prop_parts[k].add(name)
            for c in conns or []:
                if not isinstance(c, list) or len(c) != 3:
                    continue
                cs, ps, pi = c
                joint_count += 1
                child_sock[name][str(cs)] += 1
                if isinstance(pi, int) and 1 <= pi <= n:
                    pname = objs[pi - 1][0]
                    if isinstance(ps, str) and ps.startswith("{"):
                        # an ephemeral attachment reference, not a circle id
                        parent_uuid[pname][str(ps)] += 1
                        continue
                    parent_sock[pname][str(ps)] += 1
                    pairs[(name, str(cs), pname, str(ps))] += 1
    return dict(part_names=part_names, child=child_sock, parent=parent_sock,
                parent_uuid=parent_uuid, props=props, prop_types=prop_types,
                prop_parts=prop_parts, pairs=pairs, entries=entry_count,
                joints=joint_count)


# ---------------------------------------------------------------------------
# community data
# ---------------------------------------------------------------------------
def load_tokens():
    raw = json.loads(TOKENS.read_text(encoding="utf-8"))
    # the file is a single-element array in some revisions
    if isinstance(raw, list):
        raw = raw[0]
    nt = raw["NoTokensData"]
    return {
        "local_type": {k: list(v) for k, v in nt["LocalType"].items()},
        "no_local_type": list(nt.get("noLocalType", [])),
        "local_ids": {k: list(v) for k, v in nt["LocalIDs"].items()},
        "no_local_ids": list(nt.get("noLocalIds", [])),
    }


def parse_socket_names():
    """obj_ids-spanish.md -> {part: {socket_id: name}}"""
    text = OBJ_IDS.read_text(encoding="utf-8", errors="replace")
    out = {}
    part = None
    for line in text.splitlines():
        m = re.match(r"^###\s*\d+\.\s*(.+?)\s*$", line)
        if m:
            name = m.group(1).strip()
            part = name if name not in ("???", "Objetos con puntos de conexion "
                                        "propios") else None
            continue
        if part and line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) >= 2 and re.fullmatch(r"\d+", cells[0]):
                nm = cells[1]
                if nm and not nm.lower().startswith("nombre"):
                    out.setdefault(part, {}).setdefault(cells[0], nm)
    return out


def parse_categories():
    out = {}
    if not PARTS_ID.is_dir():
        return out
    for f in sorted(PARTS_ID.glob("*/parts-id.md")):
        cat = f.parent.name
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            m = re.match(r"^##\s+(.+?)\s*\(source section", line)
            if m:
                out.setdefault(m.group(1).strip(), cat)
    return out


# ---------------------------------------------------------------------------
# geometry
# ---------------------------------------------------------------------------
def obj_bbox(path):
    xs, ys, zs = [], [], []
    verts = 0
    with path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if line.startswith("v "):
                p = line.split()
                if len(p) >= 4:
                    xs.append(float(p[1]))
                    ys.append(float(p[2]))
                    zs.append(float(p[3]))
                    verts += 1
    if not xs:
        return None
    lo = [min(xs), min(ys), min(zs)]
    hi = [max(xs), max(ys), max(zs)]
    return {"min": lo, "max": hi,
            "size": [round(hi[i] - lo[i], 4) for i in range(3)],
            "vertices": verts}


def parse_godot_attachments(tscn_path):
    """Godot .tscn attachment nodes -> {socket_id: {position, basis}}

    Only attachment *instances* whose node name is a socket number count;
    the scene also contains a MeshInstance and helper nodes that must not
    be mistaken for sockets.
    """
    if not tscn_path.is_file():
        return {}
    out = {}
    text = tscn_path.read_text(encoding="utf-8", errors="replace")
    for m in re.finditer(
            r'\[node name="([^"]+)"[^\]]*instance=ExtResource\([^\)]*\)\]'
            r'\s*\ntransform = Transform\(([^)]*)\)',
            text):
        node, nums = m.group(1), m.group(2)
        if not re.fullmatch(r"\d+", node):
            continue
        vals = [float(x) for x in nums.split(",")]
        if len(vals) != 12:
            continue
        # Godot Transform(xx,xy,xz, yx,yy,yz, zx,zy,zz, ox,oy,oz) - basis columns
        bx = vals[0:3]
        by = vals[3:6]
        bz = vals[6:9]
        origin = vals[9:12]
        out[node] = {
            "position": [round(v, 6) for v in origin],
            "basis": {"x": [round(v, 6) for v in bx],
                      "y": [round(v, 6) for v in by],
                      "z": [round(v, 6) for v in bz]},
        }
    return out


def euler_from_basis(basis):
    """Row-major 3x3 -> XYZ euler in degrees (Godot order)."""
    x, y, z = basis["x"], basis["y"], basis["z"]
    r = [[x[0], y[0], z[0]],
         [x[1], y[1], z[1]],
         [x[2], y[2], z[2]]]
    sy = math.sqrt(r[0][0] ** 2 + r[1][0] ** 2)
    if sy > 1e-6:
        pitch = math.atan2(r[2][1], r[2][2])
        yaw = math.atan2(-r[2][0], sy)
        roll = math.atan2(r[1][0], r[0][0])
    else:
        pitch = math.atan2(-r[1][2], r[1][1])
        yaw = math.atan2(-r[2][0], sy)
        roll = 0.0
    return [round(math.degrees(pitch), 3), round(math.degrees(yaw), 3),
            round(math.degrees(roll), 3)]


# ---------------------------------------------------------------------------
def main():
    codes, parsed = load_corpus()
    corpus = scan_corpus(parsed)
    tokens = load_tokens()
    names = parse_socket_names()
    cats = parse_categories()

    parts = {}

    def entry(part):
        if part not in parts:
            parts[part] = {
                "name": part,
                "category": cats.get(part),
                "sockets": {"child": {}, "parent": {}},
                "pieces": PIECE_FACES.get(part),
                "props": {},
                "mesh": None,
                "socket_geometry": {},
            }
        return parts[part]

    # --- community socket tables -----------------------------------------
    for part, socks in tokens["local_type"].items():
        e = entry(part)
        for s in socks:
            e["sockets"]["child"].setdefault(s, {"sources": []})["sources"].append("tokens.LocalType")
    for part, socks in tokens["local_ids"].items():
        e = entry(part)
        for s in socks:
            e["sockets"]["parent"].setdefault(s, {"sources": []})["sources"].append("tokens.LocalIDs")

    # --- corpus socket tables --------------------------------------------
    for part, counter in corpus["child"].items():
        e = entry(part)
        for s, n in counter.items():
            d = e["sockets"]["child"].setdefault(s, {"sources": []})
            d["sources"].append("corpus")
            d["corpus_count"] = n
    for part, counter in corpus["parent"].items():
        e = entry(part)
        for s, n in counter.items():
            d = e["sockets"]["parent"].setdefault(s, {"sources": []})
            d["sources"].append("corpus")
            d["corpus_count"] = n
    for part, counter in corpus["parent_uuid"].items():
        e = entry(part)
        e.setdefault("sockets", {}).setdefault("parent_uuid", {})
        for s, n in counter.items():
            d = e["sockets"]["parent_uuid"].setdefault(s, {"sources": []})
            d["sources"].append("corpus")
            d["corpus_count"] = n

    # --- roles + semantic names -----------------------------------------
    for part, roles in ROLES.items():
        e = entry(part)
        for s, role in roles.items():
            for side in ("child", "parent"):
                d = e["sockets"][side].get(s)
                if d is not None:
                    d["role"] = role
    for part, smap in names.items():
        e = entry(part)
        for s, nm in smap.items():
            for side in ("child", "parent"):
                d = e["sockets"][side].get(s)
                if d is not None:
                    d.setdefault("name", nm)

    # --- props ------------------------------------------------------------
    for part, keys in corpus["props"].items():
        e = entry(part)
        for k, n in keys.items():
            e["props"][k] = {"corpus_count": n}

    # --- meshes -----------------------------------------------------------
    for d in sorted(MESHES.iterdir()) if MESHES.is_dir() else []:
        if not d.is_dir():
            continue
        part = d.name
        obj = d / f"{part}.obj"
        mjson = d / f"{part}.json"
        e = entry(part)
        mesh = {"obj": str(obj.relative_to(ROOT)).replace("\\", "/")}
        if obj.is_file():
            bb = obj_bbox(obj)
            if bb:
                mesh.update(bb)
        if mjson.is_file():
            try:
                mj = json.loads(mjson.read_text(encoding="utf-8"))[0]
                mesh["scale"] = mj.get("RtG-Format", {}).get(
                    "RtG-Preview", {}).get("Size", {}).get("default", 1)
                mesh["tooltip"] = mj.get("Tooltip") or None
                lp = mj.get("LocalPoints") or {}
                if lp:
                    e["socket_geometry"] = {
                        str(k): {"position": v[0], "rotation_deg": v[1],
                                 "source": "community model JSON LocalPoints",
                                 "confidence": "community"}
                        for k, v in lp.items()}
                    for s in e["socket_geometry"]:
                        e["sockets"]["parent"].setdefault(
                            s, {"sources": ["model.LocalPoints"]})["sources"].append(
                                "model.LocalPoints")
            except Exception as exc:  # malformed community json
                mesh["error"] = f"{type(exc).__name__}: {exc}"
        e["mesh"] = mesh

    # --- known socket transforms: the generic Part ------------------------
    # Geometry is side-agnostic: a socket number identifies a physical circle
    # on the part, whether the file uses it in the child or the parent slot.
    att = parse_godot_attachments(WORKSHOP_TSCN)
    if att:
        e = entry("Part")
        e["socket_geometry"] = {
            sid: {"position": v["position"],
                  "basis": v["basis"],
                  "rotation_deg": euler_from_basis(v["basis"]),
                  "source": "grambys-workshop Part.tscn",
                  "confidence": "editor-scene"}
            for sid, v in att.items()}

    # --- emit -------------------------------------------------------------
    props_schema = {}
    for key, types in corpus["prop_types"].items():
        props_schema[key] = {
            "json_types": dict(types),
            "parts": sorted(corpus["prop_parts"][key]),
            "total": sum(types.values()),
        }

    catalog = {
        "_meta": {
            "generated_by": "tools/build_catalog.py",
            "corpus_codes": len(codes),
            "corpus_parsed": len(parsed),
            "corpus_entries": corpus["entries"],
            "corpus_joints": corpus["joints"],
            "parts": len(parts),
            "units": "studs (1 obj unit = 1 Roblox stud)",
            "socket_roles": "in-game verified (RTG_BLUEPRINT_FORMAT.md s4)",
            "socket_ids": "community tokens.json + corpus",
        },
        "parts": parts,
    }

    socket_table = {
        "_meta": {"parts": len(parts),
                  "note": "'role' is the in-game verified meaning and wins "
                          "over the community 'name'; 'parent_uuid' holds "
                          "ephemeral attachment references, not circle ids"},
        "sockets": {
            p: {
                "child": {s: {"role": d.get("role"), "name": d.get("name"),
                              "sources": d["sources"]}
                          for s, d in sorted(v["sockets"]["child"].items(),
                                             key=lambda kv: int(kv[0])
                                             if kv[0].isdigit() else 0)},
                "parent": {s: {"role": d.get("role"), "name": d.get("name"),
                               "sources": d["sources"]}
                           for s, d in sorted(v["sockets"]["parent"].items(),
                                              key=lambda kv: int(kv[0])
                                              if kv[0].isdigit() else 0)},
                "parent_uuid": sorted(
                    v["sockets"].get("parent_uuid", {})),
                "pieces": v["pieces"],
            } for p, v in parts.items()
        },
    }

    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "part_catalog.json").write_text(
        json.dumps(catalog, indent=1, ensure_ascii=False), encoding="utf-8")
    (DATA / "socket_table.json").write_text(
        json.dumps(socket_table, indent=1, ensure_ascii=False), encoding="utf-8")
    (DATA / "props_schema.json").write_text(
        json.dumps({"_meta": {"keys": len(props_schema)},
                    "props": props_schema}, indent=1, ensure_ascii=False),
        encoding="utf-8")

    top_pairs = [{"child": f"{a}.self{cs}", "parent": f"{b}.sock{ps}",
                  "count": n} for (a, cs, b, ps), n in corpus["pairs"].most_common(60)]
    stats = {
        "codes_matched": len(codes),
        "codes_parsed": len(parsed),
        "entries": corpus["entries"],
        "joints": corpus["joints"],
        "parts_in_corpus": len(corpus["part_names"]),
        "part_frequency": dict(corpus["part_names"].most_common()),
        "top_pairs": top_pairs,
        "no_local_type": tokens["no_local_type"],
        "no_local_ids": tokens["no_local_ids"],
    }
    (DATA / "corpus_stats.json").write_text(
        json.dumps(stats, indent=1, ensure_ascii=False), encoding="utf-8")

    # --- report -----------------------------------------------------------
    geo = [p for p, v in parts.items() if v["socket_geometry"]]
    print(f"parts in catalogue        : {len(parts)}")
    print(f"  from corpus             : {len(corpus['part_names'])}")
    print(f"  from community tokens   : {len(tokens['local_type'])}")
    print(f"  with a mesh             : {sum(1 for v in parts.values() if v['mesh'])}")
    print(f"  with socket geometry    : {len(geo)}  -> {sorted(geo)}")
    print(f"props keys                : {len(props_schema)}")
    print(f"wrote data/part_catalog.json, socket_table.json, "
          f"props_schema.json, corpus_stats.json")


if __name__ == "__main__":
    main()
