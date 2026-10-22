"""Merge captured socket geometry into the part catalogue.

The one thing the format spec cannot give us is WHERE each socket sits on
its part. That data has to be captured from the running game. This script
takes such a capture and folds it into data/part_catalog.json, so the editor
always reads geometry from a single place.

Capture file format (JSON), see captures/README.md:

{
  "captured": "2026-10-22",
  "method": "in-game measurement",
  "units": "studs",
  "parts": {
    "Gate-AND": {
      "4": {"position": [0, -0.2, 0],
            "rotation_deg": [0, 0, 0],
            "basis": {"x": [1,0,0], "y": [0,1,0], "z": [0,0,1]},
            "confidence": "verified",
            "note": "mount face, measured from the top-down screenshot"}
    }
  }
}

Usage:
    python merge_geometry.py <capture.json> [...]      # merge and rewrite
    python merge_geometry.py --show                    # what geometry we have
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CATALOG = ROOT / "data" / "part_catalog.json"


def main():
    args = sys.argv[1:]
    if not args or args[0] == "--show":
        cat = json.loads(CATALOG.read_text(encoding="utf-8"))
        parts = cat["parts"]
        have = {p: v for p, v in parts.items() if v.get("socket_geometry")}
        print(f"parts with socket geometry: {len(have)} / {len(parts)}")
        for p, v in sorted(have.items()):
            for sid, g in sorted(v["socket_geometry"].items(),
                                 key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0):
                print(f"  {p:16s} sock {sid:>3s}  pos={g.get('position')} "
                      f"rot={g.get('rotation_deg')} "
                      f"[{g.get('confidence', '?')}]")
        missing = [p for p in parts
                   if not parts[p].get("socket_geometry")]
        print(f"\nparts still missing geometry ({len(missing)}):")
        print("  " + ", ".join(sorted(missing)))
        return 0

    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    for path in args:
        if path == "--show":
            continue
        cap = json.loads(Path(path).read_text(encoding="utf-8"))
        added = 0
        for part, sockets in (cap.get("parts") or {}).items():
            entry = cat["parts"].setdefault(part, {
                "name": part, "category": None,
                "sockets": {"child": {}, "parent": {}},
                "pieces": None, "props": {}, "mesh": None,
                "socket_geometry": {}})
            geo = entry.setdefault("socket_geometry", {})
            for sid, g in sockets.items():
                g = dict(g)
                g.setdefault("confidence", "verified")
                g.setdefault("source", cap.get("method", "in-game capture"))
                g.setdefault("captured", cap.get("captured"))
                geo[str(sid)] = g
                added += 1
        print(f"merged {added} socket transform(s) from {path}")
    CATALOG.write_text(json.dumps(cat, indent=1, ensure_ascii=False),
                       encoding="utf-8")
    print(f"updated {CATALOG.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
