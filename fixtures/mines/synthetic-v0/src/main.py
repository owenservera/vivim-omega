"""pantrylog CLI. Subcommands: init, add, cook, plan, list, render."""
import argparse
import sys

from .config import load_config
from .store import Store
from .workflow import run_workflow
from .render import render_all


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="pantrylog", description="offline kitchen log")
    sub = p.add_subparsers(dest="cmd", required=True)

    init = sub.add_parser("init", help="init the store from seed data")
    init.add_argument("--seed", default="data")

    cook = sub.add_parser("cook", help="record cooking a recipe")
    cook.add_argument("recipe")
    cook.add_argument("--portions", type=int, default=1)

    plan = sub.add_parser("plan", help="run a data-driven workflow")
    plan.add_argument("name")
    plan.add_argument("--workflow", required=True)

    lst = sub.add_parser("list", help="list recipes or events")
    lst.add_argument("what", choices=["recipes", "events", "pantry"])

    sub.add_parser("render", help="render the log to markdown")

    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    cfg = load_config("data/config.json")
    store = Store(cfg)
    if args.cmd == "init":
        store.seed(args.seed)
        print("seeded")
    elif args.cmd == "cook":
        ev = store.cook(args.recipe, args.portions)
        print(f"cooked {ev['recipe']} seq={ev['seq']}")
    elif args.cmd == "plan":
        steps = run_workflow(args.workflow, store)
        print(f"workflow {args.name}: {len(steps)} steps done")
    elif args.cmd == "list":
        for row in store.list(args.what):
            print(row)
    elif args.cmd == "render":
        render_all(store, "docs/generated.md")
        print("rendered")
    return 0


if __name__ == "__main__":
    sys.exit(main())
