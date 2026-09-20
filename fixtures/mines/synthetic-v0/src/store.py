"""Append-only JSONL event store + derived indexes.

The WHOLE persistence story: one events.jsonl (append-only, one JSON object
per line, a monotonically increasing integer seq), and derived index files
(one JSON doc per recipe, rebuilt from the log). No SQL, no blobs, no chain
hashes — flat files, honestly derived.
"""
import json
import pathlib

from .errors import UnknownRecipe, BadEvent
from .ids import recipe_id, event_id

REQUIRED_FIELDS = ("seq", "kind", "recipe", "at")


class Store:
    def __init__(self, cfg: dict):
        self.log_dir = pathlib.Path(cfg.get("log_dir", "log"))
        self.index_dir = pathlib.Path(cfg.get("index_dir", "indexes"))
        self.catalog = {}

    @property
    def log_path(self) -> pathlib.Path:
        return self.log_dir / "events.jsonl"

    def seed(self, seed_dir: str) -> None:
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.index_dir.mkdir(parents=True, exist_ok=True)
        if self.log_path.exists():
            raise BadEvent("store already seeded — append-only means no re-seed")
        for recipe in json.loads((pathlib.Path(seed_dir) / "recipes.json").read_text(encoding="utf-8")):
            self.append("seed", recipe["id"])

    def append(self, kind: str, recipe: str, at: str = "1970-01-01T00:00:00Z") -> dict:
        seq = self._next_seq()
        ev = {"seq": seq, "kind": kind, "recipe": recipe, "at": at}
        self._check(ev)
        with self.log_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(ev, sort_keys=True) + "\n")
        return ev

    def cook(self, recipe: str, portions: int = 1) -> dict:
        if recipe not in {r["id"] for r in self._recipes()}:
            raise UnknownRecipe(recipe)
        ev = self.append("cook", recipe)
        ev["portions"] = portions  # derived use, not persisted as separate row
        return ev

    def events(self) -> list:
        if not self.log_path.exists():
            return []
        rows = []
        for line in self.log_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rows.append(json.loads(line))
        return rows

    def list(self, what: str) -> list:
        if what == "events":
            return [json.dumps(e, sort_keys=True) for e in self.events()]
        if what == "recipes":
            return [r["id"] for r in self._recipes()]
        if what == "pantry":
            return [f"{p['item']}={p['qty']}{p['unit']}" for p in self._pantry()]
        raise BadEvent(f"cannot list {what}")

    def _next_seq(self) -> int:
        return len(self.events()) + 1

    def _check(self, ev: dict) -> None:
        for f in REQUIRED_FIELDS:
            if f not in ev:
                raise BadEvent(f"event missing {f}")
        if ev["kind"] not in ("seed", "cook", "plan", "note"):
            raise BadEvent(f"unknown kind {ev['kind']}")

    def _recipes(self) -> list:
        return json.loads((pathlib.Path("data") / "recipes.json").read_text(encoding="utf-8"))

    def _pantry(self) -> list:
        return json.loads((pathlib.Path("data") / "pantry.json").read_text(encoding="utf-8"))
