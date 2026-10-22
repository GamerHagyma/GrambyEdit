"""Re-derive RTG blueprint format facts from the scraped corpus of real codes.

Read-only analysis. Prints authoritative tables for the format document.
"""
import base64
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "corpus" / "wiki_codes.txt"

# child/parent socket numbers that are the two faces of one physical piece.
# Keys are STRINGS: the corpus stores socket numbers as strings ("3"), so an
# int-keyed table silently never matches and the whole check is dead code.
PIECE_FACES = {
    "Splitter_1": {"3": "A", "4": "A", "5": "B", "6": "B"},
    "Splitter_2": {"3": "A", "4": "A", "5": "B", "6": "B", "9": "C", "10": "C"},
    "Splitter_3": {"3": "A", "4": "A", "5": "B", "6": "B", "7": "C", "8": "C",
                   "9": "D", "10": "D"},
    "Splitter_4": {"1": "A", "2": "A", "3": "B", "4": "B", "5": "C", "6": "C",
                   "7": "D", "8": "D", "9": "E", "10": "E"},
    "Wire": {"1": "A", "2": "A", "3": "B", "4": "B"},
}


def load_codes():
    raw = RAW.read_text(encoding="utf-8", errors="replace")
    codes = re.findall(r"W1si[A-Za-z0-9+/=]{20,}", raw)
    out = []
    for c in codes:
        try:
            objs = json.loads(base64.b64decode(c + "=" * (-len(c) % 4)))
            out.append((c, objs))
        except Exception:
            pass
    return codes, out


def main():
    codes, parsed = load_codes()
    print(f"codes matched by regex : {len(codes)}")
    print(f"codes that parse        : {len(parsed)}")
    pad = sum(1 for c in codes if c.endswith("="))
    print(f"with '=' padding        : {pad}/{len(codes)}")
    print(f"contains whitespace     : "
          f"{sum(1 for c in codes if ' ' in c or '\\t' in c)}")

    ent_counts, root_counts, conn_counts = [], [], []
    types = Counter()
    props_keys = defaultdict(Counter)
    props_vals = defaultdict(Counter)
    child_sock = defaultdict(Counter)
    parent_sock = defaultdict(Counter)
    pair_counts = Counter()
    part_names = Counter()
    fwd_refs = 0
    tot_refs = 0
    oob = 0
    nonint_ref = 0
    dbl_parent = dbl_child = 0
    both_faces = 0          # instances using both faces of one piece (NORMAL)
    mount_same_socket = 0   # mount and joint on the same socket number
    mount_partner = 0       # mount on one face, joint on the partner face
    eph = 0
    empty_props = 0
    props_is_list = 0

    for code, objs in parsed:
        if not isinstance(objs, list):
            continue
        n = len(objs)
        ent_counts.append(n)
        roots = 0
        conns_total = 0
        pseen, cseen = set(), set()
        pieces = defaultdict(list)
        mount_sockets = defaultdict(set)
        joint_sockets = defaultdict(set)
        for i, entry in enumerate(objs):
            if not isinstance(entry, list) or len(entry) != 3:
                continue
            name, conns, props = entry
            part_names[name] += 1
            if not conns:
                roots += 1
            conns_total += len(conns)
            if props == []:
                empty_props += 1
            if isinstance(props, list):
                props_is_list += 1
            if isinstance(props, dict):
                for k, v in props.items():
                    props_keys[name][k] += 1
                    props_vals[name][f"{k}:{type(v).__name__}"] += 1
                if "EphemeralAttachments" in props:
                    eph += 1
            for c in conns:
                if not isinstance(c, list) or len(c) != 3:
                    continue
                cs, ps, pi = c
                types[f"self:{type(cs).__name__}"] += 1
                types[f"par:{type(ps).__name__}"] += 1
                types[f"idx:{type(pi).__name__}"] += 1
                if isinstance(pi, int):
                    tot_refs += 1
                    if pi < 1 or pi > n:
                        oob += 1
                    if pi - 1 > i:
                        fwd_refs += 1
                    if (pi - 1, str(ps)) in pseen:
                        dbl_parent += 1
                    pseen.add((pi - 1, str(ps)))
                else:
                    nonint_ref += 1
                if (i, str(cs)) in cseen:
                    dbl_child += 1
                cseen.add((i, str(cs)))
                child_sock[name][str(cs)] += 1
                if isinstance(ps, str) and ps.startswith("{"):
                    # ephemeral mount: it consumes the socket and its piece
                    mount_sockets[i].add(str(cs))
                    continue
                if isinstance(pi, int) and 1 <= pi <= n:
                    pname = objs[pi - 1][0]
                    parent_sock[pname][str(ps)] += 1
                    pair_counts[(name, str(cs), pname, str(ps))] += 1
                    joint_sockets[i].add(str(cs))
                    joint_sockets[pi - 1].add(str(ps))
                    # a piece belongs to ONE part instance; the child's face
                    # and the parent's face are consumed on their own parts
                    faces = PIECE_FACES.get(name)
                    if faces and str(cs) in faces:
                        pieces[(i, faces[str(cs)])].append("self")
                    faces2 = PIECE_FACES.get(pname)
                    if faces2 and str(ps) in faces2:
                        pieces[(pi - 1, faces2[str(ps)])].append("par")
        for k, v in pieces.items():
            if len(v) > 1:
                both_faces += 1
        for idx in set(mount_sockets) | set(joint_sockets):
            m = mount_sockets.get(idx, set())
            j = joint_sockets.get(idx, set())
            if m & j:
                mount_same_socket += 1
            faces = PIECE_FACES.get(objs[idx][0])
            if faces and m and j:
                for sock in m:
                    if sock in faces:
                        partner = {s for s, l in faces.items()
                                   if l == faces[sock] and s != sock}
                        if partner & j:
                            mount_partner += 1
        root_counts.append(roots)
        conn_counts.append(conns_total)

    print()
    print(f"entries per code : min={min(ent_counts)} max={max(ent_counts)} "
          f"mean={sum(ent_counts)/len(ent_counts):.1f} "
          f"total={sum(ent_counts)}")
    print(f"roots per code   : {Counter(root_counts).most_common()}")
    print(f"connections total: {sum(conn_counts)}")
    print(f"parent refs      : {tot_refs} (forward refs {fwd_refs}, "
          f"out-of-range {oob}, non-int refs {nonint_ref})")
    print(f"double joints    : parent-side {dbl_parent}, child-side "
          f"{dbl_child}")
    print(f"piece usage      : {both_faces} instance(s) use both faces of one "
          f"piece (NORMAL - see spec 3.1)")
    print(f"mount conflicts  : same socket {mount_same_socket}, "
          f"partner face {mount_partner}")
    print(f"props [] entries : {empty_props}; props-as-list {props_is_list}; "
          f"entries with EphemeralAttachments {eph}")
    print(f"field types      : {dict(types)}")
    print()
    print("=== part inventory ===")
    for name, c in part_names.most_common():
        print(f"  {name:18s} {c}")
    print()
    print("=== observed child sockets (self_socket) per part ===")
    for name in sorted(child_sock):
        if part_names[name] >= 3:
            items = ", ".join(f"{k}:{v}" for k, v in
                              sorted(child_sock[name].items(),
                                     key=lambda kv: int(kv[0])
                                     if kv[0].isdigit() else 0))
            print(f"  {name:18s} {items}")
    print()
    print("=== observed parent sockets (parent_socket) per part ===")
    for name in sorted(parent_sock):
        if part_names[name] >= 3:
            items = ", ".join(f"{k}:{v}" for k, v in
                              sorted(parent_sock[name].items(),
                                     key=lambda kv: int(kv[0])
                                     if kv[0].isdigit() else 0))
            print(f"  {name:18s} {items}")
    print()
    print("=== props keys per part ===")
    for name in sorted(props_keys):
        if props_keys[name]:
            print(f"  {name:18s} {dict(props_keys[name])}")
    print()
    print("=== props value types ===")
    for name in sorted(props_vals):
        if props_vals[name]:
            print(f"  {name:18s} {dict(props_vals[name])}")
    print()
    print("=== top 45 child->parent pairs ===")
    for k, v in pair_counts.most_common(45):
        print(f"  {v:6d}  {k[0]}.self{k[1]} -> {k[2]}.sock{k[3]}")


if __name__ == "__main__":
    main()
