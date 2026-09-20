"""Input parsing for CLI args that can also come from workflow files."""
import json


def parse_portions(raw) -> int:
    if isinstance(raw, int) and raw >= 1:
        return raw
    raise ValueError(f"portions must be a positive int, got {raw!r}")


def parse_recipe_ref(raw) -> str:
    if isinstance(raw, str) and raw and "/" not in raw and ":" not in raw:
        return raw
    raise ValueError(f"recipe ref must be a plain id, got {raw!r}")
