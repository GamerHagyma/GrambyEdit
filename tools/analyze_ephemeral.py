"""Dump the real EphemeralAttachments structures + prop value types."""
import base64
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

CORPUS_FILE = (Path(__file__).resolve().parent.parent / "data" / "corpus" / "wiki_codes.txt")

HERE = Path(__file__).resolve().parent
SRC = CORPUS_FILE


def load():
    raw = SRC.read_text(encoding="utf-8", errors="replace")
    out = []
    for c in re.findall(r"W1si[A-Za-z0-9+/=]{20,}", raw):
        try:
            out.append(json.loads(base64.b64decode(c + "=" * (-len(c) % 4))))
        except Exception:
            pass
    return out


def main():
    codes = load()
    print(f"parsed codes: {len(codes)}\n")

    shapes = Counter()
    cframe_lens = Counter()
    part_names = Counter()
    samples = []
    key_style = Counter()
    for objs in codes:
        for i, (name, conns, props) in enumerate(objs):
            if not isinstance(props, dict):
                continue
            att = props.get("EphemeralAttachments")
            if not isinstance(att, dict):
                continue
            for key, val in att.items():
                shapes[tuple(sorted(val.keys()))] += 1
                key_style[("braces" if key.startswith("{") else "plain",
                           len(key))] += 1
                if isinstance(val, dict):
                    part_names[(name, val.get("partName"))] += 1
                    cf = val.get("cframe")
                    if isinstance(cf, list):
                        cframe_lens[len(cf)] += 1
                        if len(cf) == 12 and all(
                                isinstance(x, (int, float)) for x in cf):
                            m = [[cf[3], cf[4], cf[5]],
                                 [cf[6], cf[7], cf[8]],
                                 [cf[9], cf[10], cf[11]]]
                            det = (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
                                   - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                                   + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))
                            if abs(det - 1.0) > 1e-6:
                                key_style[("nonrigid-det", round(det, 3))] += 1
            if len(samples) < 6 and att:
                samples.append((i, name, att))

    print("attachment value key-shapes:", dict(shapes))
    print("cframe array lengths:", dict(cframe_lens))
    print("key style:", dict(key_style))
    print("host partName values:", part_names.most_common(12))
    print()
    for i, name, att in samples[:3]:
        print(f"--- sample: entry {i} ({name}) ---")
        print(json.dumps(att, indent=1)[:900])
        print()

    print("=== prop value types (all parts) ===")
    types = defaultdict(Counter)
    for objs in codes:
        for name, conns, props in objs:
            if isinstance(props, dict):
                for k, v in props.items():
                    types[k][type(v).__name__] += 1
    for k in sorted(types):
        print(f"  {k:22s} {dict(types[k])}")

    print()
    print("=== props that are lists/objects (shape) ===")
    for objs in codes:
        for name, conns, props in objs:
            if isinstance(props, dict):
                for k, v in props.items():
                    if isinstance(v, list):
                        print(f"  {name}.{k} = {json.dumps(v)[:120]}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
