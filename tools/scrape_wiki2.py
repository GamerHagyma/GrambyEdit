"""Try alternate endpoints for the RTG wiki Creations page.

Writes the corpus to ../data/corpus/wiki_codes.txt (and the raw scrape to
../data/corpus/corpus_codes.txt).
"""
import re
import sys
import urllib.request
from pathlib import Path

CORPUS_DIR = Path(__file__).resolve().parent.parent / "data" / "corpus"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
BASE = "https://road-to-grambys.fandom.com"
URLS = [
    f"{BASE}/api.php?action=parse&page=Creations&prop=wikitext&format=json",
    f"{BASE}/wiki/Creations?action=raw",
    f"{BASE}/api.php?action=query&prop=revisions&titles=Creations&rvprop=content&format=json",
    "https://road-to-grambys.fandom.com/wiki/Special:Export/Creations",
]


def main():
    for url in URLS:
        req = urllib.request.Request(url, headers={
            "User-Agent": UA,
            "Accept": "text/html,application/json,*/*",
            "Accept-Language": "en-US,en;q=0.9",
        })
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                data = r.read().decode("utf-8", "replace")
        except Exception as e:
            print(f"FAIL {url[:70]} -> {e}")
            continue
        codes = set(re.findall(r"W1si[A-Za-z0-9+/=]{20,}", data))
        print(f"OK  {url[:70]} bytes={len(data)} codes={len(codes)}")
        if codes:
            CORPUS_DIR.mkdir(parents=True, exist_ok=True)
            (CORPUS_DIR / "wiki_codes.txt").write_text(
                "\n".join(sorted(codes)), encoding="utf-8")
            (CORPUS_DIR / "corpus_codes.txt").write_text(data, encoding="utf-8")
            print(f"   wrote {CORPUS_DIR / 'wiki_codes.txt'}")
            return


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
