"""Show concrete corpus builds that appear to mate both faces of one piece.

Usage: python inspect_piece_violations.py [limit]
"""
import base64
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

PIECE_FACES = {
    "Splitter_1": {"3": "A", "4": "A", "5": "B", "6": "B"},
    "Splitter_2": {"3": "A", "4": "A", "5": "B", "6": "B", "9": "C", "10": "C"},
    "Splitter_3": {"3": "A", "4": "A", "5": "B", "6": "B", "7": "C", "8": "C",
                   "9": "D", "10": "D"},
    "Splitter_4": {"1": "A", "2": "A", "3": "B", "4": "B", "5": "C", "6": "C",
                   "7": "D", "8": "D", "9": "E", "10": "E"},
    "Wire": {"1": "A", "2": "A", "3": "B", "4": "B"},
}


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    raw = (ROOT / "data" / "corpus" / "wiki_codes.txt").read_text(
        encoding="utf-8", errors="replace")
    codes = re.findall(r"W1si[A-Za-z0-9+/=]{20,}", raw)
    shown = 0
    for code in codes:
        try:
            objs = json.loads(base64.b64decode(code + "=" * (-len(code) % 4)))
        except Exception:
            continue
        if not (isinstance(objs, list) and objs and isinstance(objs[0], list)):
            continue
        n = len(objs)
        pieces = defaultdict(list)
        detail = {}
        for i, entry in enumerate(objs):
            if not isinstance(entry, list) or len(entry) != 3:
                continue
            name, conns, _ = entry
            for c in conns or []:
                if not isinstance(c, list) or len(c) != 3:
                    continue
                cs, ps, pi = c
                if not (isinstance(pi, int) and 1 <= pi <= n):
                    continue
                pname = objs[pi - 1][0]
                pf = PIECE_FACES.get(pname)
                if pf and str(ps) in pf:
                    pieces[(pi - 1, pf[str(ps)])].append(("as parent", str(ps), i))
                    detail[(pi - 1, pf[str(ps)])] = pname
                cf = PIECE_FACES.get(name)
                if cf and str(cs) in cf:
                    pieces[(i, cf[str(cs)])].append(("as child", str(cs), pi - 1))
                    detail[(i, cf[str(cs)])] = name
        bad = {k: v for k, v in pieces.items() if len(v) > 1}
        if not bad:
            continue
        shown += 1
        print("=" * 74)
        print(f"build #{shown}  entries={n}  len(code)={len(code)}")
        for (idx, label), uses in bad.items():
            part = detail[(idx, label)]
            print(f"  entry {idx+1} ({part}) piece {label} used "
                  f"{len(uses)}x:")
            for role, sock, other in uses:
                print(f"      {role:9s} socket {sock}  <-> entry {other+1} "
                      f"({objs[other][0]})")
            print(f"      entry {idx+1} raw: {json.dumps(objs[idx])}")
        if shown >= limit:
            break
    if not shown:
        print("no violations found")


if __name__ == "__main__":
    main()
