"""Quantify how often real creations use BOTH faces of one physical piece.

The spec claims "0 violations across 37,115 real joints". This script tests
that claim under the natural reading of the rule:

    a part instance consumes a piece when it is used as a child (child-side
    face) or when a child is attached to it (parent-side face);
    using both faces of one piece is the tearing failure.

It also separates the two situations that look identical in the file:
  * both faces used by ordinary joints
  * one face used by an ephemeral mount and the other by a joint
    (this is the arrangement that actually tore apart in the v5 build)

Usage: python piece_usage_stats.py
"""
import base64
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# (child-side face, parent-side face) of one physical piece, per part type.
# Odd number = the face used when the part is the child,
# even number = the face used when a child attaches to it.
PIECE_FACES = {
    "Splitter_1": {"3": "A", "4": "A", "5": "B", "6": "B"},
    "Splitter_2": {"3": "A", "4": "A", "5": "B", "6": "B", "9": "C", "10": "C"},
    "Splitter_3": {"3": "A", "4": "A", "5": "B", "6": "B", "7": "C", "8": "C",
                   "9": "D", "10": "D"},
    "Splitter_4": {"1": "A", "2": "A", "3": "B", "4": "B", "5": "C", "6": "C",
                   "7": "D", "8": "D", "9": "E", "10": "E"},
    "Wire": {"1": "A", "2": "A", "3": "B", "4": "B"},
}


def is_uuid(s):
    return isinstance(s, str) and s.startswith("{") and s.endswith("}")


def main():
    raw = (ROOT / "data" / "corpus" / "wiki_codes.txt").read_text(
        encoding="utf-8", errors="replace")
    codes = re.findall(r"W1si[A-Za-z0-9+/=]{20,}", raw)

    builds = 0
    both_faces_builds = 0
    both_faces_instances = 0
    mount_conflicts = 0
    mount_only = 0
    pair_use = Counter()
    kinds = Counter()
    examples = []

    for code in codes:
        try:
            objs = json.loads(base64.b64decode(code + "=" * (-len(code) % 4)))
        except Exception:
            continue
        if not (isinstance(objs, list) and objs and isinstance(objs[0], list)):
            continue
        builds += 1
        n = len(objs)

        # per part instance: piece -> list of uses
        uses = defaultdict(list)
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
                mount = is_uuid(ps)
                cf = PIECE_FACES.get(name)
                if cf and str(cs) in cf:
                    uses[(i, cf[str(cs)])].append(("child", str(cs), mount))
                pf = PIECE_FACES.get(pname)
                if pf and str(ps) in pf:
                    uses[(pi - 1, pf[str(ps)])].append(("parent", str(ps), mount))

        bad = {k: v for k, v in uses.items() if len(v) > 1}
        if bad:
            both_faces_builds += 1
            both_faces_instances += len(bad)
            for k, v in bad.items():
                kinds[tuple(sorted(u[0] for u in v))] += 1
                if any(u[2] for u in v):
                    mount_conflicts += 1
                    if len(examples) < 8:
                        examples.append((objs, k, v))
                for u in v:
                    pair_use[u[0]] += 1

    print(f"builds analysed                       : {builds}")
    print(f"builds using both faces of a piece    : {both_faces_builds} "
          f"({both_faces_builds/builds*100:.1f}%)")
    print(f"part instances doing so               : {both_faces_instances}")
    print(f"  of which involve an ephemeral mount  : {mount_conflicts} "
          f"({mount_conflicts/max(both_faces_instances,1)*100:.1f}% of instances)")
    print(f"combination of roles on the two faces : {dict(kinds)}")
    print()
    print("joint-role counts among the violating instances:")
    for role, n in pair_use.most_common():
        print(f"  {role:8s} {n}")
    print()
    for objs, k, v in examples:
        idx, label = k
        print("-" * 70)
        print(f"entry {idx+1} = {objs[idx][0]}  piece {label}  uses: {v}")
        print(f"  raw: {json.dumps(objs[idx])}")


if __name__ == "__main__":
    main()
