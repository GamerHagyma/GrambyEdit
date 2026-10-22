"""Logic-part focused statistics for the format document."""
import base64
import json
import re
import sys
from collections import Counter
from pathlib import Path

CORPUS_FILE = (Path(__file__).resolve().parent.parent / "data" / "corpus" / "wiki_codes.txt")

HERE = Path(__file__).resolve().parent
LOGIC = {"Gate-AND", "Gate-OR", "Gate-NOT", "Splitter_1", "Splitter_2",
         "Splitter_3", "Splitter_4", "Switch", "Wire", "Light", "BrakeLight",
         "Anchor", "Base", "Looper", "Delayer"}


def load():
    raw = (CORPUS_FILE).read_text(encoding="utf-8", errors="replace")
    out = []
    for c in re.findall(r"W1si[A-Za-z0-9+/=]{20,}", raw):
        try:
            out.append(json.loads(base64.b64decode(c + "=" * (-len(c) % 4))))
        except Exception:
            pass
    return out


def main():
    codes = load()
    pairs = Counter()
    lens = []
    sizes = []
    base_root = 0
    eph_users = Counter()
    for objs in codes:
        sizes.append(len(objs))
        lens.append(len(json.dumps(objs, separators=(",", ":"))))
        if objs and objs[0][0] == "Base":
            base_root += 1
        for i, (name, conns, props) in enumerate(objs):
            if isinstance(props, dict) and isinstance(
                    props.get("EphemeralAttachments"), dict):
                eph_users[name] += 1
            for cs, ps, pi in conns:
                if not isinstance(pi, int) or not (1 <= pi <= len(objs)):
                    continue
                pn = objs[pi - 1][0]
                if name in LOGIC and pn in LOGIC:
                    pairs[(name, str(cs), pn, str(ps))] += 1
    print("codes:", len(codes))
    print("entries per code: min %d max %d mean %.0f" %
          (min(sizes), max(sizes), sum(sizes) / len(sizes)))
    print("json length per code: min %d max %d mean %d" %
          (min(lens), max(lens), sum(lens) // len(lens)))
    print("codes whose FIRST entry is Base:", base_root)
    print("hosts using EphemeralAttachments:", dict(eph_users))
    print()
    print("=== logic->logic pairs (child.name.self -> parent.name.sock) ===")
    for (c, cs, p, ps), v in pairs.most_common(200):
        print(f"  {v:5d}  {c}.self{cs} -> {p}.sock{ps}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
