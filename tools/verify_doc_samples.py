"""Self-check pass 2: (a) every base64-looking string in the spec doc,
(b) find a complete small real code containing logic parts for the appendix."""
import base64
import json
import re
import sys
from pathlib import Path

CORPUS_FILE = (Path(__file__).resolve().parent.parent / "data" / "corpus" / "wiki_codes.txt")

HERE = Path(__file__).resolve().parent
DOC = HERE.parent / "docs" / "RTG_BLUEPRINT_FORMAT.md"


def main():
    text = DOC.read_text(encoding="utf-8")
    blobs = re.findall(r"`([A-Za-z0-9+/=]{20,})`", text)
    print(f"base64-looking tokens in doc: {len(blobs)}")
    for b in blobs:
        ok = "?"
        try:
            dec = base64.b64decode(b + "=" * (-len(b) % 4))
            obj = json.loads(dec.decode("utf-8"))
            ok = f"parses, {len(obj)} entries"
        except Exception as e:
            ok = f"NOT a complete code ({type(e).__name__})"
        print(f"  {b[:26]}... len={len(b)} -> {ok}")

    raw = (CORPUS_FILE).read_text(encoding="utf-8", errors="replace")
    codes = re.findall(r"W1si[A-Za-z0-9+/=]{20,}", raw)
    best = None
    for c in codes:
        try:
            objs = json.loads(base64.b64decode(c + "=" * (-len(c) % 4)))
        except Exception:
            continue
        names = {e[0] for e in objs}
        if "Gate-AND" in names and best is None:
            best = (c, objs)
    if best:
        c, objs = best
        print("\n=== smallest real code containing a Gate-AND ===")
        print("code:", c)
        print(json.dumps(objs)[:1500])
        print("entries:", len(objs), " code len:", len(c))
        print("\n=== smallest real code overall ===")
        smallest = None
        for cc in codes:
            try:
                oo = json.loads(base64.b64decode(cc + "=" * (-len(cc) % 4)))
            except Exception:
                continue
            if smallest is None or len(oo) < len(smallest[1]):
                smallest = (cc, oo)
        print("code:", smallest[0])
        print(json.dumps(smallest[1], indent=1)[:900])
        print("entries:", len(smallest[1]), " code len:", len(smallest[0]))
    else:
        print("\nno Gate example found")

    print("\n=== fenced blocks in doc that look like sharecodes ===")
    for block in re.findall(r"```[a-z]*\n(.*?)```", text, re.S):
        for line in block.splitlines():
            tok = line.strip()
            if tok.startswith("W1si"):
                try:
                    obj = json.loads(base64.b64decode(
                        tok + "=" * (-len(tok) % 4)).decode())
                    print(f"  parses: {len(obj)} entries")
                except Exception as e:
                    print(f"  NOT a complete code: {type(e).__name__} "
                          f"(len={len(tok)})")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
