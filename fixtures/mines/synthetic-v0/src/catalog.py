"""The seed catalog: recipes + units joined for display."""
import json
import pathlib


def recipes() -> list:
    return json.loads((pathlib.Path("data") / "recipes.json").read_text(encoding="utf-8"))


def units() -> dict:
    return {u["id"]: u for u in json.loads((pathlib.Path("data") / "units.json").read_text(encoding="utf-8"))}


def pretty_qty(qty: float, unit: str) -> str:
    table = units()
    if unit not in table:
        return f"{qty} {unit}"
    u = table[unit]
    return f"{qty} {u['name']}{'s' if qty != 1 else ''}"


def tagged(tag: str) -> list:
    tags = json.loads((pathlib.Path("data") / "tags.json").read_text(encoding="utf-8"))
    ids = {t["recipe"] for t in tags if t["tag"] == tag}
    return [r for r in recipes() if r["id"] in ids]
