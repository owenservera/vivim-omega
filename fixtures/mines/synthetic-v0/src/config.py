"""Config: one small JSON file, read-only at runtime."""
import json
import pathlib


def load_config(path: str) -> dict:
    p = pathlib.Path(path)
    if not p.exists():
        return {"log_dir": "log", "index_dir": "indexes", "seed_dir": "data"}
    return json.loads(p.read_text(encoding="utf-8"))
