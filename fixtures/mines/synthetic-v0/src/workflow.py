"""Data-driven workflows: the steps live in JSON, this module only EXECUTES.

A workflow file is {"name": ..., "steps": [{"do": "cook"|"note", "recipe": ...}]}.
Adding a workflow touches zero Python — that is the point (workflows are
data, not code; the mine's one deliberate architecture claim).
"""
import json
import pathlib

from .store import Store


def load_workflow(path: str) -> dict:
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def run_workflow(path: str, store: Store) -> list:
    wf = load_workflow(path)
    done = []
    for step in wf["steps"]:
        if step["do"] == "cook":
            store.cook(step["recipe"])
        elif step["do"] == "note":
            store.append("note", step.get("recipe", "pantry"))
        else:
            raise ValueError(f"unknown step do={step['do']}")
        done.append(step)
    return done
