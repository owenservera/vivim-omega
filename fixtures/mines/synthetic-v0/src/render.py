"""Render the log + catalog to a single markdown doc."""
import pathlib

from .query import totals, last_cooked


def render_all(store, out_path: str) -> str:
    lines = ["# pantrylog — rendered log", ""]
    for recipe, count in sorted(totals(store).items()):
        lines.append(f"- {recipe}: cooked {count}x (last event seq {last_cooked(store)[recipe]})")
    text = "\n".join(lines) + "\n"
    pathlib.Path(out_path).write_text(text, encoding="utf-8")
    return text
