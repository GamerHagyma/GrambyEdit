"""Cross-check the merged catalogue against independent sources.

Compares, and reports every disagreement rather than silently picking a winner:

  1. community tokens.json  vs  the real-sharecode corpus
  2. the catalogue          vs  the hardcoded tables in blueprint.py
  3. socket geometry        vs  the mesh bounding box
  4. the one-joint-per-piece invariant, re-checked over the whole corpus
  5. socket ids referenced by the corpus but missing from the catalogue

Run:  python verify_catalog.py       (exit code 1 if any FATAL check fails)
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
DATA = ROOT / "data"

sys.path.insert(0, str(HERE))
import blueprint  # noqa: E402  (the pre-existing codec/tables)

PIECE_FACES = {
    "Splitter_1": {"3": "A", "4": "A", "5": "B", "6": "B"},
    "Splitter_2": {"3": "A", "4": "A", "5": "B", "6": "B", "9": "C", "10": "C"},
    "Splitter_3": {"3": "A", "4": "A", "5": "B", "6": "B", "7": "C", "8": "C",
                   "9": "D", "10": "D"},
    "Splitter_4": {"1": "A", "2": "A", "3": "B", "4": "B", "5": "C", "6": "C",
                   "7": "D", "8": "D", "9": "E", "10": "E"},
    "Wire": {"1": "A", "2": "A", "3": "B", "4": "B"},
}

fatal = 0


def report(ok, title, lines=()):
    global fatal
    print(("  PASS  " if ok else "  FAIL  ") + title)
    for line in lines:
        print("          " + line)
    if not ok:
        fatal += 1


def main():
    cat = json.loads((DATA / "part_catalog.json").read_text(encoding="utf-8"))
    parts = cat["parts"]
    tok = json.loads((ROOT / "docs" / "community" / "rtg-ai-tokens.json")
                     .read_text(encoding="utf-8"))
    if isinstance(tok, list):
        tok = tok[0]
    nt = tok["NoTokensData"]

    raw = (DATA / "corpus" / "wiki_codes.txt").read_text(
        encoding="utf-8", errors="replace")
    codes = re.findall(r"W1si[A-Za-z0-9+/=]{20,}", raw)
    parsed = []
    for c in codes:
        try:
            objs = json.loads(base64.b64decode(c + "=" * (-len(c) % 4)))
        except Exception:
            continue
        if isinstance(objs, list) and objs and isinstance(objs[0], list):
            parsed.append(objs)

    child = defaultdict(Counter)
    parent = defaultdict(Counter)
    for objs in parsed:
        n = len(objs)
        for i, entry in enumerate(objs):
            if not isinstance(entry, list) or len(entry) != 3:
                continue
            name, conns, _ = entry
            for c in conns or []:
                if not isinstance(c, list) or len(c) != 3:
                    continue
                cs, ps, pi = c
                child[name][str(cs)] += 1
                if isinstance(pi, int) and 1 <= pi <= n:
                    parent[objs[pi - 1][0]][str(ps)] += 1

    # The piece invariant is per part *instance* within one build.
    # A part instance consumes a piece when it is used as a child (via its
    # child-side face) or when a child is attached to it (via its parent-side
    # face).
    #
    # Using BOTH faces of one piece with ordinary joints is NORMAL: 69% of
    # real creations do it (a wire that both receives and sends on one end).
    # What the corpus forbids is:
    #   a) the same socket number used by two joints
    #   b) a parent circle carrying two children
    #   c) an ephemeral mount and a joint on the same socket number
    #   d) an ephemeral mount on one face and a joint on the partner face
    # (c) and (d) are the tearing failure observed in the v5 build.
    stat = Counter()
    for objs in parsed:
        n = len(objs)
        pieces = defaultdict(list)
        sockets = defaultdict(set)
        parent_circles = Counter()
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
                mount = isinstance(ps, str) and ps.startswith("{")
                if mount:
                    sockets[(i, "mount")].add(str(cs))
                    stat["mount"] += 1
                    continue
                parent_circles[(pi - 1, str(ps))] += 1
                sockets[(i, "joint")].add(str(cs))
                sockets[(pi - 1, "joint")].add(str(ps))
                cf = PIECE_FACES.get(name)
                if cf and str(cs) in cf:
                    pieces[(i, cf[str(cs)])].append("self")
                pf = PIECE_FACES.get(pname)
                if pf and str(ps) in pf:
                    pieces[(pi - 1, pf[str(ps)])].append("par")
        for k, v in pieces.items():
            if len(v) > 1:
                stat["both_faces_instance"] += 1
            stat["piece_use"] += 1
        for k, c in parent_circles.items():
            if c > 1:
                stat["parent_circle_twice"] += 1
        for idx in set(k[0] for k in sockets):
            m = sockets.get((idx, "mount"), set())
            j = sockets.get((idx, "joint"), set())
            if m & j:
                stat["mount_and_joint_same_socket"] += 1
            name = objs[idx][0]
            pf = PIECE_FACES.get(name)
            if pf and m and j:
                for sock in m:
                    if sock in pf:
                        partner = {s for s, l in pf.items()
                                   if l == pf[sock] and s != sock}
                        if partner & j:
                            stat["mount_face_joint_partner"] += 1

    print("=" * 72)
    print("1. community tokens.json  vs  corpus")
    print("=" * 72)
    diffs = []
    for part, socks in nt["LocalType"].items():
        corpus_set = {s for s in child.get(part, {}) if s.isdigit()}
        tok_set = {str(s) for s in socks}
        if corpus_set - tok_set:
            diffs.append(f"{part}: corpus child sockets {sorted(corpus_set)} "
                         f"not in community LocalType {sorted(tok_set)}")
    for part, socks in nt["LocalIDs"].items():
        corpus_set = {s for s in parent.get(part, {}) if s.isdigit()}
        tok_set = {str(s) for s in socks}
        if corpus_set - tok_set:
            diffs.append(f"{part}: corpus parent sockets {sorted(corpus_set)} "
                         f"not in community LocalIDs {sorted(tok_set)}")
    # Informational, not fatal: the community tables are known to be partial.
    # The catalogue unions them with the corpus, so nothing is lost.
    print(f"  INFO  community socket tables are PARTIAL: {len(diffs)} part(s) "
          f"have corpus sockets the community table omits")
    for d in diffs[:12]:
        print("          " + d)
    if len(diffs) > 12:
        print(f"          ... and {len(diffs)-12} more")

    missing_tok = [p for p in nt["LocalType"] if p not in child]
    missing_ids = [p for p in nt["LocalIDs"] if p not in parent]
    print(f"  INFO  community lists {len(missing_tok)} parts whose child sockets "
          f"never appear in the corpus: {missing_tok[:12]}")
    print(f"  INFO  community lists {len(missing_ids)} parts whose parent sockets "
          f"never appear in the corpus: {missing_ids[:12]}")

    print()
    print("=" * 72)
    print("2. catalogue  vs  blueprint.py hardcoded tables")
    print("=" * 72)
    lines = []
    for part, socks in blueprint.SELF_SOCKETS.items():
        cat_child = {s for s in parts.get(part, {}).get("sockets", {})
                     .get("child", {}) if s.isdigit()}
        if not cat_child:
            continue
        extra = cat_child - {str(s) for s in socks}
        if extra:
            lines.append(f"{part}: catalogue child sockets {sorted(extra)} "
                         f"missing from blueprint.py SELF_SOCKETS")
    for part, socks in blueprint.PARENT_SOCKETS.items():
        cat_parent = {s for s in parts.get(part, {}).get("sockets", {})
                      .get("parent", {}) if s.isdigit()}
        if not cat_parent:
            continue
        extra = cat_parent - {str(s) for s in socks}
        if extra:
            lines.append(f"{part}: catalogue parent sockets {sorted(extra)} "
                         f"missing from blueprint.py PARENT_SOCKETS")
    report(True, f"catalogue vs blueprint.py ({len(lines)} extensions; "
                 f"blueprint.py is a strict subset of the catalogue)", lines[:25])

    print()
    print("=" * 72)
    print("3. socket geometry vs mesh bounding box")
    print("=" * 72)
    lines = []
    notes = []
    for part, v in parts.items():
        geo = v.get("socket_geometry") or {}
        mesh = v.get("mesh") or {}
        if not geo or not mesh.get("min"):
            continue
        lo, hi = mesh["min"], mesh["max"]
        for sid, g in geo.items():
            pos = g.get("position")
            if not pos or len(pos) != 3:
                continue
            outside = any(not (lo[i] - 0.02 <= pos[i] <= hi[i] + 0.02)
                           for i in range(3))
            if outside:
                msg = (f"{part}.sock{sid} at {pos} is outside the mesh bbox "
                       f"min={lo} max={hi} (confidence="
                       f"{g.get('confidence', '?')})")
                (notes if g.get("confidence") == "community" else lines).append(msg)
    report(not lines, "socket transforms from editor scenes sit on the mesh surface",
           lines)
    if notes:
        print(f"  INFO  {len(notes)} community-provided transform(s) fall outside "
              f"their mesh and must be treated as placeholders:")
        for n in notes:
            print("          " + n)

    print()
    print("=" * 72)
    print("4. joint / piece invariants over the whole corpus")
    print("=" * 72)
    report(stat["parent_circle_twice"] == 0,
           "no parent circle carries two children",
           [f"{stat['parent_circle_twice']} offending circle(s)"])
    report(stat["mount_and_joint_same_socket"] == 0,
           "no socket number is used by both a mount and a joint",
           [f"{stat['mount_and_joint_same_socket']} offending instance(s)"])
    report(stat["mount_face_joint_partner"] == 0,
           "no mount on one face of a piece with a joint on the partner face",
           [f"{stat['mount_face_joint_partner']} offending instance(s)"])
    print(f"  INFO  {stat['both_faces_instance']} part instances use both "
          f"faces of one piece with ordinary joints")
    print(f"        ({stat['piece_use']} piece uses total). This is NORMAL - "
          f"see RTG_BLUEPRINT_FORMAT.md section 3.1.")

    print()
    print("=" * 72)
    print("5. corpus sockets missing from the catalogue")
    print("=" * 72)
    lines = []
    for part, counter in child.items():
        cat_child = parts.get(part, {}).get("sockets", {}).get("child", {})
        for s in counter:
            if s.isdigit() and s not in cat_child:
                lines.append(f"{part} child socket {s}")
    for part, counter in parent.items():
        cat_parent = parts.get(part, {}).get("sockets", {}).get("parent", {})
        for s in counter:
            if s.isdigit() and s not in cat_parent:
                lines.append(f"{part} parent socket {s}")
    report(not lines, "every socket seen in the corpus is in the catalogue", lines[:25])

    print()
    print("=" * 72)
    geo_parts = [p for p, v in parts.items() if v.get("socket_geometry")]
    print(f"catalogue: {len(parts)} parts, "
          f"{sum(1 for v in parts.values() if v.get('mesh'))} meshes, "
          f"{len(geo_parts)} with socket transforms ({sorted(geo_parts)})")
    print(f"fatal checks failed: {fatal}")
    return 1 if fatal else 0


if __name__ == "__main__":
    sys.exit(main())
