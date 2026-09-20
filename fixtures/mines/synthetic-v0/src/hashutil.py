"""sha256 helpers shared by tools/hash.py and the determinism drill."""
import hashlib
import pathlib


def file_sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def root_hash(files: list) -> str:
    joined = "\n".join(f"{f['path']}:{f['sha256']}" for f in files)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()
