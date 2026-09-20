"""Queries over the event log: totals per recipe, last-cooked, rebuild."""
import json
import pathlib
import sys

from .store import Store
from .config import load_config


def totals(store: Store) -> dict:
    out = {}
    for ev in store.events():
        if ev["kind"] == "cook":
            out[ev["recipe"]] = out.get(ev["recipe"], 0) + 1
    return out


def last_cooked(store: Store) -> dict:
    last = {}
    for ev in store.events():
        if ev["kind"] == "cook":
            last[ev["recipe"]] = ev["seq"]
    return last


def rebuild_indexes(store: Store, check: bool = False) -> int:
    """Re-derive one index doc per cooked recipe; with --check, fail on drift."""
    wrote = 0
    for recipe, count in sorted(totals(store).items()):
        doc = {"recipe": recipe, "cooked": count, "last_seq": last_cooked(store)[recipe]}
        path = store.index_dir / f"{recipe}.json"
        text = json.dumps(doc, sort_keys=True, indent=2) + "\n"
        if check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                print(f"index drift: {path}", file=sys.stderr)
                return 1
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
        wrote += 1
    return wrote


if __name__ == "__main__":
    store = Store(load_config("data/config.json"))
    if "--rebuild-indexes" in sys.argv:
        n = rebuild_indexes(store, check="--check" in sys.argv)
        print(f"indexes: {n}")
