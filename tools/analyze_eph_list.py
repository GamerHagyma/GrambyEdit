"""How does the game serialize EphemeralAttachments as a LIST vs dict?"""
import base64
import json
import re
import sys
from collections import Counter
from pathlib import Path

CORPUS_FILE = (Path(__file__).resolve().parent.parent / "data" / "corpus" / "wiki_codes.txt")

HERE = Path(__file__).resolve().parent


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
    shapes = Counter()
    samples = []
    for objs in codes:
        for i, (name, conns, props) in enumerate(objs):
            if not isinstance(props, dict):
                continue
            att = props.get("EphemeralAttachments")
            if isinstance(att, list):
                shapes[("list", len(att), type(att[0]).__name__ if att else "-")] += 1
                if len(samples) < 2:
                    samples.append((name, att))
            elif isinstance(att, dict):
                shapes[("dict", len(att))] += 1
    print("shapes:", dict(shapes))
    for name, att in samples:
        print(f"\n--- list sample on {name} ---")
        print(json.dumps(att)[:1200])


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
