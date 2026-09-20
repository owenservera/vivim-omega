#!/usr/bin/env python3
"""Check the mine's MANIFEST.json: every file's sha256 + the root hash."""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from src.hashutil import file_sha256, root_hash  # noqa: E402


def check(manifest_path: str) -> int:
    man = json.loads(pathlib.Path(manifest_path).read_text(encoding="utf-8"))
    base = pathlib.Path(manifest_path).parent
    bad = 0
    for f in man["files"]:
        p = base / f["path"]
        if not p.exists() or file_sha256(p) != f["sha256"]:
            print(f"MISMATCH {f['path']}", file=sys.stderr)
            bad += 1
    if root_hash(man["files"]) != man["rootHash"]:
        print("ROOT HASH MISMATCH", file=sys.stderr)
        bad += 1
    print(f"manifest: {man['fileCount']} files checked, {bad} bad")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(check(sys.argv[sys.argv.index("--check") + 1]))
