"""Look at the raw decoded head/tail of real codes (structure sanity check)."""
import base64
import re
import sys
from pathlib import Path

CORPUS_FILE = (Path(__file__).resolve().parent.parent / "data" / "corpus" / "wiki_codes.txt")

HERE = Path(__file__).resolve().parent


def main():
    raw = (CORPUS_FILE).read_text(encoding="utf-8", errors="replace")
    codes = re.findall(r"W1si[A-Za-z0-9+/=]{20,}", raw)
    for c in codes[:4]:
        try:
            dec = base64.b64decode(c + "=" * (-len(c) % 4))
        except Exception as exc:
            # a few scraped codes carry a truncated base64 body
            print(f"code: {c[:28]} ... -> undecodable ({type(exc).__name__})")
            continue
        print("code:", c[:28], "...")
        print("  decoded head:", dec[:120])
        print("  decoded tail:", dec[-60:])
        print()
    # how many start with the literal prefix 'W1si'
    print("codes starting with W1si:", sum(1 for c in codes if c.startswith("W1si")),
          "/", len(codes))
    heads = Counter()
    for c in codes:
        dec = base64.b64decode(c + "=" * (-len(c) % 4))
        heads[dec[:6]] += 1
    print("distinct decoded heads:", heads.most_common(8))


if __name__ == "__main__":
    from collections import Counter
    sys.stdout.reconfigure(encoding="utf-8")
    main()
