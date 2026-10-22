"""Self-check pass 1: verify every numeric/table claim in RTG_BLUEPRINT_FORMAT.md
against the corpus and the repo's own tooling."""
import base64
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

CORPUS_FILE = (Path(__file__).resolve().parent.parent / "data" / "corpus" / "wiki_codes.txt")

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from blueprint import Blueprint  # noqa: E402

# Keys are STRINGS: the corpus stores socket numbers as strings ("3"), so an
# int-keyed table silently never matches and the check is dead code.
PIECE_FACES = {
    "Splitter_1": {"3": "A", "4": "A", "5": "B", "6": "B"},
    "Splitter_2": {"3": "A", "4": "A", "5": "B", "6": "B", "9": "C", "10": "C"},
    "Splitter_3": {"3": "A", "4": "A", "5": "B", "6": "B", "7": "C", "8": "C",
                   "9": "D", "10": "D"},
    "Splitter_4": {"1": "A", "2": "A", "3": "B", "4": "B", "5": "C", "6": "C",
                   "7": "D", "8": "D", "9": "E", "10": "E"},
    "Wire": {"1": "A", "2": "A", "3": "B", "4": "B"},
}

results = []


def check(label, got, want):
    ok = got == want
    results.append((ok, label, got, want))


def main():
    raw = (CORPUS_FILE).read_text(encoding="utf-8", errors="replace")
    codes = re.findall(r"W1si[A-Za-z0-9+/=]{20,}", raw)
    check("codes matched regex", len(codes), 203)
    check("codes with padding", sum(1 for c in codes if c.endswith("=")), 110)
    check("codes with whitespace",
          sum(1 for c in codes if " " in c or "\t" in c), 0)
    check("all codes start W1si",
          sum(1 for c in codes if c.startswith("W1si")), 203)

    parsed = []
    for c in codes:
        try:
            parsed.append((c, json.loads(
                base64.b64decode(c + "=" * (-len(c) % 4)))))
        except Exception:
            pass
    check("codes parsed", len(parsed), 185)

    ent = conn = fwd = oob = 0
    dbl_p = dbl_c = 0
    both_faces = 0
    mount_same = 0
    mount_partner = 0
    self_types, par_types, idx_types = Counter(), Counter(), Counter()
    props_empty = 0
    eph_list = eph_dict = 0
    eph_shapes, cframe_lens, key_styles = Counter(), Counter(), Counter()
    hosts = Counter()
    bad_det = 0
    roots_hist = Counter()
    child_sock, parent_sock = defaultdict(Counter), defaultdict(Counter)
    names = Counter()
    sizes, lens = [], []
    pairs = Counter()
    for c, objs in parsed:
        n = len(objs)
        sizes.append(n)
        lens.append(len(json.dumps(objs, separators=(",", ":"))))
        roots = 0
        pseen, cseen = set(), set()
        pieces = defaultdict(list)
        mount_sockets = defaultdict(set)
        joint_sockets = defaultdict(set)
        for i, entry in enumerate(objs):
            name, cs_list, props = entry
            names[name] += 1
            if not cs_list:
                roots += 1
            if props == []:
                props_empty += 1
            if isinstance(props, dict):
                att = props.get("EphemeralAttachments")
                if isinstance(att, list):
                    eph_list += 1
                elif isinstance(att, dict):
                    eph_dict += 1
                    for k, v in att.items():
                        eph_shapes[tuple(sorted(v.keys()))] += 1
                        key_styles[("braces" if k.startswith("{") else "plain",
                                    len(k))] += 1
                        if isinstance(v.get("cframe"), list):
                            cframe_lens[len(v["cframe"])] += 1
                            hosts[(name, v.get("partName"))] += 1
                            cf = v["cframe"]
                            m = [[cf[3], cf[4], cf[5]], [cf[6], cf[7], cf[8]],
                                 [cf[9], cf[10], cf[11]]]
                            det = (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
                                   - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                                   + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))
                            if abs(det - 1.0) > 1e-4:
                                bad_det += 1
            for cs, ps, pi in cs_list:
                self_types[type(cs).__name__] += 1
                par_types[type(ps).__name__] += 1
                idx_types[type(pi).__name__] += 1
                conn += 1
                ent += 1
                if isinstance(pi, int):
                    if pi < 1 or pi > n:
                        oob += 1
                    if pi - 1 > i:
                        fwd += 1
                    if (pi - 1, str(ps)) in pseen:
                        dbl_p += 1
                    pseen.add((pi - 1, str(ps)))
                    pn = objs[pi - 1][0]
                    parent_sock[pn][str(ps)] += 1
                    child_sock[name][str(cs)] += 1
                    pairs[(name, str(cs), pn, str(ps))] += 1
                if (i, str(cs)) in cseen:
                    dbl_c += 1
                cseen.add((i, str(cs)))
                if isinstance(ps, str) and ps.startswith("{"):
                    # an ephemeral mount consumes the socket and its piece
                    mount_sockets[i].add(str(cs))
                    continue
                joint_sockets[i].add(str(cs))
                joint_sockets[pi - 1].add(str(ps))
                # a piece belongs to ONE part instance: the child's face is
                # consumed on the child, the parent's face on the parent
                f = PIECE_FACES.get(name)
                if f and str(cs) in f:
                    pieces[(i, f[str(cs)])].append(1)
                f2 = PIECE_FACES.get(objs[pi - 1][0])
                if f2 and str(ps) in f2:
                    pieces[(pi - 1, f2[str(ps)])].append(1)
        roots_hist[roots] += 1
        both_faces += sum(1 for v in pieces.values() if len(v) > 1)
        for idx in set(mount_sockets) | set(joint_sockets):
            m = mount_sockets.get(idx, set())
            j = joint_sockets.get(idx, set())
            if m & j:
                mount_same += 1
            faces = PIECE_FACES.get(objs[idx][0])
            if faces and m and j:
                for sock in m:
                    if sock in faces:
                        partner = {s for s, l in faces.items()
                                   if l == faces[sock] and s != sock}
                        if partner & j:
                            mount_partner += 1

    check("total entries", sum(sizes), 34511)
    check("total joints", conn, 37115)
    check("forward refs", fwd, 19235)
    check("out-of-range refs", oob, 0)
    check("double parent joints", dbl_p, 0)
    check("double child joints", dbl_c, 0)
    # Using both faces of one piece with ordinary joints is NORMAL (69% of
    # real creations do it). The forbidden combinations are the mount ones.
    check("instances using both faces of one piece", both_faces, 2010)
    check("mount and joint on the same socket", mount_same, 0)
    check("mount on a face with a joint on the partner face", mount_partner, 0)
    check("self socket str", self_types["str"], 20092)
    check("self socket int", self_types["int"], 17023)
    check("parent socket str", par_types["str"], 20086)
    check("parent socket int", par_types["int"], 17029)
    check("index always int", dict(idx_types), {"int": 37115})
    check("props [] entries", props_empty, 27142)
    check("ephemeral list", eph_list, 46)
    check("ephemeral dict", eph_dict, 6)
    check("ephemeral value shape",
          dict(eph_shapes), {("cframe", "partName"): 7})
    check("cframe lengths", dict(cframe_lens), {12: 7})
    check("ephemeral key style", dict(key_styles), {("braces", 38): 7})
    check("non proper rotations", bad_det, 0)
    check("roots histogram", dict(roots_hist),
          {1: 145, 2: 34, 3: 2, 6: 2, 0: 2})
    check("min entries", min(sizes), 1)
    check("max entries", max(sizes), 2150)
    check("mean entries", round(sum(sizes) / len(sizes)), 187)
    check("min json len", min(lens), 49)
    check("max json len", max(lens), 73762)
    check("mean json len", sum(lens) // len(lens), 6758)

    # socket tables quoted in the doc
    table = {
        "Gate-AND": ({4}, {"1", "2", "3"}),
        "Gate-OR": ({4}, {"1", "2", "3"}),
        "Gate-NOT": ({4}, {"1", "2"}),
        "Switch": ({"1", "3"}, {"2"}),
        "Light": ({"1"}, set()),
        "Splitter_1": ({"3", "5"}, {"4", "6"}),
        "Splitter_2": ({"3", "5", "9"}, {"4", "6", "10"}),
        "Splitter_3": ({"3", "5", "7", "9"}, {"4", "6", "8", "10"}),
        "Splitter_4": ({"1", "3", "5", "7", "9"}, {"2", "4", "6", "8", "10"}),
        "Wire": ({"1", "3"}, {"2", "4"}),
        "Connector": ({"5"}, {"1", "2", "3", "4", "6"}),
        "Base": ({"3"}, {"1", "2", "4", "5", "6"}),
        "Anchor": ({"1"}, {"2", "3", "4", "5"}),
        "Stick": ({"2"}, {"1"}),
        "Part": ({"1"}, {"2", "3", "4", "5", "6"}),
    }
    for part, (cs, ps) in table.items():
        check(f"child sockets {part}",
              set(child_sock.get(part, {})), {str(x) for x in cs})
        check(f"parent sockets {part}",
              {s for s in parent_sock.get(part, {}) if not s.startswith("{")},
              {str(x) for x in ps})

    # quoted logic pair counts
    quoted = {
        ("Base", "3", "Base", "4"): 358,
        ("Base", "3", "Base", "2"): 83,
        ("Base", "3", "Base", "1"): 82,
        ("Splitter_2", "3", "Switch", "2"): 60,
        ("Splitter_2", "3", "Gate-AND", "1"): 44,
        ("Splitter_4", "3", "Gate-AND", "1"): 43,
        ("Wire", "3", "Gate-AND", "2"): 38,
        ("Looper", "1", "Gate-AND", "3"): 36,
        ("Wire", "1", "Gate-AND", "1"): 33,
        ("Splitter_2", "5", "Splitter_2", "4"): 33,
        ("Wire", "1", "Gate-AND", "2"): 31,
        ("Switch", "3", "Splitter_2", "4"): 26,
        ("Splitter_4", "3", "Splitter_2", "10"): 26,
        ("Splitter_1", "5", "Gate-AND", "2"): 25,
        ("Switch", "1", "Gate-AND", "1"): 23,
        ("Switch", "3", "Gate-OR", "1"): 19,
        ("Switch", "3", "Switch", "2"): 18,
        ("Gate-AND", "4", "Splitter_2", "6"): 17,
        ("Wire", "1", "Wire", "4"): 13,
    }
    for k, v in quoted.items():
        check(f"pair {k[0]}.self{k[1]}->{k[2]}.sock{k[3]}", pairs[k], v)

    # corpus part frequencies quoted in the doc
    freq = {"Connector": 11484, "Bumper": 5874, "Part": 2404,
            "ShortStick": 1546, "FuelTank": 1432, "Sledge": 1314,
            "InputSensor": 1009, "Base": 751, "Thruster": 646,
            "Canister": 474, "Bearing": 448, "Wire": 358, "MountedGun": 358,
            "RemoteButton": 291, "Splitter_2": 274, "Splitter_4": 261,
            "Grenade": 256, "Stick": 246, "BrakeLight": 239, "Gate-AND": 201,
            "Switch": 198, "Light": 119, "Splitter_3": 100, "Anchor": 73,
            "Gate-NOT": 36, "Gate-OR": 35}
    for k, v in freq.items():
        check(f"freq {k}", names[k], v)

    # prop value types quoted in the doc
    pv = Counter()
    for c, objs in parsed:
        for name, cs_list, props in objs:
            if isinstance(props, dict):
                for k, v in props.items():
                    pv[f"{k}:{type(v).__name__}"] += 1
    for k, v in {"Activated:bool": 785, "ActivationKey:str": 1007,
                 "RGB:list": 3763, "EphemeralAttachments:list": 46,
                 "EphemeralAttachments:dict": 6, "Delay:float": 100,
                 "Delay:int": 168}.items():
        check(f"prop {k}", pv[k], v)

    # hosts using ephemeral attachments
    check("eph hosts", dict(hosts),
          {("Base", "Base"): 4, ("Roof", "Glass"): 2, ("Trunk", "Door"): 1})

    # appendix B example must validate + round-trip
    ex = json.loads("""
    [["Base",[],{"EphemeralAttachments":{
       "{uuid1}":{"partName":"Base","cframe":[0,0,0,1,0,0,0,1,0,0,0,1]},
       "{uuid2}":{"partName":"Base","cframe":[2,0,0,1,0,0,0,1,0,0,0,1]}}}],
     ["Switch",[["3","{uuid1}",1]],[]],
     ["Gate-NOT",[["4","{uuid2}",1]],[]],
     ["Light",[["1","2",3]],{"Activated":true}]]
    """)
    bp = Blueprint.from_objects(ex)
    check("appendix B validate", bp.validate(strict=True), [])
    check("appendix B roots", len(bp.roots()), 1)
    check("appendix B roundtrip", json.loads(bp.dumps()), ex)
    check("appendix B base64 roundtrip",
          json.loads(base64.b64decode(bp.encode() + "=" * (-len(bp.encode()) % 4))
                     .decode()), ex)

    bad = [r for r in results if not r[0]]
    print(f"checks run: {len(results)}   failures: {len(bad)}")
    for ok, label, got, want in bad:
        print(f"  FAIL {label}: got {got!r} want {want!r}")
    print("PASS" if not bad else "FAILURES PRESENT")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
