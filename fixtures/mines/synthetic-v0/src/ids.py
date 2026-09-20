"""Deterministic ids: content-derived, no counters, no uuid, no clock."""
import hashlib


def recipe_id(name: str) -> str:
    return "r-" + hashlib.sha256(name.encode("utf-8")).hexdigest()[:10]


def event_id(seq: int, kind: str) -> str:
    return f"e-{seq:06d}-{kind}"


def index_id(name: str) -> str:
    return "i-" + hashlib.sha256(name.encode("utf-8")).hexdigest()[:10]
